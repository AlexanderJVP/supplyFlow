-- Atomically completes a production order: verifies the order belongs to the
-- caller's tenant and is still open, deducts every BOM component from stock
-- (raising if any component is short), credits the produced quantity of the
-- finished item, marks the order completed, and writes an audit log entry.
-- Runs as a single function call, so it's one transaction — never split this
-- sequence across application-code round trips. Called via the user-scoped
-- client so RLS still applies to every table this function touches.
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

  for v_component in
    select * from can_produce(v_order.item_id, v_order.quantity, p_tenant_id)
  loop
    if v_component.shortfall > 0 then
      raise exception 'Insufficient stock for component %: required %, available %',
        v_component.item_id, v_component.required, v_component.available;
    end if;

    insert into stock_ledger (
      tenant_id, item_id, quantity_delta, reason, reference_type, reference_id, user_id
    ) values (
      p_tenant_id, v_component.item_id, -v_component.required, 'consumed',
      'production_order', p_production_order_id, p_user_id
    );
  end loop;

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

  insert into audit_logs (
    tenant_id, table_name, record_id, action, old_data, new_data, user_id
  ) values (
    p_tenant_id, 'production_orders', p_production_order_id, 'UPDATE',
    null, to_jsonb(v_order), p_user_id
  );

  return v_order;
end;
$$;
