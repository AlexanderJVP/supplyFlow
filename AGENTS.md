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
- **Docker Compose fixed 2026-07-17** (previously four stacked bugs, verified working end-to-end via curl through both containers): (1) both services now set `working_dir` into `server/`/`client/` so Wrangler/Vite find their config files instead of running from the bind-mounted repo root; (2) named `node_modules` volumes were mounted at the wrong path (`/workspace/node_modules`) — pnpm's isolated linker puts each package's real symlinks in `<package>/node_modules` (plus the root `.pnpm` store and `packages/shared/node_modules`), so those specific paths each need their own volume or the bind mount shadows them with the host's Windows-installed copies; (3) Wrangler's local D1/DO SQLite storage (`server/.wrangler`) needs a real mmap-capable filesystem — WAL mode's shared-memory file can't open over the bind-mounted Windows path (`SQLITE_IOERR_SHMOPEN`), so it also needs its own volume; (4) `.dev.vars`' `SUPABASE_URL=http://127.0.0.1:54321` is host-relative — inside the `api` container `127.0.0.1` is the container itself, not the host running Supabase, so the compose command overrides it with `--var SUPABASE_URL:http://host.docker.internal:54321`.
- The local Supabase stack is managed separately by the CLI. Two known quirks, neither caused by app code: (1) after `supabase db reset` restarts containers, Kong sometimes keeps a stale internal IP for the `auth` container and 502s until `docker restart supabase_kong_supply` (Docker DNS-caching artifact of the CLI's restart sequence); (2) `supabase_vector_supply` restart-loops with `Network unreachable` — root-caused 2026-07-18: it's Logflare's log-shipping sidecar failing to reach the Docker socket on this Windows/Docker-Desktop setup, unrelated to Postgres/Auth/PostgREST/Kong. Neither has ever affected the app or the test suite.
- Auth, items (full CRUD), BOM (create + tenant/cycle-checked), inventory, production, and proposals/workflow are all real and Supabase-backed, RLS-scoped by JWT `tenant_id`: `requireAuth`/`requirePermission` (`server/src/middleware/auth.ts`), user/admin Supabase clients (`server/src/lib/supabase.ts`), and the routers under `server/src/routes/` (`items`, `bom`, `inventory`, `production`, `proposals`, `tenants`).
- Tenant provisioning is live: `POST /api/admin/tenants` (`server/src/routes/tenants.ts`, gated by `X-Admin-Secret` matching `ADMIN_SECRET`) creates the auth user, calls the `provision_tenant` RPC (tenant + Admin role + profile + default workflow steps, one transaction), then sets `app_metadata`.
- BOM circular-reference protection is a DB trigger (`prevent_bom_cycle`); cross-tenant BOM references (added 2026-07-18) are a second trigger (`prevent_bom_cross_tenant`) since a plain FK check bypasses RLS.
- The client (`client/src/App.tsx`) uses React Router v7 with real routes (`/login`, `/items`, `/inventory`, `/production`) behind a `ProtectedLayout` guard. Needs `client/.env` with `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`VITE_API_URL` (see `client/.env.example`); `server/.dev.vars` needs the matching values (see `server/.dev.vars.example`). No proposals UI yet — API-only.
- `pnpm run test` (65 tests: 55 in `server/src`, 2 client schema tests, 8 shared/index) and `pnpm run typecheck` both pass across `packages/shared`, `client`, and `server` — re-verified 2026-07-18 with the local Supabase stack up.
- Gotcha hit and fixed: Hono's bare `.use(requireAuth)` (no path) did not apply to a nested route (`/:itemId/tree`) even though it worked for a root `/` route — silently left `c.get('supabase')` undefined and crashed with a 500 instead of a 401. Fixed by using `.use('*', requireAuth)` explicitly in every sub-router. If you add a new router, use the `'*'` form, not the bare form.
- Second RLS gotcha hit and fixed 2026-07-18: `proposal_reviews` had `enable row level security` but no matching `create policy` since the initial migration, so every insert into it was silently denied. That combination is a silent deny-all, not a no-op — check for it whenever you add a new table.
- Git history: schemas, Supabase wiring, tenant RPC, BOM triggers/RPCs, inventory/production, proposals/workflow, and client wiring are all committed — working tree is clean except for the untracked `.claude/` dir.
- Phases 1-5 (auth/tenants/roles, items/BOM, inventory, production orders, workflow/proposals) work end-to-end. Known gaps: no proposal inbox/review UI, no item detail page, no invite-user/manage-roles admin UI+API, and pagination (`?after=&limit=`, done on items/production/inventory) has no frontend controls yet. See `claude.md`'s Resume Point for the full ordered list.

Last updated: 2026-07-18
