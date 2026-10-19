import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

import { CreateRoleSchema, UpdateRoleSchema } from '@manufacturing/shared';
import { createAdminClient } from '../lib/supabase';
import { requireAuth, requirePermission } from '../middleware/auth';
import type { AppEnv } from '../types';

export const rolesRouter = new Hono<AppEnv>();
rolesRouter.use('*', requireAuth);

// Readable by anyone who can invite users OR manage roles -- both screens
// need the role list (invite's role picker, and the roles editor itself).
rolesRouter.get('/', async (c) => {
  const perms = c.get('user').permissions;
  // Optional chaining: app_metadata is stored JSON, so a role saved before a
  // block existed can lack it entirely -- treat that as no permission (403).
  if (!perms.admin?.manage_users && !perms.admin?.manage_roles) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { data, error } = await c
    .get('supabase')
    .from('roles')
    .select('*')
    .eq('tenant_id', c.get('user').tenantId)
    .order('name');

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

rolesRouter.post(
  '/',
  requirePermission('admin.manage_roles'),
  zValidator('json', CreateRoleSchema),
  async (c) => {
    const body = c.req.valid('json');
    const user = c.get('user');

    const { data, error } = await c
      .get('supabase')
      .from('roles')
      .insert({ ...body, tenant_id: user.tenantId })
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 201);
  }
);

rolesRouter.patch(
  '/:id',
  requirePermission('admin.manage_roles'),
  zValidator('json', UpdateRoleSchema),
  async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const user = c.get('user');
    const supabase = c.get('supabase');

    const { data: role, error } = await supabase
      .from('roles')
      .update(body)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);

    // A role's permissions are baked into each member's JWT app_metadata at
    // invite time -- they don't get looked up live per-request. If the
    // permissions actually changed, push the new snapshot to every current
    // holder of this role so the edit takes effect without forcing a
    // re-invite. (Their existing access token is still stale until it next
    // refreshes/re-authenticates, same as any app_metadata change.)
    if (body.permissions) {
      const { data: members, error: membersError } = await supabase
        .from('profiles')
        .select('id')
        .eq('tenant_id', user.tenantId)
        .eq('role_id', id);

      if (membersError) return c.json({ error: membersError.message }, 500);

      const supabaseAdmin = createAdminClient(c.env);
      await Promise.all(
        members.map((member) =>
          supabaseAdmin.auth.admin.updateUserById(member.id, {
            app_metadata: {
              tenant_id: user.tenantId,
              role_id: id,
              permissions: role.permissions,
            },
          })
        )
      );
    }

    return c.json(role);
  }
);
