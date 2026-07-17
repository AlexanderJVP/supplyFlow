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
  return app.fetch(
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
}

describe('bom routes (integration, requires local Supabase)', () => {
  let tenant: TestTenant;

  beforeAll(async () => {
    tenant = await provisionTestTenant('bom');
  });

  afterAll(async () => {
    await cleanupTenant(tenant.tenant_id, tenant.admin_user_id);
  });

  it('rejects a bom line for a caller without bom.edit permission', async () => {
    const bolt = await createItem(tenant.accessToken, {
      name: 'Restricted Bolt',
      type: 'component',
    });
    const frame = await createItem(tenant.accessToken, {
      name: 'Restricted Frame',
      type: 'sub_assembly',
    });
    const restricted = await createRestrictedUser(
      tenant.tenant_id,
      NO_PERMISSIONS
    );

    const response = await createBomLine(
      restricted.accessToken,
      frame.id,
      bolt.id,
      1
    );
    expect(response.status).toBe(403);
  });

  it('rejects a self-referencing bom line', async () => {
    const item = await createItem(tenant.accessToken, {
      name: 'Self Ref Item',
      type: 'component',
    });

    const response = await createBomLine(
      tenant.accessToken,
      item.id,
      item.id,
      1
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/self-reference/i);
  });

  it('rejects a multi-hop circular bom reference', async () => {
    const a = await createItem(tenant.accessToken, {
      name: 'Cycle A',
      type: 'component',
    });
    const b = await createItem(tenant.accessToken, {
      name: 'Cycle B',
      type: 'component',
    });
    const c = await createItem(tenant.accessToken, {
      name: 'Cycle C',
      type: 'component',
    });

    const first = await createBomLine(tenant.accessToken, a.id, b.id, 1);
    expect(first.status).toBe(201);
    const second = await createBomLine(tenant.accessToken, b.id, c.id, 1);
    expect(second.status).toBe(201);

    const third = await createBomLine(tenant.accessToken, c.id, a.id, 1);
    expect(third.status).toBe(500);
    const body = (await third.json()) as { error: string };
    expect(body.error).toMatch(/circular/i);
  });

  it('computes multi-level quantities via the recursive BOM tree RPC', async () => {
    const bike = await createItem(tenant.accessToken, {
      name: 'Bike',
      type: 'finished_good',
    });
    const frame = await createItem(tenant.accessToken, {
      name: 'Tree Frame',
      type: 'sub_assembly',
    });
    const bolt = await createItem(tenant.accessToken, {
      name: 'Tree Bolt',
      type: 'component',
    });

    expect(
      (await createBomLine(tenant.accessToken, bike.id, frame.id, 1)).status
    ).toBe(201);
    expect(
      (await createBomLine(tenant.accessToken, frame.id, bolt.id, 4)).status
    ).toBe(201);

    const response = await app.fetch(
      new Request(`http://localhost/api/bom/${bike.id}/tree`, {
        headers: { Authorization: `Bearer ${tenant.accessToken}` },
      }),
      integrationEnv
    );
    expect(response.status).toBe(200);

    const tree = (await response.json()) as Array<{
      item_id: string;
      quantity: number;
      depth: number;
    }>;

    const frameNode = tree.find((n) => n.item_id === frame.id);
    const boltNode = tree.find((n) => n.item_id === bolt.id);

    expect(frameNode).toMatchObject({ depth: 1, quantity: 1 });
    expect(boltNode).toMatchObject({ depth: 2, quantity: 4 });
  });
});
