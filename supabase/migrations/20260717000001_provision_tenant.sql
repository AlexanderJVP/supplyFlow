-- Atomically creates a tenant, its default Admin role (full permissions), a
-- profile linking the given auth user to that role, and a single-step
-- approval workflow for each proposal type. Called via the service-role
-- client only (see server/src/routes/tenants.ts) — the caller is
-- responsible for creating the auth.users row first and setting
-- app_metadata afterwards.
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
    "proposals":  { "create": true, "review": true, "approve": true },
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
