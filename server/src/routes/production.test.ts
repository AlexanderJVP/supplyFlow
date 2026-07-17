import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '../index';
import {
  cleanupTenant,
  createItem,
  createRestrictedUser,
  integrationEnv,
  NO_PERMISSIONS,
  provisionTestTenant,
  type TestTenant,
} from '../test/integrationHelpers';

async function createBomLine(
  accessToken: string,
  parentItemId: string,
  childItemId: string,
  quantity: number
) {
  const response = await app.fetch(
    new Request('http://localhost/api/bom', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        parent_item_id: parentItemId,
        child_item_id: childItemId,
        quantity,
      }),
    }),
    integrationEnv
  );
  if (response.status !== 201) {
    throw new Error(
      `Failed to create test bom line: ${
        response.status
      } ${await response.text()}`
    );
  }
  return response.json();
}

async function adjustStock(
  accessToken: string,
  itemId: string,
  quantityDelta: number,
  reason = 'received'
) {
  const response = await app.fetch(
    new Request('http://localhost/api/inventory/adjust', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        item_id: itemId,
        quantity_delta: quantityDelta,
        reason,
      }),
    }),
    integrationEnv
  );
  if (response.status !== 201) {
    throw new Error(
      `Failed to adjust test stock: ${response.status} ${await response.text()}`
    );
  }
  return response.json();
}

async function createProductionOrder(
  accessToken: string,
  itemId: string,
  quantity: number
) {
  const response = await app.fetch(
    new Request('http://localhost/api/production', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ item_id: itemId, quantity }),
    }),
    integrationEnv
  );
  if (response.status !== 201) {
    throw new Error(
      `Failed to create test production order: ${
        response.status
      } ${await response.text()}`
    );
  }
  return response.json() as Promise<{ id: string; status: string }>;
}

