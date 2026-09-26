import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

import {
  CanProduceQuerySchema,
  CanProduceShortfallSchema,
  CreateProductionOrderSchema,
  PaginationQuerySchema,
  type CanProduceShortfall,
  type InsufficientStockError,
} from '@manufacturing/shared';
import { toCsv } from '../lib/csv';
import { requireAuth, requirePermission } from '../middleware/auth';
import type { AppEnv } from '../types';

// Custom SQLSTATE raised by complete_production_order when stock runs out.
const INSUFFICIENT_STOCK_SQLSTATE = 'SK409';

function parseShortfalls(details: string | undefined): CanProduceShortfall[] {
  try {
    const parsed = CanProduceShortfallSchema.array().safeParse(
      JSON.parse(details ?? '[]')
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export const productionRouter = new Hono<AppEnv>();
productionRouter.use('*', requireAuth);

productionRouter.get(
  '/',
  requirePermission('production.view'),
  zValidator('query', PaginationQuerySchema),
  async (c) => {
    const { after, limit } = c.req.valid('query');

    let query = c
      .get('supabase')
      .from('production_orders')
      .select('*')
      .eq('tenant_id', c.get('user').tenantId)
      .order('id', { ascending: true })
      .limit(limit);

    if (after) query = query.gt('id', after);

    const { data, error } = await query;

    if (error) return c.json({ error: error.message }, 500);
    if (data.length === limit) {
      c.header('X-Next-Cursor', data[data.length - 1].id as string);
    }
    return c.json(data);
  }
);

productionRouter.get(
  '/export',
  requirePermission('production.view'),
  async (c) => {
    const user = c.get('user');
    const supabase = c.get('supabase');

    const [ordersResult, itemsResult] = await Promise.all([
      supabase
        .from('production_orders')
        .select('id, item_id, quantity, status, created_at, completed_at')
        .eq('tenant_id', user.tenantId)
        .order('created_at', { ascending: false })
        .limit(10000),
      supabase
        .from('items')
        .select('id, sku, name')
        .eq('tenant_id', user.tenantId),
    ]);

    if (ordersResult.error)
      return c.json({ error: ordersResult.error.message }, 500);
    if (itemsResult.error)
      return c.json({ error: itemsResult.error.message }, 500);

    const itemById = new Map(itemsResult.data.map((item) => [item.id, item]));

    const rows = ordersResult.data.map((order) => ({
      sku: itemById.get(order.item_id)?.sku ?? order.item_id,
      name: itemById.get(order.item_id)?.name ?? '',
      quantity: order.quantity,
      status: order.status,
      created_at: order.created_at,
      completed_at: order.completed_at ?? '',
    }));

    const csv = toCsv(rows, [
      'sku',
      'name',
      'quantity',
      'status',
      'created_at',
      'completed_at',
    ]);

    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="production.csv"');
    return c.body(csv);
  }
);

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

    if (error?.code === INSUFFICIENT_STOCK_SQLSTATE) {
      // complete_production_order raises SK409 with the shortfalls as JSON
      // in DETAIL -- see migration 20260926000000_stock_lock_helper.sql.
      const body: InsufficientStockError = {
        error: 'Insufficient stock to complete production order',
        code: 'insufficient_stock',
        shortfalls: parseShortfalls(error.details),
      };
      return c.json(body, 409);
    }
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
