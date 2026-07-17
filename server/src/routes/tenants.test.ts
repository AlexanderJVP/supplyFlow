import { afterEach, describe, expect, it } from 'vitest';

import app from '../index';
import {
  cleanupTenant,
  integrationEnv,
  provisionTestTenant,
  signIn,
  uniqueSlug,
} from '../test/integrationHelpers';

describe('POST /api/admin/tenants (integration, requires local Supabase)', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length) {
      const cleanup = cleanups.pop();
      if (cleanup) await cleanup();
    }
  });

  it('rejects requests with a missing or incorrect X-Admin-Secret', async () => {
    const slug = uniqueSlug('reject');
    const body = JSON.stringify({
      name: 'Reject Co',
      slug,
      admin_email: `${slug}@example.test`,
      admin_password: 'Test1234!',
      admin_name: 'Admin',
    });

    const noHeader = await app.fetch(
      new Request('http://localhost/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }),
      integrationEnv
    );
    expect(noHeader.status).toBe(401);

    const wrongSecret = await app.fetch(
      new Request('http://localhost/api/admin/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': 'not-the-real-secret',
        },
        body,
      }),
      integrationEnv
    );
    expect(wrongSecret.status).toBe(401);
  });

  it('rejects an invalid payload before touching Supabase', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/admin/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': integrationEnv.ADMIN_SECRET,
        },
        body: JSON.stringify({
          name: '',
          slug: 'Not A Valid Slug!',
          admin_email: 'not-an-email',
          admin_password: 'short',
          admin_name: '',
        }),
      }),
      integrationEnv
    );
    expect(response.status).toBe(400);
  });

  it('provisions a tenant, Admin role, profile, and workflow steps atomically, and bakes claims into the JWT', async () => {
    const tenant = await provisionTestTenant('provision');
    cleanups.push(() => cleanupTenant(tenant.tenant_id, tenant.admin_user_id));

    expect(tenant.tenant_id).toBeTruthy();
    expect(tenant.role_id).toBeTruthy();
    expect(tenant.admin_user_id).toBeTruthy();

    // The provisioned admin can immediately authenticate and hit a
    // protected route, proving app_metadata (tenant_id/role_id/permissions)
    // was set server-side and is present on the JWT requireAuth reads.
    const itemsResponse = await app.fetch(
      new Request('http://localhost/api/items', {
        headers: { Authorization: `Bearer ${tenant.accessToken}` },
      }),
      integrationEnv
    );
    expect(itemsResponse.status).toBe(200);
    expect(await itemsResponse.json()).toEqual([]);
  });

  it('rejects a duplicate tenant slug and does not leave an orphaned auth user behind', async () => {
    const first = await provisionTestTenant('dup');
    cleanups.push(() => cleanupTenant(first.tenant_id, first.admin_user_id));

    const secondEmail = `${uniqueSlug('dup-admin')}@example.test`;
    const response = await app.fetch(
      new Request('http://localhost/api/admin/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': integrationEnv.ADMIN_SECRET,
        },
        body: JSON.stringify({
          name: 'Duplicate Co',
          slug: first.slug,
          admin_email: secondEmail,
          admin_password: 'Test1234!',
          admin_name: 'Second Admin',
        }),
      }),
      integrationEnv
    );

    expect(response.status).toBe(500);

    // The route rolls back the just-created auth user when provisioning
    // fails, so signing in with those credentials must fail too.
    await expect(signIn(secondEmail, 'Test1234!')).rejects.toThrow();
  });
});
