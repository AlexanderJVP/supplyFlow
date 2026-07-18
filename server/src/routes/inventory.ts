import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

import {
  AdjustStockSchema,
  PaginationQuerySchema,
} from '@manufacturing/shared';
import { requireAuth, requirePermission } from '../middleware/auth';
import type { AppEnv } from '../types';

export const inventoryRouter = new Hono<AppEnv>();
inventoryRouter.use('*', requireAuth);

inventoryRouter.get(
  '/',
  requirePermission('inventory.view'),
  zValidator('query', PaginationQuerySchema),
  async (c) => {
    const user = c.get('user');
    const supabase = c.get('supabase');
    const { after, limit } = c.req.valid('query');

    let itemsQuery = supabase
      .from('items')
      .select('id, sku, name, unit_of_measure, reorder_point')
      .eq('tenant_id', user.tenantId)
      .eq('is_archived', false)
      .order('id', { ascending: true })
      .limit(limit);
    if (after) itemsQuery = itemsQuery.gt('id', after);

    const [itemsResult, stockResult] = await Promise.all([
      itemsQuery,
      supabase
        .from('current_stock')
        .select('item_id, quantity')
        .eq('tenant_id', user.tenantId),
    ]);

    if (itemsResult.error)
      return c.json({ error: itemsResult.error.message }, 500);
    if (stockResult.error)
      return c.json({ error: stockResult.error.message }, 500);

    const quantityByItem = new Map(
      stockResult.data.map((row) => [row.item_id, row.quantity])
    );

    const stockWithItems = itemsResult.data.map((item) => ({
      item_id: item.id,
      sku: item.sku,
      name: item.name,
      unit_of_measure: item.unit_of_measure,
      reorder_point: item.reorder_point,
      quantity: quantityByItem.get(item.id) ?? 0,
    }));

    if (itemsResult.data.length === limit) {
      c.header(
        'X-Next-Cursor',
        itemsResult.data[itemsResult.data.length - 1].id
      );
    }
    return c.json(stockWithItems);
  }
);

inventoryRouter.get(
  '/alerts',
  requirePermission('inventory.view'),
  async (c) => {
    const user = c.get('user');
    const supabase = c.get('supabase');

    const [itemsResult, stockResult] = await Promise.all([
      supabase
        .from('items')
        .select('id, sku, name, reorder_point')
        .eq('tenant_id', user.tenantId)
        .eq('is_archived', false)
        .not('reorder_point', 'is', null),
      supabase
        .from('current_stock')
        .select('item_id, quantity')
        .eq('tenant_id', user.tenantId),
    ]);

    if (itemsResult.error)
      return c.json({ error: itemsResult.error.message }, 500);
    if (stockResult.error)
      return c.json({ error: stockResult.error.message }, 500);

    const quantityByItem = new Map(
      stockResult.data.map((row) => [row.item_id, row.quantity])
    );

    const alerts = itemsResult.data
      .map((item) => {
        const quantity = quantityByItem.get(item.id) ?? 0;
        const reorderPoint = item.reorder_point as number;
        return {
          item_id: item.id,
          sku: item.sku,
          name: item.name,
          quantity,
          reorder_point: reorderPoint,
          shortfall: Math.max(0, reorderPoint - quantity),
        };
      })
      .filter((alert) => alert.quantity < alert.reorder_point);

    return c.json(alerts);
  }
);

inventoryRouter.post(
  '/adjust',
  requirePermission('inventory.adjust'),
  zValidator('json', AdjustStockSchema),
  async (c) => {
    const body = c.req.valid('json');
    const user = c.get('user');

    const { data, error } = await c
      .get('supabase')
      .from('stock_ledger')
      .insert({ ...body, tenant_id: user.tenantId, user_id: user.id })
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 201);
  }
);

inventoryRouter.get(
  '/:itemId/history',
  requirePermission('inventory.view'),
  async (c) => {
    const itemId = c.req.param('itemId');
    const user = c.get('user');

    const { data, error } = await c
      .get('supabase')
      .from('stock_ledger')
      .select('*')
      .eq('tenant_id', user.tenantId)
      .eq('item_id', itemId)
      .order('created_at', { ascending: false });

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
  }
);
