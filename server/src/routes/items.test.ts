import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '../index';
import {
  cleanupTenant,
  createItem,
  createRestrictedUser,
  integrationEnv,
  NO_PERMISSIONS,
  provisionTestTenant,
  uniqueSlug,
  type TestTenant,
} from '../test/integrationHelpers';

describe('items routes (integration, requires local Supabase)', () => {
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  beforeAll(async () => {
    tenantA = await provisionTestTenant('items-a');
    tenantB = await provisionTestTenant('items-b');
  });

  afterAll(async () => {
    await cleanupTenant(tenantA.tenant_id, tenantA.admin_user_id);
    await cleanupTenant(tenantB.tenant_id, tenantB.admin_user_id);
  });

  it('creates an item for the caller tenant when the caller has items.create', async () => {
    const sku = uniqueSlug('SKU');
    const item = await createItem(tenantA.accessToken, { sku, name: 'Bolt' });

    expect(item.sku).toBe(sku);
    expect(item.name).toBe('Bolt');
  });

  it('lists only items belonging to the caller tenant (RLS tenant isolation)', async () => {
    const item = await createItem(tenantA.accessToken, { name: 'Frame' });

    const asTenantA = await app.fetch(
      new Request('http://localhost/api/items', {
        headers: { Authorization: `Bearer ${tenantA.accessToken}` },
      }),
      integrationEnv
    );
    const tenantAItems = (await asTenantA.json()) as Array<{ id: string }>;
    expect(tenantAItems.some((i) => i.id === item.id)).toBe(true);

    const asTenantB = await app.fetch(
      new Request('http://localhost/api/items', {
        headers: { Authorization: `Bearer ${tenantB.accessToken}` },
      }),
      integrationEnv
    );
    const tenantBItems = (await asTenantB.json()) as Array<{ id: string }>;
    expect(tenantBItems.some((i) => i.id === item.id)).toBe(false);
  });

  it('requires items.view to list items', async () => {
    const withoutView = await createRestrictedUser(tenantA.tenant_id, {
      ...NO_PERMISSIONS,
      items: { ...NO_PERMISSIONS.items, view: false },
    });
    const withView = await createRestrictedUser(
      tenantA.tenant_id,
      NO_PERMISSIONS
    );

    const listAs = (accessToken: string) =>
      app.fetch(
        new Request('http://localhost/api/items', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        integrationEnv
      );

    expect((await listAs(withoutView.accessToken)).status).toBe(403);
    expect((await listAs(withView.accessToken)).status).toBe(200);
  });

  it('rejects item creation for a caller without items.create permission', async () => {
    const restricted = await createRestrictedUser(
      tenantA.tenant_id,
      NO_PERMISSIONS
    );

    const response = await app.fetch(
      new Request('http://localhost/api/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${restricted.accessToken}`,
        },
        body: JSON.stringify({
          sku: uniqueSlug('SKU'),
          name: 'Should Not Be Created',
          type: 'component',
        }),
      }),
      integrationEnv
    );

    expect(response.status).toBe(403);
  });

  it('paginates the item list with ?after/&limit and reports a next cursor', async () => {
    for (let i = 0; i < 3; i += 1) {
      await createItem(tenantA.accessToken, { name: `Page Item ${i}` });
    }

    const firstPage = await app.fetch(
      new Request('http://localhost/api/items?limit=2', {
        headers: { Authorization: `Bearer ${tenantA.accessToken}` },
      }),
      integrationEnv
    );
    expect(firstPage.status).toBe(200);
    const firstItems = (await firstPage.json()) as Array<{ id: string }>;
    expect(firstItems).toHaveLength(2);
    const nextCursor = firstPage.headers.get('X-Next-Cursor');
    expect(nextCursor).toBeTruthy();

    const secondPage = await app.fetch(
      new Request(`http://localhost/api/items?limit=2&after=${nextCursor}`, {
        headers: { Authorization: `Bearer ${tenantA.accessToken}` },
      }),
      integrationEnv
    );
    expect(secondPage.status).toBe(200);
    const secondItems = (await secondPage.json()) as Array<{ id: string }>;

    const firstIds = new Set(firstItems.map((i) => i.id));
    expect(secondItems.every((i) => !firstIds.has(i.id))).toBe(true);
  });

  it('edits an item for a caller with items.edit permission', async () => {
    const item = await createItem(tenantA.accessToken, { name: 'Old Name' });

    const response = await app.fetch(
      new Request(`http://localhost/api/items/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantA.accessToken}`,
        },
        body: JSON.stringify({ name: 'New Name' }),
      }),
      integrationEnv
    );

    expect(response.status).toBe(200);
    const updated = (await response.json()) as { name: string };
    expect(updated.name).toBe('New Name');
  });

  it('rejects item edit for a caller without items.edit permission', async () => {
    const item = await createItem(tenantA.accessToken, {
      name: 'Protected Item',
    });
    const restricted = await createRestrictedUser(
      tenantA.tenant_id,
      NO_PERMISSIONS
    );

    const response = await app.fetch(
      new Request(`http://localhost/api/items/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${restricted.accessToken}`,
        },
        body: JSON.stringify({ name: 'Should Not Apply' }),
      }),
      integrationEnv
    );

    expect(response.status).toBe(403);
  });

  it("does not let a caller edit another tenant's item (tenant isolation)", async () => {
    const item = await createItem(tenantA.accessToken, {
      name: 'Tenant A Item',
    });

    const response = await app.fetch(
      new Request(`http://localhost/api/items/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantB.accessToken}`,
        },
        body: JSON.stringify({ name: 'Hijacked' }),
      }),
      integrationEnv
    );

    expect(response.status).toBe(500);
  });

  it('archives an item so it disappears from the default list', async () => {
    const item = await createItem(tenantA.accessToken, {
      name: 'Archive Me',
    });

    const archiveResponse = await app.fetch(
      new Request(`http://localhost/api/items/${item.id}/archive`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tenantA.accessToken}` },
      }),
      integrationEnv
    );
    expect(archiveResponse.status).toBe(200);
    const archived = (await archiveResponse.json()) as {
      is_archived: boolean;
    };
    expect(archived.is_archived).toBe(true);

    const listResponse = await app.fetch(
      new Request('http://localhost/api/items?limit=200', {
        headers: { Authorization: `Bearer ${tenantA.accessToken}` },
      }),
      integrationEnv
    );
    const items = (await listResponse.json()) as Array<{ id: string }>;
    expect(items.some((i) => i.id === item.id)).toBe(false);
  });

  it('rejects item archive for a caller without items.archive permission', async () => {
    const item = await createItem(tenantA.accessToken, {
      name: 'Should Stay Active',
    });
    const restricted = await createRestrictedUser(
      tenantA.tenant_id,
      NO_PERMISSIONS
    );

    const response = await app.fetch(
      new Request(`http://localhost/api/items/${item.id}/archive`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${restricted.accessToken}` },
      }),
      integrationEnv
    );

    expect(response.status).toBe(403);
  });
});
