# Architecture

> Merged 2026-09-26 from `staging/architecture-snapshot-proposal.md`
> (checked against the code). `CLAUDE.md` in the repo root stays the
> detailed spec and the source of truth for rules and conventions; this
> file is the structural overview. Individual decisions live in
> `engineering/decisions/` as ADRs.

## In gewone taal

De app bestaat uit drie delen: de website die je in je browser ziet
(client), een server die alle verzoeken controleert (API), en een database
die alles bewaart. De database zelf bewaakt dat elk bedrijf alleen zijn
eigen gegevens ziet, en elke voorraadwijziging wordt als nieuwe regel in
een logboek gezet in plaats van een getal te overschrijven. Alles wat uit
meerdere stappen bestaat (zoals een productieorder afronden) gebeurt in
één keer in de database: het lukt helemaal of helemaal niet.

## Stack

- **Frontend**: React 18 + TypeScript + Vite, Tailwind CSS, TanStack Query
  v5, React Router v7, React Hook Form + Zod.
- **Backend**: Hono on Cloudflare Workers (edge runtime, TypeScript).
- **Database**: Supabase PostgreSQL — RLS-enforced multi-tenancy, plus
  PL/pgSQL functions (RPCs) for every multi-step mutation.
- **Auth**: Supabase Auth (PKCE), with tenant/role/permissions baked into
  `app_metadata` at invite/provision time (not looked up live per request).
- **Monorepo**: pnpm workspaces — `client/`, `server/`, `packages/shared/`.
  `packages/shared` holds Zod schemas used identically on both sides.
- **Monitoring**: Sentry (`@hono/sentry` server-side via toucan-js,
  `@sentry/react` client-side), DSN-gated.
- **Deploy**: server → Cloudflare Worker (`wrangler deploy`); client →
  Cloudflare Pages (`wrangler pages deploy`), both via
  `.github/workflows/deploy.yml`.

## Layer / module structure

```
packages/shared/src/schemas/   Zod schemas: items, bom, inventory,
                                production, proposals, auth, tenants,
                                roles, users, pagination
server/src/
  index.ts                     Hono app, CORS, security headers, route mounting
  middleware/
    auth.ts                    requireAuth, requirePermission
    rateLimit.ts                in-memory fixed-window rate limiter
    securityHeaders.ts          CSP, HSTS, X-Frame-Options, etc.
  lib/
    supabase.ts                 createUserClient (RLS-scoped) / createAdminClient
    csv.ts                      CSV export helper
  routes/                      one file per domain: tenants, items, bom,
                                inventory, production, proposals, roles, users
                                (each with a co-located *.test.ts integration test)
client/src/
  lib/                          supabase.ts, api.ts (axios + auth interceptor)
  context/                      AuthContext
  hooks/                        one file per domain (useItems, useBom,
                                useCursorPagination, useDownloadCsv, ...)
  pages/                        items, bom, inventory, production,
                                proposals, admin — each behind ProtectedLayout
supabase/migrations/            numbered SQL files: schema, RPCs, triggers,
                                RLS policies — the only path for schema change
```

## Notable patterns / implicit decisions

- **RLS is the real enforcement boundary, not application code.** Every
  route also filters explicitly by `tenant_id` as belt-and-suspenders, but
  the DB is what actually blocks cross-tenant access.
- **Every multi-step mutation is a single PostgreSQL function**, never a
  sequence of application-code calls — `complete_production_order`,
  `review_proposal`/`apply_bom_change_payload`, `provision_tenant`. This
  is enforced by convention/review, not by a lint rule.
- **`stock_ledger` is append-only** — current stock is always derived
  (`current_stock` view, `SUM(quantity_delta)`), never a stored counter.
- **Permissions are baked into the JWT `app_metadata` at invite/role-
  assignment time**, not looked up live — so changing a role's
  permissions requires explicitly re-pushing the new snapshot to every
  current holder's `app_metadata` (see `roles.ts`), not just new invites.
- **Audit logging is a single generic DB trigger** (`log_audit_event`)
  attached to actively-mutated tables, deliberately not duplicated onto
  tables that are already their own append-only audit trail
  (`stock_ledger`, `proposal_reviews`).
- **Login never touches the server.** The client calls
  `supabase.auth.signInWithPassword` directly; the server only ever sees
  an already-issued access token. This is why login has no server-side
  rate limit — GoTrue's own limits are the actual protection.
- **Recursive BOM traversal is always a PostgreSQL recursive CTE**, never
  recursion in application code — both for the tree view and for
  `can_produce`'s availability check.
- **Cross-cutting DB integrity is trigger-enforced, not just app-level**:
  `prevent_bom_cycle` and `prevent_bom_cross_tenant` exist because FK
  lookups (and RLS) don't catch a cross-tenant BOM line by themselves.
- **CSV export is capped at 10k rows** with no pagination on the export
  endpoints themselves — a known, accepted limitation at current SME
  scale, not an oversight.
- Two Docker services (`client`, `server`) for local app dev; Supabase
  runs as a separate local stack via the Supabase CLI, not through
  Compose — a deliberate split between "app containers" and "database
  stack."

## Decisions

| ADR | Onderwerp | Status |
|---|---|---|
| `ADR-001` | Background jobs via Cloudflare Queues + Postgres `jobs` table; stock reservations in Postgres with advisory locks (not RabbitMQ / Durable Objects) | accepted |
| `ADR-002` | Multiple warehouses/locations, `move_stock`, fulfillment orders (pick/pack/ship); one-time backfill exception to the append-only rule | accepted |
| `ADR-003` | `permission_version` check so revoked permissions stop working on the next request (DB is source of truth, token self-repairs) | accepted |
| `ADR-004` | Platform-owner access to customer tenants via a visible, customer-removable support account (one login = one tenant) | accepted |

## Known structural gaps

- **Concurrent stock consumption:** derived stock (`SUM` over
  `stock_ledger`) has no lock today, so concurrent production
  completions can overdraw it — `STORY-043`.
- **No index on `stock_ledger`** beyond its primary key; fine at current
  volume, revisit as it grows (noted in `ADR-002`).
- **Client signs out on every 401** (`client/src/lib/api.ts`), it never
  refreshes-and-retries — relevant to `ADR-003`.
