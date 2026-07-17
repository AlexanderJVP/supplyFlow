import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

import { CreateItemSchema } from '@manufacturing/shared';
import { requireAuth, requirePermission } from '../middleware/auth';
import type { AppEnv } from '../types';

export const itemsRouter = new Hono<AppEnv>();
itemsRouter.use('*', requireAuth);

itemsRouter.get('/', async (c) => {
  const { data, error } = await c
    .get('supabase')
    .from('items')
    .select('*')
    .eq('tenant_id', c.get('user').tenantId)
    .eq('is_archived', false)
    .order('name');

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

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
