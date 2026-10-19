import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

import { CreateBomLineSchema } from '@manufacturing/shared';
import {
  requireAnyPermission,
  requireAuth,
  requirePermission,
} from '../middleware/auth';
import type { AppEnv } from '../types';

export const bomRouter = new Hono<AppEnv>();
bomRouter.use('*', requireAuth);

bomRouter.get('/:itemId/tree', requirePermission('bom.view'), async (c) => {
  const itemId = c.req.param('itemId');

  const { data, error } = await c.get('supabase').rpc('get_bom_tree', {
    p_item_id: itemId,
    p_tenant_id: c.get('user').tenantId,
  });

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

// Direct (non-recursive) BOM lines for one parent item, including each
// line's own id -- unlike /tree (the recursive CTE, which aggregates
// quantities across levels and never exposes bom_lines.id), this is what a
// bom_change proposal editor needs to target existing lines for update/delete
// -- so proposals.view grants it as well as bom.view.
bomRouter.get(
  '/:itemId/lines',
  requireAnyPermission('bom.view', 'proposals.view'),
  async (c) => {
    const itemId = c.req.param('itemId');

    const { data, error } = await c
      .get('supabase')
      .from('bom_lines')
      .select(
        'id, tenant_id, parent_item_id, child_item_id, quantity, notes, created_at'
      )
      .eq('parent_item_id', itemId)
      .eq('tenant_id', c.get('user').tenantId)
      .order('created_at');

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
  }
);

bomRouter.post(
  '/',
  requirePermission('bom.edit'),
  zValidator('json', CreateBomLineSchema),
  async (c) => {
    const body = c.req.valid('json');

    const { data, error } = await c
      .get('supabase')
      .from('bom_lines')
      .insert({ ...body, tenant_id: c.get('user').tenantId })
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 201);
  }
);
