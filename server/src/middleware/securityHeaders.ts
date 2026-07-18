import { createMiddleware } from 'hono/factory';

import type { AppEnv } from '../types';

// This is a JSON-only API -- it never serves HTML, so the CSP is maximally
// strict (nothing is ever allowed to load). Applied globally, ahead of CORS,
// so the headers land on every response including 401/403/429 rejections.
export const securityHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  c.header('X-Frame-Options', 'DENY');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'"
  );
  c.header(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );
  c.header('X-Permitted-Cross-Domain-Policies', 'none');
});
