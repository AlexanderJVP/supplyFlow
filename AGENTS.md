# AGENTS.md — Repo agent instructions

Purpose: give AI coding agents the minimal, actionable guidance needed to be productive in this repo.

Quick start
- Install: `pnpm install`
- Run dev (client + server): `pnpm run dev`
- Run server only: `pnpm --filter server run dev`
- Run local app containers: `docker compose up -d --build`
- Start the local Supabase stack: `pnpm run db:up`
- Run tests: `pnpm run test`

Key sources
- Architecture & rules: see [claude.md](claude.md#L1)

Agent rules (short)
- Follow the Non‑Negotiable Security Rules in [claude.md](claude.md#L1). Do NOT use the Supabase service key for data queries.
- Prefer RPCs for multi-step DB mutations; changes touching data integrity must be implemented as PG functions and tested.
- Link rather than copy: reference existing docs (e.g., [claude.md](claude.md#L1)) instead of embedding large sections.
- Before changing architecture or core patterns, propose a short plan and get confirmation.
- Run `pnpm run test` and `pnpm run typecheck` locally before committing changes.
- Create changes on a feature branch named `ai/<short-descriptor>` and open a PR with a short summary and test evidence.

If missing context
- Ask one concise clarifying question (tenant, API contract, expected behavior) rather than guessing.

Suggested next customizations
- `create-skill test-runner` — a skill that runs `pnpm run test` and reports failures.
- `create-agent ci-helper` — helper agent that formats commits, runs tests, and opens PR drafts.

Current repo state
- The client and API run in Docker as separate services; the containers start with `pnpm dlx` entrypoints because bind mounts hide package-local `node_modules`.
- **Docker Compose fixed 2026-07-17** (four stacked bugs — working dirs, node_modules volume paths, Wrangler's local SQLite state needing a real filesystem, container→host Supabase networking via `host.docker.internal`).
- **New dependency? `docker compose down -v` before your next `up --build`.** The api/client containers' `node_modules` live in named Docker volumes that persist across rebuilds — `docker compose up --build` alone does NOT pick up a newly-added package.json dependency, because the volume still holds the old install and shadows the freshly-built image's node_modules. Hit this exact failure (`Could not resolve "@hono/sentry"`) during a live Docker smoke test on 2026-07-18; fixed by `down -v` + `up -d --build`. `-v` here only drops these disposable node_modules/wrangler-state volumes, not the separate Supabase Postgres volume.
- The local Supabase stack is managed separately by the CLI. Two known quirks, neither caused by app code: (1) after `supabase db reset` restarts containers, Kong sometimes keeps a stale internal IP for the `auth` container and 502s until `docker restart supabase_kong_supply`; (2) `supabase_vector_supply` restart-loops with `Network unreachable` — root-caused 2026-07-18: it's Logflare's log-shipping sidecar failing to reach the Docker socket on this Windows/Docker-Desktop setup, unrelated to Postgres/Auth/PostgREST/Kong. Neither has ever affected the app or the test suite.
- Every domain is real and Supabase-backed, RLS-scoped by JWT `tenant_id`: auth, items (full CRUD), BOM (create + tenant/cycle-checked), inventory, production, proposals/workflow, and admin (invite-user/manage-roles). Routers under `server/src/routes/`: `items`, `bom`, `inventory`, `production`, `proposals`, `roles`, `users`, `tenants`.
- Tenant provisioning: `POST /api/admin/tenants` (gated by `X-Admin-Secret`, rate-limited 3/IP/hour). Admin invite-user/manage-roles: `roles.ts` + `users.ts` — editing a role or reassigning a user's role also syncs `app_metadata` via the admin client, since permissions are baked into the JWT at invite time, not looked up live.
- BOM integrity: two DB triggers, `prevent_bom_cycle` (self-reference/circular) and `prevent_bom_cross_tenant` (parent/child item must belong to the BOM line's own tenant — a plain FK check bypasses RLS).
- Audit logging is a single generic DB trigger (`log_audit_event`, migration `20260718000003_audit_log_triggers.sql`) attached to `items`/`bom_lines`/`production_orders`/`proposals`/`roles`/`profiles` — not `stock_ledger`/`proposal_reviews` (already their own append-only trail) or `tenants`/`workflow_steps` (service-role bootstrapping).
- The client (`client/src/App.tsx`) uses React Router v7: `/items`, `/items/:id`, `/inventory`, `/production`, `/proposals`, `/admin`, all behind `ProtectedLayout`. Needs `client/.env` (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`VITE_API_URL`, optionally `VITE_SENTRY_DSN`) and `server/.dev.vars` with matching values (optionally `SENTRY_DSN`) — see the `.example` files.
- `pnpm run test` (76 tests) and `pnpm run typecheck` both pass — re-verified 2026-07-18, plus a full live Docker E2E smoke test (provision tenant → item → BOM line → stock → production order complete → proposal submit/approve → CSV export → pagination header, all through the real containers).
- Gotcha hit and fixed: Hono's bare `.use(requireAuth)` (no path) doesn't apply to a nested route — always `.use('*', requireAuth)` in new sub-routers.
- RLS gotcha hit and fixed: `enable row level security` with no matching `create policy` is a silent deny-all (hit this with `proposal_reviews`) — check for the pairing whenever you add a table.
- **Real, still-open schema gap found via the live smoke test 2026-07-18**: `proposal_reviews.reviewer_id` (and `items.created_by`, `stock_ledger.user_id`, `production_orders.created_by`, `proposals.created_by`) reference `profiles(id)` with no `ON DELETE` behavior — a tenant that's ever had a proposal reviewed can't be cascade-deleted through `tenants` (two independent cascade paths race). `SET NULL` + dropping `NOT NULL` on those columns is the likely fix but is a real design decision — see `claude.md`'s Resume Point. Test cleanup (`server/src/test/integrationHelpers.ts`'s `cleanupTenant`) now works around it and throws instead of silently leaving orphaned test tenants behind (it used to swallow the delete error).
- Git history: everything is committed on `master` in small single-purpose commits; working tree is clean except the untracked `.claude/` dir.
- Phases 1-5 plus most of Phase 6 (polish/production-readiness) work end-to-end. See `claude.md`'s Resume Point for the ordered remaining list (the FK gap above, a structured BOM-diff editor for proposals, reconciling the login-rate-limit doc wording, etc.).

Last updated: 2026-07-18
