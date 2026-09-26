import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

import { InviteUserSchema, UpdateUserRoleSchema } from '@manufacturing/shared';
import { createAdminClient } from '../lib/supabase';
import { requireAuth, requirePermission } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import type { AppEnv } from '../types';

export const usersRouter = new Hono<AppEnv>();
usersRouter.use('*', requireAuth);

usersRouter.get('/', requirePermission('admin.manage_users'), async (c) => {
  const { data, error } = await c
    .get('supabase')
    .from('profiles')
    .select('id, name, role_id, is_active, created_at')
    .eq('tenant_id', c.get('user').tenantId)
    .order('created_at');

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

usersRouter.post(
  '/invite',
  requirePermission('admin.manage_users'),
  // Sends a real email per call via Supabase Auth, same abuse shape as
  // registration (POST /api/admin/tenants) -- rate-limit it the same way.
  rateLimit({ keyPrefix: 'users:invite', windowMs: 60 * 60 * 1000, max: 10 }),
  zValidator('json', InviteUserSchema),
  async (c) => {
    const body = c.req.valid('json');
    const user = c.get('user');
    const supabase = c.get('supabase');

    // The role must belong to the caller's own tenant -- otherwise a caller
    // could hand a new user a role (and its permissions) from a different
    // tenant entirely. RLS on `roles` already scopes this select, but the
    // explicit .eq is belt-and-suspenders per Security Rule 2.
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, permissions')
      .eq('id', body.role_id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (roleError || !role) {
      return c.json({ error: 'Role not found for this tenant' }, 400);
    }

    const supabaseAdmin = createAdminClient(c.env);

    const { data: created, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(body.email);

    if (inviteError || !created.user) {
      return c.json(
        { error: inviteError?.message ?? 'Failed to invite user' },
        500
      );
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: created.user.id,
        tenant_id: user.tenantId,
        name: body.name,
        role_id: body.role_id,
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return c.json({ error: profileError.message }, 500);
    }

    const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(
      created.user.id,
      {
        app_metadata: {
          tenant_id: user.tenantId,
          role_id: body.role_id,
          permissions: role.permissions,
        },
      }
    );

    if (metaError) return c.json({ error: metaError.message }, 500);

    return c.json(
      { id: created.user.id, email: body.email, name: body.name },
      201
    );
  }
);

usersRouter.patch(
  '/:id/role',
  requirePermission('admin.manage_users'),
  zValidator('json', UpdateUserRoleSchema),
  async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const user = c.get('user');
    const supabase = c.get('supabase');

    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, permissions')
      .eq('id', body.role_id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (roleError || !role) {
      return c.json({ error: 'Role not found for this tenant' }, 400);
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .update({ role_id: body.role_id })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (profileError) return c.json({ error: profileError.message }, 500);

    const supabaseAdmin = createAdminClient(c.env);
    const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(
      id,
      {
        app_metadata: {
          tenant_id: user.tenantId,
          role_id: body.role_id,
          permissions: role.permissions,
        },
      }
    );

    if (metaError) return c.json({ error: metaError.message }, 500);

    return c.json(profile);
  }
);
