import { Hono } from 'hono';

import { itemsRouter } from './routes/items';
import { bomRouter } from './routes/bom';
import { inventoryRouter } from './routes/inventory';
import { productionRouter } from './routes/production';
import { proposalsRouter } from './routes/proposals';
import { tenantsRouter } from './routes/tenants';
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

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
app.route('/api/admin/tenants', tenantsRouter);

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'manufacturing-platform-server',
  })
);

export default app;
