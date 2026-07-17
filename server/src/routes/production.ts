import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

import {
  CanProduceQuerySchema,
  CreateProductionOrderSchema,
} from '@manufacturing/shared';
import { requireAuth, requirePermission } from '../middleware/auth';
import type { AppEnv } from '../types';

export const productionRouter = new Hono<AppEnv>();
productionRouter.use('*', requireAuth);

productionRouter.get('/', requirePermission('production.view'), async (c) => {
  const { data, error } = await c
    .get('supabase')
    .from('production_orders')
    .select('*')
    .eq('tenant_id', c.get('user').tenantId)
    .order('created_at', { ascending: false });

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

productionRouter.get(
  '/can-produce',
  requirePermission('production.view'),
  zValidator('query', CanProduceQuerySchema),
  async (c) => {
    const { item_id, quantity } = c.req.valid('query');
    const user = c.get('user');

    const { data, error } = await c.get('supabase').rpc('can_produce', {
      p_item_id: item_id,
      p_quantity: quantity,
      p_tenant_id: user.tenantId,
    });

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
  }
);

productionRouter.post(
  '/',
  requirePermission('production.create'),
  zValidator('json', CreateProductionOrderSchema),
  async (c) => {
    const body = c.req.valid('json');
    const user = c.get('user');

    const { data, error } = await c
      .get('supabase')
      .from('production_orders')
      .insert({ ...body, tenant_id: user.tenantId, created_by: user.id })
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 201);
  }
);

productionRouter.post(
  '/:id/start',
  requirePermission('production.create'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const { data, error } = await c
      .get('supabase')
      .from('production_orders')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .eq('status', 'draft')
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
  }
);

productionRouter.post(
  '/:id/complete',
  requirePermission('production.complete'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const { data, error } = await c
      .get('supabase')
      .rpc('complete_production_order', {
        p_production_order_id: id,
        p_tenant_id: user.tenantId,
        p_user_id: user.id,
      })
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
  }
);

productionRouter.post(
  '/:id/cancel',
  requirePermission('production.cancel'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const { data, error } = await c
      .get('supabase')
      .from('production_orders')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .in('status', ['draft', 'in_progress'])
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
  }
);
