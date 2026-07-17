-- Recursive BOM explorer: full multi-level tree for a given item, with
-- quantities multiplied down each level. Called via the user-scoped
-- client so RLS still applies to the underlying tables.
create or replace function get_bom_tree(
  p_item_id uuid,
  p_tenant_id uuid
)
returns table(item_id uuid, sku text, name text, quantity numeric, depth int)
language sql
stable
as $$
  with recursive bom_tree as (
    select bl.child_item_id as item_id, bl.quantity, 1 as depth
    from bom_lines bl
    where bl.parent_item_id = p_item_id and bl.tenant_id = p_tenant_id

    union all

    select bl.child_item_id, bl.quantity * bt.quantity, bt.depth + 1
    from bom_lines bl
    join bom_tree bt on bl.parent_item_id = bt.item_id
    where bl.tenant_id = p_tenant_id
  )
  select bt.item_id, i.sku, i.name, bt.quantity, bt.depth
  from bom_tree bt
  join items i on i.id = bt.item_id
  order by bt.depth, i.sku;
$$;
