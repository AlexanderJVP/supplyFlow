import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '../index';
import {
  cleanupTenant,
  createRestrictedUser,
  createUserForRole,
  deleteAuthUser,
  integrationEnv,
  NO_PERMISSIONS,
  provisionTestTenant,
  signIn,
  uniqueSlug,
  type TestTenant,
} from '../test/integrationHelpers';

async function inviteUser(
  accessToken: string,
  body: { email: string; name: string; role_id: string },
  ip?: string
) {
  return app.fetch(
    new Request('http://localhost/api/users/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(ip ? { 'CF-Connecting-IP': ip } : {}),
      },
      body: JSON.stringify(body),
    }),
    integrationEnv
  );
}

async function createRole(
  accessToken: string,
  name: string,
  permissions: object
) {
  const response = await app.fetch(
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
  return response.json() as Promise<{ id: string }>;
}

describe('users routes (integration, requires local Supabase)', () => {
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  beforeAll(async () => {
    tenantA = await provisionTestTenant('users-a');
    tenantB = await provisionTestTenant('users-b');
  });

  afterAll(async () => {
    await cleanupTenant(tenantA.tenant_id, tenantA.admin_user_id);
    await cleanupTenant(tenantB.tenant_id, tenantB.admin_user_id);
  });

  it('invites a user into the tenant with the given role and lists them', async () => {
    const slug = uniqueSlug('invitee');
    const response = await inviteUser(tenantA.accessToken, {
      email: `${slug}@example.test`,
      name: 'Invited Person',
      role_id: tenantA.role_id,
    });
    expect(response.status).toBe(201);
    const invited = (await response.json()) as { id: string };

    const listResponse = await app.fetch(
      new Request('http://localhost/api/users', {
        headers: { Authorization: `Bearer ${tenantA.accessToken}` },
      }),
      integrationEnv
    );
    const users = (await listResponse.json()) as Array<{
      id: string;
      name: string;
      role_id: string;
    }>;
    const found = users.find((u) => u.id === invited.id);
    expect(found).toMatchObject({
      name: 'Invited Person',
      role_id: tenantA.role_id,
    });
  });

  it('rejects invite for a caller without admin.manage_users permission', async () => {
    const restricted = await createRestrictedUser(
      tenantA.tenant_id,
      NO_PERMISSIONS
    );
    const slug = uniqueSlug('rejected-invitee');
    const response = await inviteUser(restricted.accessToken, {
      email: `${slug}@example.test`,
      name: 'Should not be invited',
      role_id: tenantA.role_id,
    });
    expect(response.status).toBe(403);
  });

  it('rate-limits invites to 10 attempts per IP per hour', async () => {
    // 11 invite calls plus 10 cleanup deletes is more round-trips than the
    // default 5s test timeout comfortably covers under full-suite load.
    const ip = '10.2.0.99';
    const invitedUserIds: string[] = [];

    for (let i = 0; i < 10; i += 1) {
      const slug = uniqueSlug('ratelimit-invitee');
      const response = await inviteUser(
        tenantA.accessToken,
        {
          email: `${slug}@example.test`,
          name: 'Ratelimit Invitee',
          role_id: tenantA.role_id,
        },
        ip
      );
      expect(response.status).toBe(201);
      const invited = (await response.json()) as { id: string };
      invitedUserIds.push(invited.id);
    }

    const eleventh = await inviteUser(
      tenantA.accessToken,
      {
        email: `${uniqueSlug('ratelimit-invitee')}@example.test`,
        name: 'Should be rate-limited',
        role_id: tenantA.role_id,
      },
      ip
    );
    expect(eleventh.status).toBe(429);
    expect(eleventh.headers.get('Retry-After')).toBeTruthy();

    for (const id of invitedUserIds) {
      await deleteAuthUser(id);
    }
  }, 20000);

  it('rejects inviting a user with a role_id from another tenant', async () => {
    const slug = uniqueSlug('cross-tenant-invitee');
    const response = await inviteUser(tenantA.accessToken, {
      email: `${slug}@example.test`,
      name: 'Should not be invited',
      role_id: tenantB.role_id,
    });
    expect(response.status).toBe(400);
  });

  it('rejects listing users for a caller without admin.manage_users permission', async () => {
    const restricted = await createRestrictedUser(
      tenantA.tenant_id,
      NO_PERMISSIONS
    );
    const response = await app.fetch(
      new Request('http://localhost/api/users', {
        headers: { Authorization: `Bearer ${restricted.accessToken}` },
      }),
      integrationEnv
    );
    expect(response.status).toBe(403);
  });

  it("reassigns a user's role and applies the new permissions on their next sign-in", async () => {
    const reducedRole = await createRole(
      tenantA.accessToken,
      uniqueSlug('Reduced'),
      NO_PERMISSIONS
    );

    const member = await createUserForRole(tenantA.tenant_id, tenantA.role_id, {
      items: { view: true, create: true, edit: true, archive: true },
      bom: { view: true, edit: true },
      inventory: { view: true, adjust: true, export: true },
      production: { view: true, create: true, complete: true, cancel: true },
      proposals: { create: true, review: true, approve: true },
      admin: { manage_users: true, manage_roles: true, manage_workflow: true },
    });

    const beforeReassign = await app.fetch(
      new Request('http://localhost/api/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${member.accessToken}`,
        },
        body: JSON.stringify({
          sku: uniqueSlug('SKU'),
          name: 'Allowed before reassignment',
          type: 'component',
        }),
      }),
      integrationEnv
    );
    expect(beforeReassign.status).toBe(201);

    const reassignResponse = await app.fetch(
      new Request(`http://localhost/api/users/${member.userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantA.accessToken}`,
        },
        body: JSON.stringify({ role_id: reducedRole.id }),
      }),
      integrationEnv
    );
    expect(reassignResponse.status).toBe(200);
    const reassigned = (await reassignResponse.json()) as { role_id: string };
    expect(reassigned.role_id).toBe(reducedRole.id);

    const refreshedToken = await signIn(member.email, member.password);
    const afterReassign = await app.fetch(
      new Request('http://localhost/api/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${refreshedToken}`,
        },
        body: JSON.stringify({
          sku: uniqueSlug('SKU'),
          name: 'Forbidden after reassignment',
          type: 'component',
        }),
      }),
      integrationEnv
    );
    expect(afterReassign.status).toBe(403);
  });

  it("does not let a caller reassign another tenant's user (tenant isolation)", async () => {
    const member = await createUserForRole(
      tenantA.tenant_id,
      tenantA.role_id,
      NO_PERMISSIONS
    );

    const response = await app.fetch(
      new Request(`http://localhost/api/users/${member.userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantB.accessToken}`,
        },
        body: JSON.stringify({ role_id: tenantB.role_id }),
      }),
      integrationEnv
    );
    expect(response.status).toBe(500);
  });
});
