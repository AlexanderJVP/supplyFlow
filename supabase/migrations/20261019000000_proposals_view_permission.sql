-- STORY-061: adds the proposals.view permission (required by GET
-- /api/proposals from now on) without anyone losing access they have today.
--
-- 1. Every existing role gets proposals.view = true. Roles without a
--    proposals block get one with only view set; their items.view /
--    bom.view values are left untouched.
-- 2. Every current member's app_metadata.permissions is re-synced from
--    their role -- the same snapshot roles.ts pushes when a role is edited.
--    requireAuth reads app_metadata via auth.getUser(), so the server sees
--    the new value on the very next request.
-- 3. provision_tenant's Admin role includes proposals.view for new tenants.

update roles
set permissions = jsonb_set(
  coalesce(permissions, '{}'::jsonb),
  '{proposals}',
  coalesce(permissions -> 'proposals', '{}'::jsonb) || '{"view": true}'::jsonb
);

update auth.users u
set raw_app_meta_data = jsonb_set(
  coalesce(u.raw_app_meta_data, '{}'::jsonb),
  '{permissions}',
  r.permissions
)
from profiles p
join roles r on r.id = p.role_id
where p.id = u.id;

create or replace function provision_tenant(
  p_tenant_name text,
  p_tenant_slug text,
  p_admin_user_id uuid,
  p_admin_name text
)
returns table(tenant_id uuid, role_id uuid, permissions jsonb)
language plpgsql
as $$
declare
  v_tenant_id uuid;
  v_role_id uuid;
  v_permissions jsonb := '{
    "items":      { "view": true, "create": true, "edit": true, "archive": true },
    "bom":        { "view": true, "edit": true },
    "inventory":  { "view": true, "adjust": true, "export": true },
    "production": { "view": true, "create": true, "complete": true, "cancel": true },
    "proposals":  { "view": true, "create": true, "review": true, "approve": true },
    "admin":      { "manage_users": true, "manage_roles": true, "manage_workflow": true }
  }'::jsonb;
  v_proposal_type text;
begin
  insert into tenants (name, slug)
  values (p_tenant_name, p_tenant_slug)
  returning id into v_tenant_id;

  insert into roles (tenant_id, name, permissions)
  values (v_tenant_id, 'Admin', v_permissions)
  returning id into v_role_id;

  insert into profiles (id, tenant_id, name, role_id)
  values (p_admin_user_id, v_tenant_id, p_admin_name, v_role_id);

  foreach v_proposal_type in array array['bom_change', 'item_change', 'process_change']
  loop
    insert into workflow_steps (tenant_id, proposal_type, step_order, role_id)
    values (v_tenant_id, v_proposal_type::proposal_type, 1, v_role_id);
  end loop;

  return query select v_tenant_id, v_role_id, v_permissions;
end;
$$;
