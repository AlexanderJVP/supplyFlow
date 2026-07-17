-- Recursive availability check: for a given finished item and quantity,
-- compute required vs. available stock for every BOM component at every
-- level. Called via the user-scoped client so RLS still applies.
create or replace function can_produce(
  p_item_id uuid,
  p_quantity numeric,
  p_tenant_id uuid
)
returns table(item_id uuid, required numeric, available numeric, shortfall numeric)
language sql
stable
as $$
  with recursive bom as (
    select child_item_id as item_id, quantity * p_quantity as required
    from bom_lines
    where parent_item_id = p_item_id and tenant_id = p_tenant_id

    union all

    select bl.child_item_id, bl.quantity * b.required
    from bom_lines bl
    join bom as b on bl.parent_item_id = b.item_id
    where bl.tenant_id = p_tenant_id
  ),
  stock as (
    select item_id, sum(quantity_delta) as qty
    from stock_ledger
    where tenant_id = p_tenant_id
    group by item_id
  )
  select b.item_id, sum(b.required) as required,
         coalesce(s.qty, 0) as available,
         greatest(0, sum(b.required) - coalesce(s.qty, 0)) as shortfall
  from bom b
  left join stock s on b.item_id = s.item_id
  group by b.item_id, s.qty
  having sum(b.required) > 0;
$$;
