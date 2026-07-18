import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '../index';
import {
  cleanupTenant,
  createRestrictedUser,
  createUserForRole,
  integrationEnv,
  NO_PERMISSIONS,
  provisionTestTenant,
  signIn,
  uniqueSlug,
  type TestTenant,
} from '../test/integrationHelpers';

async function createRole(
  accessToken: string,
  name: string,
  permissions: object
) {
  return app.fetch(
    new Request('http://localhost/api/roles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ name, permissions }),
    }),
    integrationEnv
  );
}

async function updateRole(accessToken: string, roleId: string, body: object) {
  return app.fetch(
    new Request(`http://localhost/api/roles/${roleId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    }),
    integrationEnv
  );
}

describe('roles routes (integration, requires local Supabase)', () => {
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  beforeAll(async () => {
    tenantA = await provisionTestTenant('roles-a');
    tenantB = await provisionTestTenant('roles-b');
  });

  afterAll(async () => {
    await cleanupTenant(tenantA.tenant_id, tenantA.admin_user_id);
    await cleanupTenant(tenantB.tenant_id, tenantB.admin_user_id);
  });

  it('creates a role and lists it back for the same tenant', async () => {
    const name = uniqueSlug('Viewer');
    const created = await createRole(tenantA.accessToken, name, NO_PERMISSIONS);
    expect(created.status).toBe(201);
    const role = (await created.json()) as { id: string; name: string };
    expect(role.name).toBe(name);

    const listResponse = await app.fetch(
      new Request('http://localhost/api/roles', {
        headers: { Authorization: `Bearer ${tenantA.accessToken}` },
      }),
      integrationEnv
    );
    const roles = (await listResponse.json()) as Array<{ id: string }>;
    expect(roles.some((r) => r.id === role.id)).toBe(true);
  });

  it('rejects role creation for a caller without admin.manage_roles permission', async () => {
    const restricted = await createRestrictedUser(
      tenantA.tenant_id,
      NO_PERMISSIONS
    );
    const response = await createRole(
      restricted.accessToken,
      'Should not be created',
      NO_PERMISSIONS
    );
    expect(response.status).toBe(403);
  });

  it('rejects listing roles for a caller with neither manage_users nor manage_roles', async () => {
    const restricted = await createRestrictedUser(
      tenantA.tenant_id,
      NO_PERMISSIONS
    );
    const response = await app.fetch(
      new Request('http://localhost/api/roles', {
        headers: { Authorization: `Bearer ${restricted.accessToken}` },
      }),
      integrationEnv
    );
    expect(response.status).toBe(403);
  });

  it("does not let a caller edit another tenant's role (tenant isolation)", async () => {
    const created = await createRole(
      tenantA.accessToken,
      uniqueSlug('IsolatedRole'),
      NO_PERMISSIONS
    );
    const role = (await created.json()) as { id: string };

    const response = await updateRole(tenantB.accessToken, role.id, {
      name: 'Hijacked',
    });
    expect(response.status).toBe(500);
  });

  it("propagates an edited role's permissions to existing members on their next sign-in", async () => {
    const created = await createRole(
      tenantA.accessToken,
      uniqueSlug('Propagation'),
      NO_PERMISSIONS
    );
    const role = (await created.json()) as { id: string };

    const member = await createUserForRole(
      tenantA.tenant_id,
      role.id,
      NO_PERMISSIONS
    );

    const beforeCreate = await app.fetch(
      new Request('http://localhost/api/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${member.accessToken}`,
        },
        body: JSON.stringify({
          sku: uniqueSlug('SKU'),
          name: 'Should be forbidden',
          type: 'component',
        }),
      }),
      integrationEnv
    );
    expect(beforeCreate.status).toBe(403);

    const grantCreate = await updateRole(tenantA.accessToken, role.id, {
      permissions: {
        ...NO_PERMISSIONS,
        items: { ...NO_PERMISSIONS.items, create: true },
      },
    });
    expect(grantCreate.status).toBe(200);

    const refreshedToken = await signIn(member.email, member.password);
    const afterCreate = await app.fetch(
      new Request('http://localhost/api/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${refreshedToken}`,
        },
        body: JSON.stringify({
          sku: uniqueSlug('SKU'),
          name: 'Should now be allowed',
          type: 'component',
        }),
      }),
      integrationEnv
    );
    expect(afterCreate.status).toBe(201);
  });
});
