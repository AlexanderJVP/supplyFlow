import { Hono } from 'hono';
import { sentry } from '@hono/sentry';

import { securityHeaders } from './middleware/securityHeaders';
import { itemsRouter } from './routes/items';
import { bomRouter } from './routes/bom';
import { inventoryRouter } from './routes/inventory';
import { productionRouter } from './routes/production';
import { proposalsRouter } from './routes/proposals';
import { rolesRouter } from './routes/roles';
import { tenantsRouter } from './routes/tenants';
import { usersRouter } from './routes/users';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

// Reads SENTRY_DSN from the request's env bindings itself and no-ops when
// it's unset, so local dev / tests work unchanged without a real DSN.
app.use('*', sentry());

app.use('*', securityHeaders);

app.use('*', async (c, next) => {
  const origin = c.req.header('Origin');
  const allowedOrigins = [c.env?.ALLOWED_ORIGIN, c.env?.ADMIN_ORIGIN].filter(
    Boolean
  );

  if (origin) {
    if (!allowedOrigins.includes(origin)) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    c.header(
      'Access-Control-Allow-Methods',
      'GET, POST, PATCH, DELETE, OPTIONS'
    );
    // Browsers strip non-safelisted response headers on cross-origin
    // requests unless the server explicitly exposes them -- without this,
    // client code reading response.headers['x-next-cursor'] silently gets
    // undefined in a real browser even though it works fine in tests (which
    // call the Hono app directly, bypassing browser CORS entirely).
    c.header('Access-Control-Expose-Headers', 'X-Next-Cursor');
  }

  if (c.req.method === 'OPTIONS') return c.body(null, 204);

  await next();
});

app.get('/', (c) => c.text('Manufacturing Platform — Server'));
app.route('/api/items', itemsRouter);
app.route('/api/bom', bomRouter);
app.route('/api/inventory', inventoryRouter);
app.route('/api/production', productionRouter);
app.route('/api/proposals', proposalsRouter);
app.route('/api/roles', rolesRouter);
app.route('/api/users', usersRouter);
app.route('/api/admin/tenants', tenantsRouter);

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'manufacturing-platform-server',
  })
);

export default app;
