import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

import {
  CreateItemSchema,
  PaginationQuerySchema,
  UpdateItemSchema,
} from '@manufacturing/shared';
import { requireAuth, requirePermission } from '../middleware/auth';
import type { AppEnv } from '../types';

export const itemsRouter = new Hono<AppEnv>();
itemsRouter.use('*', requireAuth);

itemsRouter.get(
  '/',
  requirePermission('items.view'),
  zValidator('query', PaginationQuerySchema),
  async (c) => {
    const { after, limit } = c.req.valid('query');

    let query = c
      .get('supabase')
      .from('items')
      .select('*')
      .eq('tenant_id', c.get('user').tenantId)
      .eq('is_archived', false)
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

itemsRouter.post(
  '/',
  requirePermission('items.create'),
  zValidator('json', CreateItemSchema),
  async (c) => {
    const body = c.req.valid('json');
    const user = c.get('user');

    const { data, error } = await c
      .get('supabase')
      .from('items')
      .insert({ ...body, tenant_id: user.tenantId, created_by: user.id })
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data, 201);
  }
);

itemsRouter.patch(
  '/:id/archive',
  requirePermission('items.archive'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const { data, error } = await c
      .get('supabase')
      .from('items')
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
  }
);

itemsRouter.patch(
  '/:id',
  requirePermission('items.edit'),
  zValidator('json', UpdateItemSchema),
  async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const user = c.get('user');

    const { data, error } = await c
      .get('supabase')
      .from('items')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json(data);
  }
);
