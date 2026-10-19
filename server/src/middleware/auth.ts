import { createMiddleware } from 'hono/factory';

import { createUserClient } from '../lib/supabase';
import type { AppEnv } from '../types';

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  try {
    const supabase = createUserClient(token, c.env);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return c.json({ error: 'Unauthorized' }, 401);

    const meta = user.app_metadata;
    if (!meta?.tenant_id) return c.json({ error: 'No tenant assigned' }, 403);

    c.set('user', {
      id: user.id,
      tenantId: meta.tenant_id,
      roleId: meta.role_id,
      permissions: meta.permissions ?? {},
    });
    c.set('supabase', supabase);
    await next();
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
});

// Permission key format: 'items.create', 'bom.edit', 'admin.manage_users'
export function requirePermission(key: string) {
  return requireAnyPermission(key);
}

// Passes when the caller holds at least one of the given permissions. A
// missing domain block counts as "not held" (stored JSON can lack one).
export function requireAnyPermission(...keys: string[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const perms = c.get('user').permissions as Record<
      string,
      Record<string, boolean> | undefined
    >;
    const allowed = keys.some((key) => {
      const [domain, action] = key.split('.');
      return perms[domain]?.[action] === true;
    });
    if (!allowed) return c.json({ error: 'Forbidden' }, 403);
    await next();
  });
}
