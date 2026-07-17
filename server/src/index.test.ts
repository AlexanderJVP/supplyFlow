import { describe, expect, it } from 'vitest';

import app from './index';

describe('server health endpoint', () => {
  it('returns the expected root text', async () => {
    const response = await app.fetch(new Request('http://localhost/'));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('Manufacturing Platform — Server');
  });

  it('returns the expected health payload', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/health')
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      service: 'manufacturing-platform-server',
    });
  });
});

describe('CORS allowlist', () => {
  it('rejects requests from an origin outside the allowlist', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/health', {
        headers: { Origin: 'https://evil.example.com' },
      }),
      {
        ALLOWED_ORIGIN: 'http://localhost:5173',
        ADMIN_ORIGIN: 'http://localhost:5174',
      }
    );

    expect(response.status).toBe(403);
  });

  it('allows requests from the configured app origin', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/health', {
        headers: { Origin: 'http://localhost:5173' },
      }),
      {
        ALLOWED_ORIGIN: 'http://localhost:5173',
        ADMIN_ORIGIN: 'http://localhost:5174',
      }
    );

    expect(response.status).toBe(200);
  });
});

describe('items route auth', () => {
  it('rejects unauthenticated reads', async () => {
    const response = await app.fetch(new Request('http://localhost/api/items'));
    expect(response.status).toBe(401);
  });

  it('rejects unauthenticated writes', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: 'XYZ-789',
          name: 'Plate',
          type: 'sub_assembly',
        }),
      })
    );
    expect(response.status).toBe(401);
  });
});

describe('bom route auth', () => {
  it('rejects unauthenticated tree reads', async () => {
    const response = await app.fetch(
      new Request(
        'http://localhost/api/bom/00000000-0000-0000-0000-000000000001/tree'
      )
    );
    expect(response.status).toBe(401);
  });

  it('rejects unauthenticated writes', async () => {
    const response = await app.fetch(
      new Request('http://localhost/api/bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_item_id: '00000000-0000-0000-0000-000000000001',
          child_item_id: '00000000-0000-0000-0000-000000000002',
          quantity: 1,
        }),
      })
    );
    expect(response.status).toBe(401);
  });
});
