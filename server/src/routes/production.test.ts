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

  it('reports required/available/shortfall via can-produce for a direct component', async () => {
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

  it('consumes only the direct components: bolt->frame->bike qty 4 deducts frames, not the bolts inside them (STORY-068)', async () => {
    const bolt = await createItem(tenantA.accessToken, {
      name: 'Regression Bolt',
      type: 'component',
    });
    const frame = await createItem(tenantA.accessToken, {
      name: 'Regression Frame',
      type: 'sub_assembly',
    });
    const bike = await createItem(tenantA.accessToken, {
      name: 'Regression Bike',
      type: 'finished_good',
    });

    // frame requires 4 bolts; bike requires 1 frame.
    await createBomLine(tenantA.accessToken, frame.id, bolt.id, 4);
    await createBomLine(tenantA.accessToken, bike.id, frame.id, 1);

    // Enough bolts for 250 frames, but only 3 frames to build 4 bikes.
    await adjustStock(tenantA.accessToken, bolt.id, 1000, 'received');
    await adjustStock(tenantA.accessToken, frame.id, 3, 'received');

    const shortfallResponse = await app.fetch(
      new Request(
        `http://localhost/api/production/can-produce?item_id=${bike.id}&quantity=4`,
        { headers: { Authorization: `Bearer ${tenantA.accessToken}` } }
      ),
      integrationEnv
    );
    expect(shortfallResponse.status).toBe(200);
    const shortfallRows = (await shortfallResponse.json()) as Array<{
      item_id: string;
      required: number;
      available: number;
      shortfall: number;
      buildable_from_stock: number | null;
    }>;
    // Only the direct component is listed -- the bolts are the frame's
    // business, not the bike's.
    expect(shortfallRows).toEqual([
      {
        item_id: frame.id,
        required: 4,
        available: 3,
        shortfall: 1,
        buildable_from_stock: 250,
      },
    ]);

    // Completing now fails with the same hint, and moves no stock.
    const order = await createProductionOrder(tenantA.accessToken, bike.id, 4);
    const failedResponse = await completeOrder(tenantA.accessToken, order.id);
    expect(failedResponse.status).toBe(409);
    const failedBody = (await failedResponse.json()) as {
      shortfalls: unknown[];
    };
    expect(failedBody.shortfalls).toEqual([
      {
        item_id: frame.id,
        required: 4,
        available: 3,
        shortfall: 1,
        buildable_from_stock: 250,
      },
    ]);

    // Top up frames so the build can actually proceed.
    await adjustStock(tenantA.accessToken, frame.id, 5, 'received');

    const completeResponse = await completeOrder(tenantA.accessToken, order.id);
    expect(completeResponse.status).toBe(200);
    const completed = (await completeResponse.json()) as { status: string };
    expect(completed.status).toBe('completed');

    const frameHistory = await getHistory(tenantA.accessToken, frame.id);
    expect(
      frameHistory
        .filter((h) => h.reason === 'consumed')
        .map((h) => h.quantity_delta)
    ).toEqual([-4]);

    // The bug: these 16 bolts used to be deducted a second time.
    const boltHistory = await getHistory(tenantA.accessToken, bolt.id);
    expect(boltHistory.some((h) => h.reason === 'consumed')).toBe(false);

    const bikeHistory = await getHistory(tenantA.accessToken, bike.id);
    expect(
      bikeHistory.some((h) => h.quantity_delta === 4 && h.reason === 'produced')
    ).toBe(true);
  });

  it('returns no rows from can-produce for an item without a BOM, and completion just credits it', async () => {
    const part = await createItem(tenantA.accessToken, {
      name: 'No-BOM Part',
      type: 'component',
    });

    const response = await app.fetch(
      new Request(
        `http://localhost/api/production/can-produce?item_id=${part.id}&quantity=3`,
        { headers: { Authorization: `Bearer ${tenantA.accessToken}` } }
      ),
      integrationEnv
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);

    const order = await createProductionOrder(tenantA.accessToken, part.id, 3);
    const completeResponse = await completeOrder(tenantA.accessToken, order.id);
    expect(completeResponse.status).toBe(200);

    const history = await getHistory(tenantA.accessToken, part.id);
    expect(history.map((h) => [h.quantity_delta, h.reason])).toEqual([
      [3, 'produced'],
    ]);
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
    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: string;
      code: string;
      shortfalls: Array<{
        item_id: string;
        required: number;
        available: number;
        shortfall: number;
      }>;
    };
    expect(body.error).toMatch(/insufficient/i);
    expect(body.code).toBe('insufficient_stock');
    expect(body.shortfalls).toEqual([
      { item_id: bolt.id, required: 20, available: 5, shortfall: 15 },
    ]);

    const boltHistory = await getHistory(tenantA.accessToken, bolt.id);
    expect(boltHistory.some((h) => h.reason === 'consumed')).toBe(false);
  });

  it('serializes concurrent completions on the same component: exactly one succeeds and stock never goes negative (STORY-043)', async () => {
    const bike = await createItem(tenantA.accessToken, {
      name: 'Concurrent Bike',
      type: 'finished_good',
    });
    const bolt = await createItem(tenantA.accessToken, {
      name: 'Concurrent Bolt',
      type: 'component',
    });
    await createBomLine(tenantA.accessToken, bike.id, bolt.id, 4);
    // Exactly enough bolts for ONE order of 5 bikes (5 x 4 = 20).
    await adjustStock(tenantA.accessToken, bolt.id, 20, 'received');

    const orderA = await createProductionOrder(tenantA.accessToken, bike.id, 5);
    const orderB = await createProductionOrder(tenantA.accessToken, bike.id, 5);

    // Fired in parallel: two separate requests, two separate DB
    // transactions, both of which would pass a check made without locking.
    const responses = await Promise.all([
      completeOrder(tenantA.accessToken, orderA.id),
      completeOrder(tenantA.accessToken, orderB.id),
    ]);
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);

    const boltHistory = await getHistory(tenantA.accessToken, bolt.id);
    const boltStock = boltHistory.reduce(
      (sum, h) => sum + Number(h.quantity_delta),
      0
    );
    expect(boltStock).toBe(0);
    expect(boltHistory.filter((h) => h.reason === 'consumed')).toHaveLength(1);

    const bikeHistory = await getHistory(tenantA.accessToken, bike.id);
    expect(bikeHistory.filter((h) => h.reason === 'produced')).toHaveLength(1);
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

  it('paginates the production order list with ?after/&limit and reports a next cursor', async () => {
    const item = await createItem(tenantA.accessToken, {
      name: 'Pagination Production Item',
      type: 'finished_good',
    });
    for (let i = 0; i < 3; i += 1) {
      await createProductionOrder(tenantA.accessToken, item.id, 1);
    }

    const firstPageResponse = await app.fetch(
      new Request('http://localhost/api/production?limit=2', {
        headers: { Authorization: `Bearer ${tenantA.accessToken}` },
      }),
      integrationEnv
    );
    expect(firstPageResponse.status).toBe(200);
    const firstPage = (await firstPageResponse.json()) as Array<{
      id: string;
    }>;
    expect(firstPage).toHaveLength(2);
    expect(firstPageResponse.headers.get('X-Next-Cursor')).toBeTruthy();
  });

  it('exports production orders as CSV with item names resolved and a downloadable filename', async () => {
    const item = await createItem(tenantA.accessToken, {
      name: 'CSV Bike',
      type: 'finished_good',
    });
    await createProductionOrder(tenantA.accessToken, item.id, 3);

    const response = await app.fetch(
      new Request('http://localhost/api/production/export', {
        headers: { Authorization: `Bearer ${tenantA.accessToken}` },
      }),
      integrationEnv
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    expect(response.headers.get('Content-Disposition')).toContain(
      'production.csv'
    );

    const csv = await response.text();
    expect(csv.split('\r\n')[0]).toBe(
      'sku,name,quantity,status,created_at,completed_at'
    );
    expect(csv).toContain(`${item.sku},CSV Bike,3,draft,`);
  });

  it('rejects the export for a caller without production.view permission', async () => {
    const restricted = await createRestrictedUser(tenantA.tenant_id, {
      ...NO_PERMISSIONS,
      production: {
        view: false,
        create: false,
        complete: false,
        cancel: false,
      },
    });
    const response = await app.fetch(
      new Request('http://localhost/api/production/export', {
        headers: { Authorization: `Bearer ${restricted.accessToken}` },
      }),
      integrationEnv
    );
    expect(response.status).toBe(403);
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
