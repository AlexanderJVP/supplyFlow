import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '../index';
import {
  cleanupTenant,
  createItem,
  getAuditLogs,
  integrationEnv,
  provisionTestTenant,
  type TestTenant,
} from '../test/integrationHelpers';

describe('audit log triggers (integration, requires local Supabase)', () => {
  let tenant: TestTenant;

  beforeAll(async () => {
    tenant = await provisionTestTenant('audit-log');
  });

  afterAll(async () => {
    await cleanupTenant(tenant.tenant_id, tenant.admin_user_id);
  });

  it('audits an item INSERT via the generic trigger, not application code', async () => {
    const item = await createItem(tenant.accessToken, { name: 'Audited Item' });

    const logs = await getAuditLogs(tenant.tenant_id, 'items', item.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('INSERT');
    expect(logs[0].old_data).toBeNull();
    expect(logs[0].new_data).toMatchObject({
      id: item.id,
      name: 'Audited Item',
    });
    expect(logs[0].user_id).toBe(tenant.admin_user_id);
  });

  it('audits an item PATCH (edit) with both old and new data', async () => {
    const item = await createItem(tenant.accessToken, { name: 'Before Edit' });

    await app.fetch(
      new Request(`http://localhost/api/items/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenant.accessToken}`,
        },
        body: JSON.stringify({ name: 'After Edit' }),
      }),
      integrationEnv
    );

    const logs = await getAuditLogs(tenant.tenant_id, 'items', item.id);
    const updateLog = logs.find((l) => l.action === 'UPDATE');
    expect(updateLog).toBeTruthy();
    expect(updateLog?.old_data).toMatchObject({ name: 'Before Edit' });
    expect(updateLog?.new_data).toMatchObject({ name: 'After Edit' });
  });

  it('audits production_orders and bom_lines mutations made through RPCs, not just direct writes', async () => {
    const bike = await createItem(tenant.accessToken, {
      name: 'Audit Bike',
      type: 'finished_good',
    });
    const bolt = await createItem(tenant.accessToken, {
      name: 'Audit Bolt',
      type: 'component',
    });

    const bomLineResponse = await app.fetch(
      new Request('http://localhost/api/bom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenant.accessToken}`,
        },
        body: JSON.stringify({
          parent_item_id: bike.id,
          child_item_id: bolt.id,
          quantity: 2,
        }),
      }),
      integrationEnv
    );
    const bomLine = (await bomLineResponse.json()) as { id: string };

    const bomLogs = await getAuditLogs(
      tenant.tenant_id,
      'bom_lines',
      bomLine.id
    );
    expect(bomLogs).toHaveLength(1);
    expect(bomLogs[0].action).toBe('INSERT');

    await app.fetch(
      new Request('http://localhost/api/inventory/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenant.accessToken}`,
        },
        body: JSON.stringify({
          item_id: bolt.id,
          quantity_delta: 100,
          reason: 'received',
        }),
      }),
      integrationEnv
    );

    const orderResponse = await app.fetch(
      new Request('http://localhost/api/production', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenant.accessToken}`,
        },
        body: JSON.stringify({ item_id: bike.id, quantity: 1 }),
      }),
      integrationEnv
    );
    const order = (await orderResponse.json()) as { id: string };

    await app.fetch(
      new Request(`http://localhost/api/production/${order.id}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tenant.accessToken}` },
      }),
      integrationEnv
    );

    const orderLogs = await getAuditLogs(
      tenant.tenant_id,
      'production_orders',
      order.id
    );
    // One INSERT (POST /api/production) + one UPDATE (complete_production_order RPC).
    expect(orderLogs.map((l) => l.action)).toEqual(['INSERT', 'UPDATE']);
    expect(orderLogs[1].new_data).toMatchObject({ status: 'completed' });
  });
});
