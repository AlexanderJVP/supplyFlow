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
});
