# Manufacturing Operations Platform — Vibecoding Spec

This document is the single source of truth for building this platform with AI assistance.
Every architectural decision is final. Do not deviate without updating this document first.

---

## What This Is

A multi-tenant SaaS platform for SME manufacturing companies (10–250 employees) that combines:

- **Inventory management** — components, sub-assemblies, finished goods with live stock levels
- **Bill of Materials (BOM)** — recursive, multi-level: a bolt → frame assembly → bicycle
- **Production orders** — building a product auto-deducts all BOM components from stock
- **Workflow approvals** — departments propose and approve changes (BOM edits, process changes)
- **Full traceability** — every stock movement is logged with who, when, why
- **Configurable roles** — each company sets their own approval chains and permissions

This is **not** a warehouse system. It is a **Manufacturing Operations Platform**.

---

## Current Development Snapshot

Phases 1-4 (auth/tenants/roles, items/BOM, inventory, production orders) and Phase 5 (workflow & proposals) are real and verified end-to-end locally, not just scaffolded. See Resume Point below for the current gaps and next steps.

- The app runs in two Docker services: `client` on `5173` and `api` on `8787` (see `docker-compose.yml`, `client/Dockerfile`, `server/Dockerfile`).
- Local Supabase runs separately through the CLI with `pnpm run db:up` and `pnpm run db:reset`.
- **Auth**: `server/src/lib/supabase.ts` (`createUserClient`/`createAdminClient`) and `server/src/middleware/auth.ts` (`requireAuth`, `requirePermission`) are implemented per the Auth Architecture section above.
- **Tenant provisioning**: `POST /api/admin/tenants` (`server/src/routes/tenants.ts`), gated by `X-Admin-Secret` matching `ADMIN_SECRET`. Creates the Supabase auth user, calls the `provision_tenant` RPC (migration `20260717000001_provision_tenant.sql` — tenant + Admin role with full permissions + profile + one workflow step per proposal type, one transaction), then sets `app_metadata`. Verified live: provisioned a tenant, logged in, and confirmed the JWT carries `tenant_id`/`role_id`/`permissions`.
- **Items**: `server/src/routes/items.ts` is Supabase-backed and now has full CRUD: `GET /` (paginated), `POST /`, `PATCH /:id` (edit), `PATCH /:id/archive`, gated by `items.create`/`items.edit`/`items.archive` and RLS-scoped by the caller's `tenant_id`. Wired into `ItemList.tsx` (inline edit row + archive button, permission-gated via the new `usePermission` hook).
- **BOM**: `server/src/routes/bom.ts` exposes `GET /:itemId/tree` (recursive-CTE RPC) and `POST /` (requires `bom.edit`). Circular references are rejected by `prevent_bom_cycle` (migration `20260717000000_bom_cycle_check.sql`), and cross-tenant references (parent/child item belonging to a different tenant than the BOM line) are rejected by `prevent_bom_cross_tenant` (migration `20260718000000_bom_tenant_check.sql`, added 2026-07-18 after a real gap was found — RLS doesn't catch this because FK lookups bypass it). `BomTreeViewer.tsx` now has a child-item + quantity form wired to `useCreateBomLine` (`client/src/hooks/useBom.ts`), gated by `bom.edit`.
- **Inventory & Production**: `server/src/routes/inventory.ts` and `server/src/routes/production.ts` are Supabase-backed and tested, including the `/inventory/alerts` reorder-point endpoint; `complete_production_order` and `can_produce` RPCs back the production-order flow, verified end-to-end for a multi-level bolt→frame→bike BOM (see `production.test.ts`). Frontend pages exist at `client/src/pages/inventory/StockDashboard.tsx`, `MovementHistory.tsx`, and `client/src/pages/production/ProductionOrders.tsx`.
- **Workflow & Proposals (Phase 5, added 2026-07-18)**: `server/src/routes/proposals.ts` (`GET /`, `POST /`, `POST /:id/submit`, `POST /:id/review`), backed by two RPCs (`20260718000001_proposal_workflow_rpc.sql`): `submit_proposal` (draft → pending_review) and `review_proposal`, which walks the tenant's per-type `workflow_steps` chain one step at a time — matching the reviewer's actual `profiles.role_id` against that step's required role, not just the coarse `proposals.review` permission — and on final approval of a `bom_change` proposal atomically applies the payload to `bom_lines` via `apply_bom_change_payload` (create/update/delete, each audited). No frontend UI yet (proposal inbox/review screen — see Resume Point).
- **Client**: `client/src/App.tsx` uses React Router v7 with real routes (`/login`, `/items`, `/inventory`, `/production`) behind a `ProtectedLayout` guard.
- `packages/shared` has schemas for items (incl. `UpdateItemSchema`), tenants, bom, inventory, production, proposals (incl. `BomChangePayloadSchema`), auth, and pagination (`PaginationQuerySchema`), re-exported from `src/index.ts`. Both `client` and `server` depend on `@manufacturing/shared` via `workspace:*`.
- **Pagination**: `items`/`production`/`inventory` list endpoints accept `?after=<uuid>&limit=<n>` (default 50, max 200) and report a next-page cursor via the `X-Next-Cursor` response header, keeping the JSON body a plain array for backward compatibility. No frontend pagination UI yet.
- `pnpm run test` (65 tests: 55 in `server/src`, 2 client schema tests, 8 shared/index) and `pnpm run typecheck` are both green — re-verified 2026-07-18.
- **Known gotcha**: Hono's bare `.use(requireAuth)` (no path argument) did not apply to a nested dynamic route (`/:itemId/tree`) even though it worked for a root `/` route — it silently left `c.get('supabase')`/`c.get('user')` unset and crashed with a 500 instead of returning 401. Always write `.use('*', requireAuth)` explicitly in new sub-routers, and cover it with an "unauthenticated request → 401" test per route (this is what caught it).
- **Another RLS gotcha (found 2026-07-18)**: `proposal_reviews` had RLS enabled since the initial schema migration but no policy was ever defined for it, so every insert — including from `review_proposal` itself, running as the authenticated user — was silently rejected with "new row violates row-level security policy". Fixed via `20260718000002_proposal_reviews_rls.sql`, scoped through the parent `proposals.tenant_id` since the table has no `tenant_id` column of its own. **Lesson**: `alter table ... enable row level security` with no matching `create policy` is a silent deny-all, not a no-op — grep for this pairing when adding a new table.
- **Known local-only quirk**: after `supabase db reset`, Kong can hold a stale IP for the `auth` container and 502 until `docker restart supabase_kong_supply`. Docker DNS-caching artifact of the CLI's restart step, not application code. A second local-only quirk: the `supabase_vector_supply` container restart-loops with `Network unreachable` reaching the Docker socket (root-caused 2026-07-18 — it's Logflare's log-shipping sidecar trying to enumerate containers for its local log viewer; unrelated to Postgres/Auth/PostgREST/Kong, doesn't affect the app or the test suite, and isn't worth chasing further since it's a Windows/Docker-Desktop quirk in the Supabase CLI's own stack, not this repo).
- Git history: schemas, auth, tenant RPC, items/BOM/inventory/production/proposals wiring, and the client are all committed — the working tree is clean (only the untracked `.claude/` dir).

### Resume Point

Phases 1-5 are real, tested, and verified end-to-end through the actual Docker Compose stack — including a full multi-level BOM → stock → production-order-completion run and a full proposal submit → review → auto-apply-BOM-change run. React Router v7 landed. Docker Compose itself is fixed (working dirs, node_modules volume paths, wrangler's local SQLite state, and container→host Supabase networking all had to be corrected — see the note above).

What's next, in order:

1. **Build the proposal inbox/review UI** — `server/src/routes/proposals.ts` (submit/review/auto-apply) has no frontend yet. Add `client/src/hooks/useProposals.ts` + a page under `client/src/pages/proposals/` (list, submit button, approve/reject/request-changes form), and a nav link in `App.tsx`.
2. **Add an item detail page** — `ItemList.tsx` covers list/inline-edit/archive, but there's no dedicated item detail view (BOM tree is reached via "View BOM" from the list, not from a detail page).
3. **Build the invite-user / manage-roles admin UI + API** — `server/src/routes/tenants.ts` only provisions brand-new tenants. There's no `roles.ts`/`users.ts` route for inviting a user to an existing tenant or editing a role's permissions, even though `admin.manage_users`/`admin.manage_roles` are already defined in the permissions shape and provisioned for the Admin role. Deferred out of this round of work as a distinct, self-contained feature (needs its own invite-flow design — email invite vs. direct create — rather than being folded into other Phase work).
4. **Add frontend pagination controls** for the items/production/inventory lists now that the API supports `?after=&limit=` + `X-Next-Cursor` — currently only the backend is done; the client hooks (`useItems`, `useProduction`, `useInventory`) still fetch unbounded first pages.
5. **CSV/Excel export for inventory and production** (Phase 6 checklist).
6. **Sentry integration (client + server)** (Phase 6 checklist).
7. **CSP headers, security headers** (`X-Frame-Options`, `X-Content-Type-Options`) (Phase 6 checklist).
8. **Rate limiting on auth routes** (Non-Negotiable Security Rule 6 — login 5/IP/15min, registration 3/IP/hour — not yet implemented anywhere).
9. **Audit-log DB trigger pattern** — Non-Negotiable Security Rule 8 says "use the DB trigger pattern," but every RPC shipped so far (`complete_production_order`, `apply_bom_change_payload`, `submit_proposal`, `review_proposal`) writes to `audit_logs` manually inside the function body instead. Works today, but either update the rule to match reality or add real triggers — the doc and the code currently disagree.
10. Re-run the full verify pass (typecheck + all tests + a live Docker E2E smoke test) after any of the above, before committing.

---

## Non-Negotiable Security Rules

These are checked on every PR. No exceptions.

1. **Never use the Supabase service-role key for data queries.** The service key is only for tenant provisioning (creating new tenants + users). Every data operation uses the user's JWT, so RLS enforces isolation automatically.

2. **RLS is the enforcement layer, not application code.** Always write `WHERE tenant_id = ?` in queries too, but the database rejects cross-tenant access even if the application forgets.

3. **Every stock mutation goes through `stock_ledger`.** Never UPDATE a stock counter directly. The ledger is append-only — no DELETE, no UPDATE on existing rows.

4. **All multi-step mutations are PostgreSQL functions (RPCs).** Produce an item → deduct components → log audit. This runs in a single transaction. Never implement this sequence in application code.

5. **Validate input at the API boundary with Zod.** Import schemas from `packages/shared`. The same schema validates the frontend form and the API handler.

6. **Rate-limit all auth endpoints.** Login: 5 attempts per IP per 15 minutes. Registration: 3 per IP per hour.

7. **Permissions are in `app_metadata` (set server-side only).** Never trust client-supplied role/permission claims.

8. **Audit every mutation.** Every route that changes data writes to `audit_logs`. Use the DB trigger pattern — do not rely on application code to remember.

9. **No wildcard CORS.** The allowlist is explicit: `[APP_ORIGIN, ADMIN_ORIGIN]`. Reject unknown origins with 403.

10. **Never log passwords, tokens, or PII.** Structured logs contain request ID, user ID, tenant ID, action — never sensitive values.

---

## Tech Stack (Final)

| Layer | Choice | Reason |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | Fast builds, great DX |
| Styling | Tailwind CSS | Utility-first, consistent |
| Data fetching | TanStack Query v5 | Caching, invalidation, optimistic updates |
| Routing | React Router v7 | File-based routes |
| Forms | React Hook Form + Zod | Typed validation, shared schemas |
| Backend | Hono on Cloudflare Workers | Edge, fast cold start, TypeScript |
| Database | Supabase PostgreSQL | Managed Postgres, RLS, realtime |
| Auth | Supabase Auth (PKCE flow) | Token rotation, MFA support, no custom JWT |
| Migrations | Supabase CLI (`supabase/migrations/`) | Version-controlled schema |
| Shared types | `packages/shared` | Same Zod schemas on client and server |
| File storage | Cloudflare R2 | Product images, export files |
| Monitoring | Sentry | Error tracking on both client and server |

---

## Monorepo Structure

```
manufacturing-platform/
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── schemas/          ← Zod schemas (one file per domain)
│       │   │   ├── items.ts
│       │   │   ├── bom.ts
│       │   │   ├── inventory.ts
│       │   │   ├── production.ts
│       │   │   ├── proposals.ts
│       │   │   └── auth.ts
│       │   ├── types/            ← Inferred TypeScript types from schemas
│       │   │   └── index.ts      ← re-exports all z.infer<typeof Schema>
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── server/
│   ├── src/
│   │   ├── index.ts              ← Hono app, CORS, route mounting
│   │   ├── types.ts              ← AppEnv (CF bindings + Variables)
│   │   ├── lib/
│   │   │   ├── supabase.ts       ← createUserClient(jwt) and createAdminClient()
│   │   │   └── errors.ts         ← typed HTTP error helpers
│   │   ├── middleware/
│   │   │   ├── auth.ts           ← requireAuth, requirePermission
│   │   │   └── rateLimit.ts      ← rate limiting for auth routes
│   │   └── routes/
│   │       ├── auth.ts
│   │       ├── tenants.ts        ← admin only (provisioning)
│   │       ├── items.ts
│   │       ├── bom.ts
│   │       ├── inventory.ts
│   │       ├── production.ts
│   │       ├── proposals.ts
│   │       ├── roles.ts
│   │       └── users.ts
│   ├── wrangler.toml
│   ├── .dev.vars                 ← local secrets (gitignored)
│   └── package.json
│
├── client/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx               ← router setup
│   │   ├── lib/
│   │   │   ├── supabase.ts       ← createBrowserClient()
│   │   │   └── api.ts            ← axios instance with auth header
│   │   ├── context/
│   │   │   └── AuthContext.tsx
│   │   ├── hooks/                ← one file per domain (useItems, useBom, etc.)
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   └── ui/               ← shared primitives (Button, Badge, Modal, etc.)
│   │   └── pages/
│   │       ├── Login.tsx
│   │       ├── Dashboard.tsx
│   │       ├── items/
│   │       ├── bom/
│   │       ├── inventory/
│   │       ├── production/
│   │       ├── proposals/
│   │       └── admin/
│   ├── vite.config.ts
│   ├── wrangler.toml
│   └── package.json
│
├── supabase/
│   ├── migrations/               ← numbered SQL files ONLY
│   │   └── 20240101000000_initial.sql
│   └── seed.sql                  ← dev seed data
│
├── pnpm-workspace.yaml
├── package.json
└── VIBEGUIDE.md                  ← this file
```

---

## Database Schema

### Core Types (enums)

```sql
CREATE TYPE item_type AS ENUM ('component', 'sub_assembly', 'finished_good');
CREATE TYPE ledger_reason AS ENUM ('received', 'consumed', 'adjusted', 'produced', 'shipped', 'returned', 'wasted');
CREATE TYPE production_status AS ENUM ('draft', 'in_progress', 'completed', 'cancelled');
CREATE TYPE proposal_status AS ENUM ('draft', 'pending_review', 'approved', 'rejected', 'withdrawn');
CREATE TYPE proposal_type AS ENUM ('bom_change', 'item_change', 'process_change');
```

### Tenants & Auth

```sql
CREATE TABLE tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,          -- used in URLs and logging
  is_active  BOOLEAN NOT NULL DEFAULT true,
  plan       TEXT NOT NULL DEFAULT 'starter',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Links Supabase Auth users to tenants and roles.
-- auth.users is managed by Supabase; profiles extends it.
CREATE TABLE profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role_id    UUID NOT NULL REFERENCES roles(id),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}',
  UNIQUE (name, tenant_id)
);
```

### Permissions Shape (stored in `roles.permissions`)

```json
{
  "items":      { "view": true, "create": false, "edit": false, "archive": false },
  "bom":        { "view": true, "edit": false },
  "inventory":  { "view": true, "adjust": false, "export": false },
  "production": { "view": true, "create": false, "complete": false, "cancel": false },
  "proposals":  { "create": true, "review": false, "approve": false },
  "admin":      { "manage_users": false, "manage_roles": false, "manage_workflow": false }
}
```

### Inventory

```sql
CREATE TABLE items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku              TEXT NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  type             item_type NOT NULL,
  unit_of_measure  TEXT NOT NULL DEFAULT 'each',
  reorder_point    NUMERIC,                  -- null = no alert
  image_url        TEXT,
  is_archived      BOOLEAN NOT NULL DEFAULT false,
  created_by       UUID NOT NULL REFERENCES profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sku, tenant_id)
);

-- Recursive BOM: parent_item_id is built FROM child_item_id (quantity of them)
CREATE TABLE bom_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  child_item_id  UUID NOT NULL REFERENCES items(id),
  quantity       NUMERIC NOT NULL CHECK (quantity > 0),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_item_id, child_item_id)
  -- Circular reference prevention: enforced via app-level check + DB trigger
);

-- APPEND ONLY. Never UPDATE or DELETE existing rows.
CREATE TABLE stock_ledger (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id        UUID NOT NULL REFERENCES items(id),
  quantity_delta NUMERIC NOT NULL,           -- positive = in, negative = out
  reason         ledger_reason NOT NULL,
  reference_type TEXT,                       -- 'production_order' | 'manual_adjustment' | etc.
  reference_id   UUID,
  user_id        UUID NOT NULL REFERENCES profiles(id),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Derived view: current stock per item per tenant
CREATE VIEW current_stock AS
  SELECT item_id, tenant_id, SUM(quantity_delta) AS quantity
  FROM stock_ledger
  GROUP BY item_id, tenant_id;
```

### Production

```sql
CREATE TABLE production_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id      UUID NOT NULL REFERENCES items(id),   -- what we're producing
  quantity     NUMERIC NOT NULL CHECK (quantity > 0),
  status       production_status NOT NULL DEFAULT 'draft',
  notes        TEXT,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by   UUID NOT NULL REFERENCES profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Workflow

```sql
CREATE TABLE proposals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type           proposal_type NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  payload        JSONB NOT NULL,             -- the actual proposed change (BOM diff, etc.)
  status         proposal_status NOT NULL DEFAULT 'draft',
  created_by     UUID NOT NULL REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE proposal_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id),
  action      TEXT NOT NULL CHECK (action IN ('approved', 'rejected', 'requested_changes')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-tenant: which roles must approve which proposal types, in what order
CREATE TABLE workflow_steps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  proposal_type proposal_type NOT NULL,
  step_order    INT NOT NULL,
  role_id       UUID NOT NULL REFERENCES roles(id),
  UNIQUE (tenant_id, proposal_type, step_order)
);
```

### Audit

```sql
-- Immutable. Populated by DB triggers, not application code.
CREATE TABLE audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  table_name TEXT NOT NULL,
  record_id  UUID NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data   JSONB,
  new_data   JSONB,
  user_id    UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## Auth Architecture

### Flow

```
1. User visits /login
2. Client calls supabase.auth.signInWithPassword({ email, password })
3. Supabase returns { access_token, refresh_token } — stored by Supabase client in localStorage
4. Client reads custom claims: supabase.auth.getUser() → user.app_metadata.tenant_id / role_id / permissions
5. For every API call: Authorization: Bearer <access_token>
6. Server creates a user-scoped Supabase client using that token
7. All DB queries run under the user's identity — RLS fires automatically
8. Access token expires in 1h — Supabase client auto-refreshes via refresh token
```

### Setting `app_metadata` (server-side only)

On tenant provisioning (POST /api/admin/tenants), the admin endpoint uses the service key to set:

```typescript
await supabaseAdmin.auth.admin.updateUserById(userId, {
  app_metadata: {
    tenant_id: tenantId,
    role_id: roleId,
    permissions: rolePermissions,
  }
})
```

This is baked into the JWT. The client cannot modify `app_metadata`.

### RLS Policies

```sql
-- Helper: read tenant_id from Supabase JWT (app_metadata)
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
$$;

-- Example policy (apply same pattern to all tables):
CREATE POLICY tenant_isolation ON items
  USING (tenant_id = current_tenant_id());
```

### Server — Two Supabase Clients

```typescript
// lib/supabase.ts

// User-scoped client: used for all data queries. RLS applies.
export function createUserClient(jwt: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  })
}

// Admin client: ONLY for tenant provisioning and user management.
// Never use this for data queries.
export function createAdminClient(env: AppBindings) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })
}
```

---

## API Patterns

### AppEnv

```typescript
// types.ts
export type UserClaims = {
  id: string
  tenantId: string
  roleId: string
  permissions: Record<string, Record<string, boolean>>
}

export type AppEnv = {
  Bindings: {
    SUPABASE_URL: string
    SUPABASE_ANON_KEY: string
    SUPABASE_SERVICE_KEY: string
    ALLOWED_ORIGIN: string
    ADMIN_ORIGIN: string
    ADMIN_SECRET: string
  }
  Variables: {
    user: UserClaims
    supabase: SupabaseClient  // user-scoped, set by requireAuth middleware
  }
}
```

### requireAuth Middleware

```typescript
// middleware/auth.ts
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  try {
    const supabase = createUserClient(token, c.env)
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return c.json({ error: 'Unauthorized' }, 401)

    const meta = user.app_metadata
    if (!meta?.tenant_id) return c.json({ error: 'No tenant assigned' }, 403)

    c.set('user', {
      id: user.id,
      tenantId: meta.tenant_id,
      roleId: meta.role_id,
      permissions: meta.permissions ?? {},
    })
    c.set('supabase', supabase)
    await next()
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
})
```

### requirePermission Middleware

```typescript
// Permission key format: 'items.create', 'bom.edit', 'admin.manage_users'
export function requirePermission(key: string) {
  const [domain, action] = key.split('.')
  return createMiddleware<AppEnv>(async (c, next) => {
    const perms = c.get('user').permissions
    if (!perms[domain]?.[action]) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  })
}
```

### Route Template

Every route file follows this exact pattern:

```typescript
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { CreateItemSchema } from '@manufacturing/shared'
import { requireAuth, requirePermission } from '../middleware/auth'
import type { AppEnv } from '../types'

export const itemsRouter = new Hono<AppEnv>()
itemsRouter.use(requireAuth)   // all routes in this file require auth

itemsRouter.get('/', async (c) => {
  const { data, error } = await c.get('supabase')
    .from('items')
    .select('*')
    .eq('tenant_id', c.get('user').tenantId)  // belt-and-suspenders: RLS also enforces this
    .eq('is_archived', false)
    .order('name')

  if (error) return c.json({ error: error.message }, 500)
  return c.json(data)
})

itemsRouter.post(
  '/',
  requirePermission('items.create'),
  zValidator('json', CreateItemSchema),
  async (c) => {
    const body = c.req.valid('json')
    const user = c.get('user')

    const { data, error } = await c.get('supabase')
      .from('items')
      .insert({ ...body, tenant_id: user.tenantId, created_by: user.id })
      .select()
      .single()

    if (error) return c.json({ error: error.message }, 500)
    return c.json(data, 201)
  }
)
```

### Critical Routes — Use PG Functions (RPCs)

These operations touch multiple tables and must be atomic:

| Action | Why RPC |
|---|---|
| Complete production order | Produce item + deduct all BOM components from stock in one transaction |
| Approve proposal with BOM changes | Apply BOM diff + write audit log atomically |
| Receive inventory | Insert stock_ledger row + optionally trigger purchase order update |
| Provision tenant | Create tenant + roles + default workflow + admin user atomically |

```typescript
// Example: complete a production order
const { error } = await supabase.rpc('complete_production_order', {
  p_production_order_id: id,
  p_tenant_id: user.tenantId,
  p_user_id: user.id,
})
```

---

## Shared Package Patterns

### Schema Definition (`packages/shared/src/schemas/items.ts`)

```typescript
import { z } from 'zod'

export const ItemTypeSchema = z.enum(['component', 'sub_assembly', 'finished_good'])

export const CreateItemSchema = z.object({
  sku: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: ItemTypeSchema,
  unit_of_measure: z.string().min(1).max(20).default('each'),
  reorder_point: z.number().positive().optional(),
})

export const UpdateItemSchema = CreateItemSchema.partial()

// Inferred types — import these everywhere
export type CreateItem = z.infer<typeof CreateItemSchema>
export type UpdateItem = z.infer<typeof UpdateItemSchema>
```

### Client Usage

```typescript
// Import the SAME schema from the shared package
import { CreateItemSchema, type CreateItem } from '@manufacturing/shared'

// In a form:
const { register, handleSubmit } = useForm<CreateItem>({
  resolver: zodResolver(CreateItemSchema),
})
```

---

## Frontend Patterns

### Query Hook Template

```typescript
// hooks/useItems.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { CreateItem } from '@manufacturing/shared'

export function useItems() {
  return useQuery({
    queryKey: ['items'],
    queryFn: () => api.get('/items').then(r => r.data),
  })
}

export function useCreateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateItem) => api.post('/items', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })
}
```

### API Client

```typescript
// lib/api.ts
import axios from 'axios'
import { supabase } from './supabase'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
})

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      supabase.auth.signOut()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)
```

### Page Template

```typescript
// pages/items/ItemList.tsx
import { useItems } from '../../hooks/useItems'
import { usePermission } from '../../hooks/usePermission'

export default function ItemList() {
  const { data: items, isLoading, error } = useItems()
  const canCreate = usePermission('items.create')

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage error={error} />

  return (
    <div>
      {canCreate && <Link to="/items/new">Add Item</Link>}
      {items?.map(item => <ItemRow key={item.id} item={item} />)}
    </div>
  )
}
```

---

## Feature Build Order

Build strictly in this sequence. Each phase must be fully working before starting the next.

### Phase 1 — Foundation (auth, tenants, roles)
- [x] Monorepo setup with `packages/shared`
- [x] Supabase project + migrations structure
- [x] Schema: `tenants`, `profiles`, `roles`, all RLS policies
- [x] Supabase Auth: sign in, sign out, session refresh
- [x] Tenant provisioning RPC + admin endpoint
- [x] `requireAuth` + `requirePermission` middleware
- [x] Login page, auth context, protected routes
- [ ] Admin: create tenant, invite user, manage roles — tenant creation only; no `roles.ts`/`users.ts` API for invite-user or manage-roles yet

### Phase 2 — Item Catalog
- [x] Schema: `items`, `bom_lines`
- [x] API: CRUD for items, BOM line management — items has `GET`/`POST`/`PATCH :id`/`PATCH :id/archive`; BOM has `GET tree`/`POST` (line edit/delete is only reachable indirectly via an approved `bom_change` proposal, not a direct BOM API — acceptable for now, revisit if a direct-edit need shows up)
- [x] BOM circular reference prevention (DB trigger + app check)
- [ ] Frontend: item list, item detail, BOM tree viewer — item list (with inline edit/archive) and BOM tree viewer (with line-add form) exist; no dedicated item detail page (see Resume Point item 2)
- [x] BOM explorer showing full recursive tree (use PostgreSQL CTE for recursion)

### Phase 3 — Inventory
- [x] Schema: `stock_ledger`, `current_stock` view
- [x] API: manual stock adjustment, stock query per item
- [x] Stock alert system (items below `reorder_point`) — `GET /api/inventory/alerts`, tested
- [x] Frontend: stock dashboard, movement history per item
- [x] Ensure `stock_ledger` has no UPDATE/DELETE routes

### Phase 4 — Production Orders
- [x] Schema: `production_orders`
- [x] RPC: `complete_production_order` (atomic: produce + deduct BOM components)
- [x] Frontend: create/start/complete production orders, BOM availability check (can we build N?)
- [x] Availability check: for a given item and quantity, compute if stock covers all BOM requirements recursively

### Phase 5 — Workflow & Proposals
- [x] Schema: `proposals`, `proposal_reviews`, `workflow_steps`
- [x] Per-tenant workflow step configuration (seeded 1-step-per-type by `provision_tenant`; `review_proposal` walks it)
- [x] API: submit proposal, route to next approver, approve/reject (`server/src/routes/proposals.ts`)
- [x] Auto-apply approved BOM change proposals via RPC (`apply_bom_change_payload`, called from `review_proposal` on final approval)
- [ ] Frontend: proposal inbox, review UI, proposal history — API-only so far, no UI (see Resume Point item 1)

### Phase 6 — Polish & Production-Readiness
- [x] Pagination on all list endpoints (cursor-based: `?after=<uuid>&limit=50`) — backend done (items/production/inventory, via `X-Next-Cursor`); no frontend pagination controls yet (see Resume Point item 4)
- [ ] CSV/Excel export for inventory and production
- [ ] Sentry integration (client + server)
- [ ] Rate limiting on auth routes
- [ ] CSP headers, security headers (`X-Frame-Options`, `X-Content-Type-Options`)
- [x] Integration tests for: tenant isolation, production order completion, approval flow — tenant isolation covered on items/bom/inventory/production/proposals; production completion and the full proposal approval flow both have dedicated tests

---

## Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| DB tables | `snake_case`, plural | `stock_ledger`, `bom_lines` |
| DB columns | `snake_case` | `tenant_id`, `created_at` |
| DB functions | `verb_noun` | `complete_production_order` |
| API routes | `kebab-case`, noun-first | `/production-orders/:id/complete` |
| TS types | `PascalCase` | `ProductionOrder`, `BomLine` |
| Zod schemas | `PascalCase + Schema` | `CreateItemSchema` |
| React components | `PascalCase` | `BomTreeViewer` |
| React hooks | `camelCase + use` | `useProductionOrders` |
| Query keys | `['domain']` or `['domain', id]` | `['items']`, `['items', itemId]` |
| Env vars (CF) | `SCREAMING_SNAKE_CASE` | `SUPABASE_SERVICE_KEY` |
| Vite env vars | `VITE_` prefix | `VITE_API_URL` |

---

## Anti-Patterns — Never Do These

```
// NEVER: service key for data queries
const supabase = createAdminClient()
const { data } = await supabase.from('items').select('*')  // ← bypasses RLS

// NEVER: update stock directly
await supabase.from('items').update({ stock_qty: newQty }).eq('id', id)  // ← no audit trail

// NEVER: multi-step mutation in application code
await supabase.from('production_orders').update({ status: 'completed' })
await supabase.from('stock_ledger').insert(...)   // ← not atomic, can fail halfway

// NEVER: cross-tenant query without explicit tenant filter
await supabase.from('items').select('*')  // ← missing .eq('tenant_id', ...)

// NEVER: trust client-supplied tenant or permission data
const { tenantId } = await req.json()  // ← use c.get('user').tenantId from JWT

// NEVER: store tokens or passwords in logs
console.log({ token, password })

// NEVER: manual SQL in Supabase dashboard
-- Run this instead: supabase migration new add_column_x

// NEVER: wildcard CORS
origin: '*'
```

---

## Dev Commands

```bash
# Install all dependencies
pnpm install

# Start everything (client :5173, server worker :8787)
pnpm run dev

# Client only
pnpm --filter client run dev

# Server only
pnpm --filter server run dev

# New migration
supabase migration new <name>

# Apply migrations locally
supabase db push

# Type-check all packages
pnpm run typecheck

# Run tests
pnpm run test

# Deploy server
pnpm --filter server run deploy

# Deploy client
pnpm --filter client run deploy
```

### Local Dev Secrets (`server/.dev.vars`)

```
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_KEY="your-service-role-key"
ALLOWED_ORIGIN="http://localhost:5173"
ADMIN_ORIGIN="http://localhost:5174"
ADMIN_SECRET="any-long-random-string-for-local-dev"
```

---

## PostgreSQL Patterns for BOM Recursion

Always use CTEs for recursive BOM traversal — never recurse in application code.

```sql
-- Get full BOM tree for a given item (all levels deep)
WITH RECURSIVE bom_tree AS (
  SELECT child_item_id, parent_item_id, quantity, 1 AS depth
  FROM bom_lines
  WHERE parent_item_id = $1 AND tenant_id = $2

  UNION ALL

  SELECT bl.child_item_id, bl.parent_item_id, bl.quantity * bt.quantity, bt.depth + 1
  FROM bom_lines bl
  JOIN bom_tree bt ON bl.parent_item_id = bt.child_item_id
  WHERE bl.tenant_id = $2
)
SELECT * FROM bom_tree;
```

```sql
-- Check if we can build N units (can we cover BOM requirements from current stock?)
-- This is a PG function called from the API before creating a production order
CREATE OR REPLACE FUNCTION can_produce(
  p_item_id UUID,
  p_quantity NUMERIC,
  p_tenant_id UUID
)
RETURNS TABLE(item_id UUID, required NUMERIC, available NUMERIC, shortfall NUMERIC)
LANGUAGE sql AS $$
  WITH RECURSIVE bom AS (
    SELECT child_item_id AS item_id, quantity * p_quantity AS required
    FROM bom_lines WHERE parent_item_id = p_item_id AND tenant_id = p_tenant_id
    UNION ALL
    SELECT bl.child_item_id, bl.quantity * b.required
    FROM bom_lines bl JOIN bom AS b ON bl.parent_item_id = b.item_id
    WHERE bl.tenant_id = p_tenant_id
  ),
  stock AS (
    SELECT item_id, SUM(quantity_delta) AS qty FROM stock_ledger
    WHERE tenant_id = p_tenant_id GROUP BY item_id
  )
  SELECT b.item_id, SUM(b.required) AS required,
         COALESCE(s.qty, 0) AS available,
         GREATEST(0, SUM(b.required) - COALESCE(s.qty, 0)) AS shortfall
  FROM bom b LEFT JOIN stock s ON b.item_id = s.item_id
  GROUP BY b.item_id, s.qty
  HAVING SUM(b.required) > 0;
$$;
```

---

*Last updated: 2026-07-18 (Phase 2 completion — item edit/archive, BOM line form, pagination, BOM cross-tenant trigger — and Phase 5 workflow/proposals shipped and verified; Current Development Snapshot, Resume Point, and Feature Build Order checklists reconciled against actual code). Update this document whenever an architectural decision changes.*
