import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

import { CreateTenantSchema } from '@manufacturing/shared';
import { createAdminClient } from '../lib/supabase';
import { rateLimit } from '../middleware/rateLimit';
import type { AppEnv } from '../types';

type ProvisionTenantResult = {
  tenant_id: string;
  role_id: string;
  permissions: Record<string, unknown>;
};

export const tenantsRouter = new Hono<AppEnv>();

// This is the registration endpoint (it creates the tenant's first user) --
// login itself never touches our server (the client calls
// supabase.auth.signInWithPassword directly, see Auth Architecture in
// claude.md), so GoTrue's own rate limits are what actually protect login.
tenantsRouter.post(
  '/',
  rateLimit({ keyPrefix: 'tenants:create', windowMs: 60 * 60 * 1000, max: 3 }),
  zValidator('json', CreateTenantSchema),
  async (c) => {
    const adminSecret = c.req.header('X-Admin-Secret');
    if (!adminSecret || adminSecret !== c.env.ADMIN_SECRET) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = c.req.valid('json');
    const supabaseAdmin = createAdminClient(c.env);

    const { data: created, error: createUserError } =
      await supabaseAdmin.auth.admin.createUser({
        email: body.admin_email,
        password: body.admin_password,
        email_confirm: true,
      });

    if (createUserError || !created.user) {
      return c.json(
        { error: createUserError?.message ?? 'Failed to create admin user' },
        500
      );
    }

    const { data: provisioned, error: provisionError } = await supabaseAdmin
      .rpc('provision_tenant', {
        p_tenant_name: body.name,
        p_tenant_slug: body.slug,
        p_admin_user_id: created.user.id,
        p_admin_name: body.admin_name,
      })
      .single<ProvisionTenantResult>();

    if (provisionError || !provisioned) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return c.json(
        { error: provisionError?.message ?? 'Failed to provision tenant' },
        500
      );
    }

    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(created.user.id, {
        app_metadata: {
          tenant_id: provisioned.tenant_id,
          role_id: provisioned.role_id,
          permissions: provisioned.permissions,
        },
      });

    if (updateError) {
      return c.json({ error: updateError.message }, 500);
    }

    return c.json(
      {
        tenant_id: provisioned.tenant_id,
        role_id: provisioned.role_id,
        admin_user_id: created.user.id,
      },
      201
    );
  }
);
