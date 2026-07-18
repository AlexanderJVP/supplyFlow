import { createMiddleware } from 'hono/factory';

import type { AppEnv } from '../types';

// In-memory fixed-window limiter, keyed by client IP + an explicit key prefix
// (so different routes never share a bucket). This is per-Worker-isolate
// state: fine for local dev and a single-isolate deployment, but a
// production Cloudflare deployment that scales to multiple isolates needs a
// durable/KV-backed (or Cloudflare's native Rate Limiting binding) counter
// for the limit to hold across isolates -- swap the Map below for that when
// this goes to production traffic.
const buckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(c: {
  req: { header: (name: string) => string | undefined };
}) {
  return (
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export function rateLimit(options: {
  keyPrefix: string;
  windowMs: number;
  max: number;
}) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const key = `${options.keyPrefix}:${clientIp(c)}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      await next();
      return;
    }

    if (bucket.count >= options.max) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfterSeconds));
      return c.json({ error: 'Too many requests' }, 429);
    }

    bucket.count += 1;
    await next();
  });
}
