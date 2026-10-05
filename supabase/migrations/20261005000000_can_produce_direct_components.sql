-- STORY-068: completing an order consumed every BOM level instead of only
-- the direct components.
--
-- can_produce walked the whole BOM recursively and complete_production_order
-- consumed every item it returned. Building 4 bikes (bike -> 1 frame ->
-- 4 bolts) deducted 4 frames AND 16 bolts, although those bolts had already
-- been consumed when the frames were produced -- bolt stock was counted
-- twice.
--
-- Every item is a real, stocked item (the "Russian doll" in CLAUDE.md): a
-- sub-assembly is built by its own production order and then sits in stock.
-- So an order consumes only its item's direct BOM lines. Looking *through*
-- a sub-assembly (phantom sets) is a separate, opt-in feature (STORY-069).
--
-- The return type gains a column, so the function must be dropped first
-- (CREATE OR REPLACE can't change a function's OUT columns).
drop function if exists can_produce(uuid, numeric, uuid);

-- Direct components of p_item_id for p_quantity units, with stock and
-- shortfall. For a short component that has its own BOM,
-- buildable_from_stock says how many of it could be built right now from
-- *its* direct components' stock (one level down, not further); null
-- otherwise. Rounded down to whole units: you can't build 2.5 frames. An
-- item without BOM lines returns no rows.
create function can_produce(
  p_item_id uuid,
  p_quantity numeric,
  p_tenant_id uuid
)
returns table(
  item_id uuid,
  required numeric,
  available numeric,
  shortfall numeric,
  buildable_from_stock numeric
)
language sql
stable
as $$
  with stock as (
    select sl.item_id, sum(sl.quantity_delta) as qty
    from stock_ledger sl
    where sl.tenant_id = p_tenant_id
    group by sl.item_id
  ),
  direct as (
    select bl.child_item_id as item_id, sum(bl.quantity) * p_quantity as required
    from bom_lines bl
    where bl.parent_item_id = p_item_id and bl.tenant_id = p_tenant_id
    group by bl.child_item_id
  ),
  checked as (
    select d.item_id, d.required,
           coalesce(s.qty, 0) as available,
           greatest(0, d.required - coalesce(s.qty, 0)) as shortfall
    from direct d
    left join stock s on s.item_id = d.item_id
  )
  select c.item_id, c.required, c.available, c.shortfall,
         case when c.shortfall > 0 then (
           -- min over the component's own direct lines; null when it has none
           select floor(min(greatest(0, coalesce(s2.qty, 0)) / bl2.quantity))
           from bom_lines bl2
           left join stock s2 on s2.item_id = bl2.child_item_id
           where bl2.parent_item_id = c.item_id and bl2.tenant_id = p_tenant_id
         ) end as buildable_from_stock
  from checked c
  where c.required > 0;
$$;

-- Same as 20260926000000_stock_lock_helper.sql, except that 409 shortfalls
-- now also carry buildable_from_stock (left out when null, so components
-- without their own BOM keep the old shape). Because can_produce now only
-- returns direct components, the STORY-043 locks are taken on exactly the
-- items this order consumes.
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
      v_shortfalls := v_shortfalls || jsonb_strip_nulls(jsonb_build_object(
        'item_id', v_component.item_id,
        'required', v_component.required,
        'available', v_component.available,
        'shortfall', v_component.shortfall,
        'buildable_from_stock', v_component.buildable_from_stock
      ));
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
