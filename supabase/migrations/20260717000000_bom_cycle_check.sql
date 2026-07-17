create or replace function prevent_bom_cycle()
returns trigger
language plpgsql
as $$
declare
  cycle_found boolean;
begin
  if new.parent_item_id = new.child_item_id then
    raise exception 'bom_lines: parent_item_id and child_item_id must differ (self-reference)';
  end if;

  select exists (
    with recursive descendants as (
      select child_item_id
      from bom_lines
      where parent_item_id = new.child_item_id
        and tenant_id = new.tenant_id

      union all

      select bl.child_item_id
      from bom_lines bl
      join descendants d on bl.parent_item_id = d.child_item_id
      where bl.tenant_id = new.tenant_id
    )
    select 1 from descendants where child_item_id = new.parent_item_id
  ) into cycle_found;

  if cycle_found then
    raise exception 'bom_lines: this change would create a circular BOM reference';
  end if;

  return new;
end;
$$;

drop trigger if exists bom_cycle_check on bom_lines;
create trigger bom_cycle_check
  before insert or update on bom_lines
  for each row
  execute function prevent_bom_cycle();
