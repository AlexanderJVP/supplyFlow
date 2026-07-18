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

async function adjustStock(
  accessToken: string,
  itemId: string,
  quantityDelta: number,
  reason = 'received'
) {
  return app.fetch(
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
}

async function getCurrentStock(accessToken: string) {
  return app.fetch(
    new Request('http://localhost/api/inventory', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    integrationEnv
  );
}

async function getHistory(accessToken: string, itemId: string) {
  return app.fetch(
    new Request(`http://localhost/api/inventory/${itemId}/history`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    integrationEnv
  );
}

async function getAlerts(accessToken: string) {
  return app.fetch(
    new Request('http://localhost/api/inventory/alerts', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    integrationEnv
  );
}

async function getExport(accessToken: string) {
  return app.fetch(
    new Request('http://localhost/api/inventory/export', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    integrationEnv
  );
}

describe('inventory routes (integration, requires local Supabase)', () => {
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  beforeAll(async () => {
    tenantA = await provisionTestTenant('inventory-a');
    tenantB = await provisionTestTenant('inventory-b');
  });

  afterAll(async () => {
    await cleanupTenant(tenantA.tenant_id, tenantA.admin_user_id);
    await cleanupTenant(tenantB.tenant_id, tenantB.admin_user_id);
  });

  it('creates a stock_ledger row (never a counter) and reflects the running sum in current stock', async () => {
    const item = await createItem(tenantA.accessToken, { name: 'Widget' });

    const received = await adjustStock(
      tenantA.accessToken,
      item.id,
      100,
      'received'
    );
    expect(received.status).toBe(201);
    const receivedBody = (await received.json()) as {
      quantity_delta: number;
      reason: string;
      user_id: string;
    };
    expect(receivedBody.quantity_delta).toBe(100);
    expect(receivedBody.reason).toBe('received');
    expect(receivedBody.user_id).toBeTruthy();

    const consumed = await adjustStock(
      tenantA.accessToken,
      item.id,
      -30,
      'consumed'
    );
    expect(consumed.status).toBe(201);

    const stockResponse = await getCurrentStock(tenantA.accessToken);
    expect(stockResponse.status).toBe(200);
    const stock = (await stockResponse.json()) as Array<{
      item_id: string;
      quantity: number;
    }>;
    const row = stock.find((s) => s.item_id === item.id);
    expect(row?.quantity).toBe(70);
  });

  it('records movement history for an item ordered most-recent first', async () => {
    const item = await createItem(tenantA.accessToken, {
      name: 'History Item',
    });

    expect(
      (await adjustStock(tenantA.accessToken, item.id, 10, 'received')).status
    ).toBe(201);
    expect(
      (await adjustStock(tenantA.accessToken, item.id, -4, 'consumed')).status
    ).toBe(201);
    expect(
      (await adjustStock(tenantA.accessToken, item.id, 2, 'returned')).status
    ).toBe(201);

    const response = await getHistory(tenantA.accessToken, item.id);
    expect(response.status).toBe(200);
    const history = (await response.json()) as Array<{
      quantity_delta: number;
      reason: string;
      created_at: string;
    }>;

    expect(history).toHaveLength(3);
    expect(history[0].reason).toBe('returned');
    expect(history[2].reason).toBe('received');
    const timestamps = history.map((h) => new Date(h.created_at).getTime());
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });

  it('surfaces items below reorder_point with the correct shortfall on the alerts endpoint', async () => {
    const lowStock = await createItem(tenantA.accessToken, {
      name: 'Low Stock Item',
      reorder_point: 50,
    });
    const wellStocked = await createItem(tenantA.accessToken, {
      name: 'Well Stocked Item',
      reorder_point: 10,
    });
    const noReorderPoint = await createItem(tenantA.accessToken, {
      name: 'No Reorder Point Item',
    });

    expect(
      (await adjustStock(tenantA.accessToken, lowStock.id, 20, 'received'))
        .status
    ).toBe(201);
    expect(
      (await adjustStock(tenantA.accessToken, wellStocked.id, 100, 'received'))
        .status
    ).toBe(201);
    expect(
      (await adjustStock(tenantA.accessToken, noReorderPoint.id, 1, 'received'))
        .status
    ).toBe(201);

    const response = await getAlerts(tenantA.accessToken);
    expect(response.status).toBe(200);
    const alerts = (await response.json()) as Array<{
      item_id: string;
      quantity: number;
      reorder_point: number;
      shortfall: number;
    }>;

    const lowStockAlert = alerts.find((a) => a.item_id === lowStock.id);
    expect(lowStockAlert).toMatchObject({
      quantity: 20,
      reorder_point: 50,
      shortfall: 30,
    });
    expect(alerts.some((a) => a.item_id === wellStocked.id)).toBe(false);
    expect(alerts.some((a) => a.item_id === noReorderPoint.id)).toBe(false);
  });

  it('rejects a stock adjustment for a caller without inventory.adjust permission', async () => {
    const item = await createItem(tenantA.accessToken, {
      name: 'Restricted Adjust Item',
    });
    const restricted = await createRestrictedUser(
      tenantA.tenant_id,
      NO_PERMISSIONS
    );

    const response = await adjustStock(
      restricted.accessToken,
      item.id,
      10,
      'received'
    );
    expect(response.status).toBe(403);
  });

  it('paginates the current-stock list with ?after/&limit and reports a next cursor', async () => {
    for (let i = 0; i < 3; i += 1) {
      await createItem(tenantA.accessToken, { name: `Stock Page Item ${i}` });
    }

    const firstPageResponse = await app.fetch(
      new Request('http://localhost/api/inventory?limit=2', {
        headers: { Authorization: `Bearer ${tenantA.accessToken}` },
      }),
      integrationEnv
    );
    expect(firstPageResponse.status).toBe(200);
    const firstPage = (await firstPageResponse.json()) as Array<{
      item_id: string;
    }>;
    expect(firstPage).toHaveLength(2);
    expect(firstPageResponse.headers.get('X-Next-Cursor')).toBeTruthy();
  });

  it('exports current stock as CSV with a downloadable filename', async () => {
    const item = await createItem(tenantA.accessToken, { name: 'CSV Widget' });
    expect(
      (await adjustStock(tenantA.accessToken, item.id, 42, 'received')).status
    ).toBe(201);

    const response = await getExport(tenantA.accessToken);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    expect(response.headers.get('Content-Disposition')).toContain(
      'inventory.csv'
    );

    const csv = await response.text();
    expect(csv.split('\r\n')[0]).toBe(
      'sku,name,unit_of_measure,quantity,reorder_point'
    );
    expect(csv).toContain(`${item.sku},CSV Widget,each,42,`);
  });

  it('rejects the export for a caller without inventory.export permission', async () => {
    const restricted = await createRestrictedUser(
      tenantA.tenant_id,
      NO_PERMISSIONS
    );
    const response = await getExport(restricted.accessToken);
    expect(response.status).toBe(403);
  });

  it('isolates current stock and history by tenant (RLS tenant isolation)', async () => {
    const item = await createItem(tenantA.accessToken, {
      name: 'Tenant Isolated Item',
    });
    expect(
      (await adjustStock(tenantA.accessToken, item.id, 15, 'received')).status
    ).toBe(201);

    const asTenantB = await getCurrentStock(tenantB.accessToken);
    const tenantBStock = (await asTenantB.json()) as Array<{ item_id: string }>;
    expect(tenantBStock.some((s) => s.item_id === item.id)).toBe(false);

    const tenantBHistory = await getHistory(tenantB.accessToken, item.id);
    const tenantBHistoryBody = (await tenantBHistory.json()) as unknown[];
    expect(tenantBHistoryBody).toHaveLength(0);
  });
});
