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
  let otherTenant: TestTenant;

  beforeAll(async () => {
    tenant = await provisionTestTenant('bom');
    otherTenant = await provisionTestTenant('bom-other');
  });

  afterAll(async () => {
    await cleanupTenant(tenant.tenant_id, tenant.admin_user_id);
    await cleanupTenant(otherTenant.tenant_id, otherTenant.admin_user_id);
  });

  it("does not return another tenant's BOM tree (RLS tenant isolation)", async () => {
    const bike = await createItem(tenant.accessToken, {
      name: 'Isolated Bike',
      type: 'finished_good',
    });
    const bolt = await createItem(tenant.accessToken, {
      name: 'Isolated Bolt',
      type: 'component',
    });
    expect(
      (await createBomLine(tenant.accessToken, bike.id, bolt.id, 1)).status
    ).toBe(201);

    const response = await app.fetch(
      new Request(`http://localhost/api/bom/${bike.id}/tree`, {
        headers: { Authorization: `Bearer ${otherTenant.accessToken}` },
      }),
      integrationEnv
    );
    expect(response.status).toBe(200);
    const tree = (await response.json()) as unknown[];
    expect(tree).toHaveLength(0);
  });

  it('rejects a BOM line whose parent item belongs to another tenant (tenant isolation)', async () => {
    const foreignBike = await createItem(tenant.accessToken, {
      name: 'Foreign Bike',
      type: 'finished_good',
    });
    const ownBolt = await createItem(otherTenant.accessToken, {
      name: 'Own Bolt',
      type: 'component',
    });

    const response = await createBomLine(
      otherTenant.accessToken,
      foreignBike.id,
      ownBolt.id,
      1
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/tenant/i);
  });

  it('rejects a BOM line whose child item belongs to another tenant (tenant isolation)', async () => {
    const ownFrame = await createItem(otherTenant.accessToken, {
      name: 'Own Frame',
      type: 'sub_assembly',
    });
    const foreignBolt = await createItem(tenant.accessToken, {
      name: 'Foreign Bolt',
      type: 'component',
    });

    const response = await createBomLine(
      otherTenant.accessToken,
      ownFrame.id,
      foreignBolt.id,
      1
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/tenant/i);
  });

  it('requires bom.view for the tree; bom.view or proposals.view for lines', async () => {
    const frame = await createItem(tenant.accessToken, {
      name: 'View Frame',
      type: 'sub_assembly',
    });
    const noBomView = {
      ...NO_PERMISSIONS,
      bom: { ...NO_PERMISSIONS.bom, view: false },
    };
    const withoutView = await createRestrictedUser(tenant.tenant_id, {
      ...noBomView,
      proposals: { ...noBomView.proposals, view: false },
    });
    // The bom_change proposal editor reads existing lines.
    const proposalsOnly = await createRestrictedUser(
      tenant.tenant_id,
      noBomView
    );
    const withView = await createRestrictedUser(
      tenant.tenant_id,
      NO_PERMISSIONS
    );

    const getAs = (accessToken: string, path: string) =>
      app.fetch(
        new Request(`http://localhost/api/bom/${frame.id}/${path}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        integrationEnv
      );

    for (const path of ['tree', 'lines']) {
      expect((await getAs(withoutView.accessToken, path)).status).toBe(403);
      expect((await getAs(withView.accessToken, path)).status).toBe(200);
    }
    expect((await getAs(proposalsOnly.accessToken, 'tree')).status).toBe(403);
    expect((await getAs(proposalsOnly.accessToken, 'lines')).status).toBe(200);
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

  it('returns direct (non-recursive) bom lines with their own id for a parent item', async () => {
    const frame = await createItem(tenant.accessToken, {
      name: 'Lines Frame',
      type: 'sub_assembly',
    });
    const bolt = await createItem(tenant.accessToken, {
      name: 'Lines Bolt',
      type: 'component',
    });
    const nut = await createItem(tenant.accessToken, {
      name: 'Lines Nut',
      type: 'component',
    });

    const created = await createBomLine(
      tenant.accessToken,
      frame.id,
      bolt.id,
      2
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { id: string };
    expect(
      (await createBomLine(tenant.accessToken, frame.id, nut.id, 3)).status
    ).toBe(201);

    const response = await app.fetch(
      new Request(`http://localhost/api/bom/${frame.id}/lines`, {
        headers: { Authorization: `Bearer ${tenant.accessToken}` },
      }),
      integrationEnv
    );
    expect(response.status).toBe(200);
    const lines = (await response.json()) as Array<{
      id: string;
      child_item_id: string;
      quantity: number;
    }>;
    expect(lines).toHaveLength(2);
    const boltLine = lines.find((l) => l.child_item_id === bolt.id);
    expect(boltLine).toMatchObject({ id: createdBody.id, quantity: 2 });
  });

  it("does not return another tenant's bom lines (RLS tenant isolation)", async () => {
    const frame = await createItem(tenant.accessToken, {
      name: 'Isolated Lines Frame',
      type: 'sub_assembly',
    });
    const bolt = await createItem(tenant.accessToken, {
      name: 'Isolated Lines Bolt',
      type: 'component',
    });
    expect(
      (await createBomLine(tenant.accessToken, frame.id, bolt.id, 1)).status
    ).toBe(201);

    const response = await app.fetch(
      new Request(`http://localhost/api/bom/${frame.id}/lines`, {
        headers: { Authorization: `Bearer ${otherTenant.accessToken}` },
      }),
      integrationEnv
    );
    expect(response.status).toBe(200);
    const lines = (await response.json()) as unknown[];
    expect(lines).toHaveLength(0);
  });
});
