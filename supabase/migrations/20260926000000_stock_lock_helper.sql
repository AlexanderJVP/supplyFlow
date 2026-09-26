-- STORY-043: concurrent production order completions could drive stock
-- negative.
--
-- complete_production_order took FOR UPDATE on the production_orders row
-- only. Component stock is a derived SUM over stock_ledger, so there was no
-- physical row protecting it: two completions consuming the same component
-- could both pass the shortfall check and jointly overdraw it.
--
-- Fix: a shared, transaction-scoped advisory-lock scheme keyed on the stock
-- being touched. This is the first use of advisory locks in this codebase;
-- move_stock (STORY-038), reserve_stock (STORY-035) and post_stock_count
-- (STORY-053) must reuse these two helpers rather than invent their own
-- keys (see ADR-001 amendment and ADR-002).
--
-- Scope of protection: this only serializes RPCs that take these locks
-- against each other. Direct stock_ledger writes that bypass them (e.g. a
-- manual adjustment) are not blocked -- same as ADR-002 states for
-- move_stock.

-- One bigint per (tenant, item, location). pg_advisory_xact_lock takes a
-- single bigint, so the composite key is hashed. The 'stock:' prefix
-- namespaces these keys away from any future, unrelated advisory-lock use
-- (advisory locks share one global namespace per database). A hash
-- collision is harmless: it can only make two unrelated keys serialize.
create or replace function stock_lock_key(
  p_tenant_id uuid,
  p_item_id uuid,
  p_location_id uuid default null
)
returns bigint
language sql
immutable
as $$
  select hashtextextended(
    'stock:' || p_tenant_id::text || ':' || p_item_id::text || ':'
      || coalesce(p_location_id::text, ''),
    0
  );
$$;

-- Acquire the stock locks for a set of items, deduplicated and in a fixed
-- order, so two callers locking overlapping sets can't deadlock. The order
-- is the full composite key (tenant_id, item_id, location_id); with one
-- tenant and one location per call that reduces to item_id order. If a
-- future caller needs several locations in one call, extend this to take
-- (item_id, location_id) pairs and sort by the pair -- never sort by
-- location_id alone. Locks are released automatically at commit/rollback.
create or replace function lock_stock_keys(
  p_tenant_id uuid,
  p_item_ids uuid[],
  p_location_id uuid default null
)
returns void
language plpgsql
as $$
declare
  v_item_id uuid;
begin
  for v_item_id in
    select distinct t.item_id
    from unnest(p_item_ids) as t(item_id)
    where t.item_id is not null
    order by t.item_id
  loop
    perform pg_advisory_xact_lock(
      stock_lock_key(p_tenant_id, v_item_id, p_location_id)
    );
  end loop;
end;
$$;

create or replace function complete_production_order(
  p_production_order_id uuid,
  p_tenant_id uuid,
  p_user_id uuid
)
returns production_orders
language plpgsql
as $$
declare
  v_order production_orders%rowtype;
  v_component record;
  v_component_ids uuid[];
  v_shortfalls jsonb := '[]'::jsonb;
begin
  select * into v_order
  from production_orders
  where id = p_production_order_id and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Production order not found';
  end if;

  if v_order.status = 'completed' then
    raise exception 'Production order is already completed';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Cannot complete a cancelled production order';
  end if;

  -- 1. Find which items this order consumes, then lock them. The stock
  --    numbers from this call are deliberately ignored: they were read
  --    before we held the locks.
  select array_agg(c.item_id) into v_component_ids
  from can_produce(v_order.item_id, v_order.quantity, p_tenant_id) as c;

  perform lock_stock_keys(p_tenant_id, v_component_ids);

  -- 2. Re-read stock in a new statement. Under READ COMMITTED each
  --    statement in this (volatile) function takes a fresh snapshot, so this
  --    sees everything committed by a competing completion that held the
  --    same locks before us.
  for v_component in
    select * from can_produce(v_order.item_id, v_order.quantity, p_tenant_id)
    order by item_id
  loop
    if v_component.shortfall > 0 then
      v_shortfalls := v_shortfalls || jsonb_build_object(
        'item_id', v_component.item_id,
        'required', v_component.required,
        'available', v_component.available,
        'shortfall', v_component.shortfall
      );
    else
      insert into stock_ledger (
        tenant_id, item_id, quantity_delta, reason, reference_type, reference_id, user_id
      ) values (
        p_tenant_id, v_component.item_id, -v_component.required, 'consumed',
        'production_order', p_production_order_id, p_user_id
      );
    end if;
  end loop;

  -- Report every short component at once, not just the first. Raising rolls
  -- back the whole transaction, including any ledger rows inserted above,
  -- and leaves the order's status unchanged. SQLSTATE SK409 is this
  -- project's "insufficient stock" code; the API maps it to HTTP 409 and
  -- DETAIL carries the shortfalls as JSON.
  if jsonb_array_length(v_shortfalls) > 0 then
    raise exception 'Insufficient stock to complete production order'
      using errcode = 'SK409', detail = v_shortfalls::text;
  end if;

  insert into stock_ledger (
    tenant_id, item_id, quantity_delta, reason, reference_type, reference_id, user_id
  ) values (
    p_tenant_id, v_order.item_id, v_order.quantity, 'produced',
    'production_order', p_production_order_id, p_user_id
  );

  update production_orders
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = p_production_order_id
  returning * into v_order;

  return v_order;
end;
$$;
