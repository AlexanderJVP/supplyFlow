import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

import {
  BomChangePayloadSchema,
  CreateProposalReviewSchema,
  CreateProposalSchema,
} from '@manufacturing/shared';
import { requireAuth, requirePermission } from '../middleware/auth';
import type { AppEnv } from '../types';

export const proposalsRouter = new Hono<AppEnv>();
proposalsRouter.use('*', requireAuth);

proposalsRouter.get('/', requirePermission('proposals.view'), async (c) => {
  const { data, error } = await c
    .get('supabase')
    .from('proposals')
    .select('*')
    .eq('tenant_id', c.get('user').tenantId)
    .order('created_at', { ascending: false });

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

proposalsRouter.post(
  '/',
  requirePermission('proposals.create'),
  zValidator('json', CreateProposalSchema),
  async (c) => {
    const body = c.req.valid('json');
    const user = c.get('user');

    if (body.type === 'bom_change') {
      const payloadCheck = BomChangePayloadSchema.safeParse(body.payload);
      if (!payloadCheck.success) {
        return c.json(
          {
            error: 'Invalid bom_change payload',
            issues: payloadCheck.error.issues,
          },
          400
        );
      }
    }

    const { data, error } = await c
      .get('supabase')
      .from('proposals')
      .insert({ ...body, tenant_id: user.tenantId, created_by: user.id })
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 201);
  }
);

proposalsRouter.post(
  '/:id/submit',
  requirePermission('proposals.create'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const { data, error } = await c
      .get('supabase')
      .rpc('submit_proposal', {
        p_proposal_id: id,
        p_tenant_id: user.tenantId,
        p_user_id: user.id,
      })
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
  }
);

proposalsRouter.post(
  '/:id/review',
  requirePermission('proposals.review'),
  zValidator('json', CreateProposalReviewSchema),
  async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const user = c.get('user');

    const { data, error } = await c
      .get('supabase')
      .rpc('review_proposal', {
        p_proposal_id: id,
        p_tenant_id: user.tenantId,
        p_reviewer_id: user.id,
        p_action: body.action,
        p_notes: body.notes ?? null,
      })
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
  }
);