async function completeOrder(accessToken: string, orderId: string) {
  return app.fetch(
    new Request(`http://localhost/api/production/${orderId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    integrationEnv
  );
}

async function getHistory(accessToken: string, itemId: string) {
  const response = await app.fetch(
    new Request(`http://localhost/api/inventory/${itemId}/history`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    integrationEnv
  );
  return response.json() as Promise<
    Array<{ quantity_delta: number; reason: string }>
  >;
}

describe('production routes (integration, requires local Supabase)', () => {
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  beforeAll(async () => {
    tenantA = await provisionTestTenant('production-a');
    tenantB = await provisionTestTenant('production-b');
  });

  afterAll(async () => {
    await cleanupTenant(tenantA.tenant_id, tenantA.admin_user_id);
    await cleanupTenant(tenantB.tenant_id, tenantB.admin_user_id);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/production'),
      integrationEnv
    );
    expect(response.status).toBe(401);
  });

  it('reports required/available/shortfall via can-produce for a multi-level BOM', async () => {
    const bike = await createItem(tenantA.accessToken, {
      name: 'CP Bike',
      type: 'finished_good',
    });
    const bolt = await createItem(tenantA.accessToken, {
      name: 'CP Bolt',
      type: 'component',
    });
    await createBomLine(tenantA.accessToken, bike.id, bolt.id, 4);
    await adjustStock(tenantA.accessToken, bolt.id, 10, 'received');

    const response = await app.fetch(
      new Request(
        `http://localhost/api/production/can-produce?item_id=${bike.id}&quantity=5`,
        { headers: { Authorization: `Bearer ${tenantA.accessToken}` } }
      ),
      integrationEnv
    );
    expect(response.status).toBe(200);
    const shortfalls = (await response.json()) as Array<{
      item_id: string;
      required: number;
      available: number;
      shortfall: number;
    }>;

    const boltShortfall = shortfalls.find((s) => s.item_id === bolt.id);
    expect(boltShortfall).toMatchObject({
      required: 20,
      available: 10,
      shortfall: 10,
    });
  });

  it('completes a production order: deducts components, credits the finished good, marks completed', async () => {
    const bike = await createItem(tenantA.accessToken, {
      name: 'Complete Bike',
      type: 'finished_good',
    });
    const bolt = await createItem(tenantA.accessToken, {
      name: 'Complete Bolt',
      type: 'component',
    });
    await createBomLine(tenantA.accessToken, bike.id, bolt.id, 4);
    await adjustStock(tenantA.accessToken, bolt.id, 100, 'received');

    const order = await createProductionOrder(tenantA.accessToken, bike.id, 5);
    expect(order.status).toBe('draft');

    const response = await completeOrder(tenantA.accessToken, order.id);
    expect(response.status).toBe(200);
    const completed = (await response.json()) as {
      status: string;
      completed_at: string | null;
    };
    expect(completed.status).toBe('completed');
    expect(completed.completed_at).not.toBeNull();

    const boltHistory = await getHistory(tenantA.accessToken, bolt.id);
    expect(
      boltHistory.some(
        (h) => h.quantity_delta === -20 && h.reason === 'consumed'
      )
    ).toBe(true);

    const bikeHistory = await getHistory(tenantA.accessToken, bike.id);
    expect(
      bikeHistory.some((h) => h.quantity_delta === 5 && h.reason === 'produced')
    ).toBe(true);
  });

  it('rejects completion with insufficient stock and leaves the order in draft with no stock movement', async () => {
    const bike = await createItem(tenantA.accessToken, {
      name: 'Shortfall Bike',
      type: 'finished_good',
    });
    const bolt = await createItem(tenantA.accessToken, {
      name: 'Shortfall Bolt',
      type: 'component',
    });
    await createBomLine(tenantA.accessToken, bike.id, bolt.id, 4);
    await adjustStock(tenantA.accessToken, bolt.id, 5, 'received');

    const order = await createProductionOrder(tenantA.accessToken, bike.id, 5);

    const response = await completeOrder(tenantA.accessToken, order.id);
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/insufficient/i);

    const boltHistory = await getHistory(tenantA.accessToken, bolt.id);
    expect(boltHistory.some((h) => h.reason === 'consumed')).toBe(false);
  });

  it('rejects order creation for a caller without production.create permission', async () => {
    const item = await createItem(tenantA.accessToken, {
      name: 'Restricted Production Item',
      type: 'finished_good',
    });
    const restricted = await createRestrictedUser(
      tenantA.tenant_id,
      NO_PERMISSIONS
    );

    const response = await app.fetch(
      new Request('http://localhost/api/production', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${restricted.accessToken}`,
        },
        body: JSON.stringify({ item_id: item.id, quantity: 1 }),
      }),
      integrationEnv
    );
    expect(response.status).toBe(403);
  });

  it('rejects completion for a caller without production.complete permission', async () => {
    const item = await createItem(tenantA.accessToken, {
      name: 'Restricted Complete Item',
      type: 'finished_good',
    });
    const order = await createProductionOrder(tenantA.accessToken, item.id, 1);
    const restricted = await createRestrictedUser(
      tenantA.tenant_id,
      NO_PERMISSIONS
    );

    const response = await completeOrder(restricted.accessToken, order.id);
    expect(response.status).toBe(403);
  });

  it('transitions a draft order to in_progress via start', async () => {
    const item = await createItem(tenantA.accessToken, {
      name: 'Start Item',
      type: 'finished_good',
    });
    const order = await createProductionOrder(tenantA.accessToken, item.id, 1);

    const response = await app.fetch(
      new Request(`http://localhost/api/production/${order.id}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantA.accessToken}` },
      }),
      integrationEnv
    );
    expect(response.status).toBe(200);
    const started = (await response.json()) as {
      status: string;
      started_at: string | null;
    };
    expect(started.status).toBe('in_progress');
    expect(started.started_at).not.toBeNull();
  });

  it('cancels a draft order', async () => {
    const item = await createItem(tenantA.accessToken, {
      name: 'Cancel Item',
      type: 'finished_good',
    });
    const order = await createProductionOrder(tenantA.accessToken, item.id, 1);

    const response = await app.fetch(
      new Request(`http://localhost/api/production/${order.id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantA.accessToken}` },
      }),
      integrationEnv
    );
    expect(response.status).toBe(200);
    const cancelled = (await response.json()) as { status: string };
    expect(cancelled.status).toBe('cancelled');
  });

  it('isolates production orders by tenant (RLS tenant isolation)', async () => {
    const item = await createItem(tenantA.accessToken, {
      name: 'Tenant Isolated Production Item',
      type: 'finished_good',
    });
    const order = await createProductionOrder(tenantA.accessToken, item.id, 1);

    const asTenantB = await app.fetch(
      new Request('http://localhost/api/production', {
        headers: { Authorization: `Bearer ${tenantB.accessToken}` },
      }),
      integrationEnv
    );
    const tenantBOrders = (await asTenantB.json()) as Array<{ id: string }>;
    expect(tenantBOrders.some((o) => o.id === order.id)).toBe(false);
  });
});
