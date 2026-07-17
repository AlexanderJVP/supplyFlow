import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

import { CreateBomLineSchema } from '@manufacturing/shared';
import { requireAuth, requirePermission } from '../middleware/auth';
import type { AppEnv } from '../types';

export const bomRouter = new Hono<AppEnv>();
bomRouter.use('*', requireAuth);

bomRouter.get('/:itemId/tree', async (c) => {
  const itemId = c.req.param('itemId');

  const { data, error } = await c.get('supabase').rpc('get_bom_tree', {
    p_item_id: itemId,
    p_tenant_id: c.get('user').tenantId,
  });

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

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
