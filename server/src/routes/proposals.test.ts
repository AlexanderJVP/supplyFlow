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

async function createProposal(
  accessToken: string,
  body: Record<string, unknown>
) {
  return app.fetch(
    new Request('http://localhost/api/proposals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    }),
    integrationEnv
  );
}

async function submitProposal(accessToken: string, proposalId: string) {
  return app.fetch(
    new Request(`http://localhost/api/proposals/${proposalId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    integrationEnv
  );
}

async function reviewProposal(
  accessToken: string,
  proposalId: string,
  action: string,
  notes?: string
) {
  return app.fetch(
    new Request(`http://localhost/api/proposals/${proposalId}/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action, notes }),
    }),
    integrationEnv
  );
}

async function getBomTree(accessToken: string, itemId: string) {
  const response = await app.fetch(
    new Request(`http://localhost/api/bom/${itemId}/tree`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    integrationEnv
  );
  return response.json() as Promise<
    Array<{ item_id: string; quantity: number }>
  >;
}

describe('proposals routes (integration, requires local Supabase)', () => {
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  beforeAll(async () => {
    tenantA = await provisionTestTenant('proposals-a');
    tenantB = await provisionTestTenant('proposals-b');
  });

  afterAll(async () => {
    await cleanupTenant(tenantA.tenant_id, tenantA.admin_user_id);
    await cleanupTenant(tenantB.tenant_id, tenantB.admin_user_id);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/proposals'),
      integrationEnv
    );
    expect(response.status).toBe(401);
  });

  it('rejects proposal creation for a caller without proposals.create permission', async () => {
    const restricted = await createRestrictedUser(
      tenantA.tenant_id,
      NO_PERMISSIONS
    );

    const response = await createProposal(restricted.accessToken, {
      type: 'process_change',
      title: 'Should not be created',
      payload: {},
    });
    expect(response.status).toBe(403);
  });

  it('submits and single-step-approves a process_change proposal end to end', async () => {
    const created = await createProposal(tenantA.accessToken, {
      type: 'process_change',
      title: 'Tighten torque spec',
      payload: { note: 'use 12Nm instead of 10Nm' },
    });
    expect(created.status).toBe(201);
    const proposal = (await created.json()) as { id: string; status: string };
    expect(proposal.status).toBe('draft');

    const submitted = await submitProposal(tenantA.accessToken, proposal.id);
    expect(submitted.status).toBe(200);
    const submittedBody = (await submitted.json()) as { status: string };
    expect(submittedBody.status).toBe('pending_review');

    // The default per-tenant workflow has a single step assigned to the
    // Admin role, which the tenant-provisioning user already holds.
    const reviewed = await reviewProposal(
      tenantA.accessToken,
      proposal.id,
      'approved'
    );
    expect(reviewed.status).toBe(200);
    const reviewedBody = (await reviewed.json()) as { status: string };
    expect(reviewedBody.status).toBe('approved');
  });

  it('auto-applies an approved bom_change proposal to bom_lines', async () => {
    const frame = await createItem(tenantA.accessToken, {
      name: 'Proposal Frame',
      type: 'sub_assembly',
    });
    const bolt = await createItem(tenantA.accessToken, {
      name: 'Proposal Bolt',
      type: 'component',
    });

    const created = await createProposal(tenantA.accessToken, {
      type: 'bom_change',
      title: 'Add bolts to frame BOM',
      payload: {
        create: [
          {
            parent_item_id: frame.id,
            child_item_id: bolt.id,
            quantity: 6,
          },
        ],
      },
    });
    expect(created.status).toBe(201);
    const proposal = (await created.json()) as { id: string };

    expect(
      (await submitProposal(tenantA.accessToken, proposal.id)).status
    ).toBe(200);

    const beforeTree = await getBomTree(tenantA.accessToken, frame.id);
    expect(beforeTree.some((n) => n.item_id === bolt.id)).toBe(false);

    const reviewed = await reviewProposal(
      tenantA.accessToken,
      proposal.id,
      'approved'
    );
    expect(reviewed.status).toBe(200);

    const afterTree = await getBomTree(tenantA.accessToken, frame.id);
    const boltNode = afterTree.find((n) => n.item_id === bolt.id);
    expect(boltNode).toMatchObject({ quantity: 6 });
  });

  it('rejects an invalid bom_change payload before it is ever submitted', async () => {
    const response = await createProposal(tenantA.accessToken, {
      type: 'bom_change',
      title: 'Malformed payload',
      payload: { create: [{ quantity: 'not-a-number' }] },
    });
    expect(response.status).toBe(400);
  });

  it('rejects a proposal and leaves it in the rejected state', async () => {
    const created = await createProposal(tenantA.accessToken, {
      type: 'item_change',
      title: 'Rename item, should be rejected',
      payload: {},
    });
    const proposal = (await created.json()) as { id: string };
    await submitProposal(tenantA.accessToken, proposal.id);

    const reviewed = await reviewProposal(
      tenantA.accessToken,
      proposal.id,
      'rejected',
      'not needed'
    );
    expect(reviewed.status).toBe(200);
    const body = (await reviewed.json()) as { status: string };
    expect(body.status).toBe('rejected');

    // A rejected proposal can no longer be reviewed again.
    const secondReview = await reviewProposal(
      tenantA.accessToken,
      proposal.id,
      'approved'
    );
    expect(secondReview.status).toBe(500);
  });

  it('sends a proposal back to draft on requested_changes', async () => {
    const created = await createProposal(tenantA.accessToken, {
      type: 'item_change',
      title: 'Needs more detail',
      payload: {},
    });
    const proposal = (await created.json()) as { id: string };
    await submitProposal(tenantA.accessToken, proposal.id);

    const reviewed = await reviewProposal(
      tenantA.accessToken,
      proposal.id,
      'requested_changes',
      'add more context'
    );
    expect(reviewed.status).toBe(200);
    const body = (await reviewed.json()) as { status: string };
    expect(body.status).toBe('draft');
  });

  it('rejects a review from a reviewer whose role does not match the workflow step', async () => {
    const created = await createProposal(tenantA.accessToken, {
      type: 'item_change',
      title: 'Needs the right reviewer role',
      payload: {},
    });
    const proposal = (await created.json()) as { id: string };
    await submitProposal(tenantA.accessToken, proposal.id);

    const wrongRoleReviewer = await createRestrictedUser(tenantA.tenant_id, {
      ...NO_PERMISSIONS,
      proposals: { create: false, review: true, approve: false },
    });

    const response = await reviewProposal(
      wrongRoleReviewer.accessToken,
      proposal.id,
      'approved'
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/not authorized for this workflow step/i);
  });

  it('rejects a review for a caller without proposals.review permission', async () => {
    const created = await createProposal(tenantA.accessToken, {
      type: 'item_change',
      title: 'No reviewer permission',
      payload: {},
    });
    const proposal = (await created.json()) as { id: string };
    await submitProposal(tenantA.accessToken, proposal.id);

    const restricted = await createRestrictedUser(
      tenantA.tenant_id,
      NO_PERMISSIONS
    );

    const response = await reviewProposal(
      restricted.accessToken,
      proposal.id,
      'approved'
    );
    expect(response.status).toBe(403);
  });

  it('isolates the proposal list by tenant (RLS tenant isolation)', async () => {
    const created = await createProposal(tenantA.accessToken, {
      type: 'item_change',
      title: 'Tenant A only proposal',
      payload: {},
    });
    const proposal = (await created.json()) as { id: string };

    const asTenantB = await app.fetch(
      new Request('http://localhost/api/proposals', {
        headers: { Authorization: `Bearer ${tenantB.accessToken}` },
      }),
      integrationEnv
    );
    const tenantBProposals = (await asTenantB.json()) as Array<{
      id: string;
    }>;
    expect(tenantBProposals.some((p) => p.id === proposal.id)).toBe(false);
  });
});
