-- bom_lines.tenant_id is set by the caller's JWT, but parent_item_id/child_item_id
-- are just item FKs with no built-in tenant check -- a bug (or a malicious
-- request with someone else's item id) could otherwise link two items across
-- tenants. RLS on `items` doesn't block this because FK lookups run with
-- elevated internal permissions, bypassing RLS. Enforce it explicitly here,
-- same defense-in-depth pattern as prevent_bom_cycle.
create or replace function prevent_bom_cross_tenant()
returns trigger
language plpgsql
as $$
declare
  parent_tenant_id uuid;
  child_tenant_id uuid;
begin
  select tenant_id into parent_tenant_id from items where id = new.parent_item_id;
  select tenant_id into child_tenant_id from items where id = new.child_item_id;

  if parent_tenant_id is null or parent_tenant_id != new.tenant_id then
    raise exception 'bom_lines: parent_item_id must belong to the same tenant as the BOM line';
  end if;

  if child_tenant_id is null or child_tenant_id != new.tenant_id then
    raise exception 'bom_lines: child_item_id must belong to the same tenant as the BOM line';
  end if;

  return new;
end;
$$;

drop trigger if exists bom_tenant_check on bom_lines;
create trigger bom_tenant_check
  before insert or update on bom_lines
  for each row
  execute function prevent_bom_cross_tenant();
