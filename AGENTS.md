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
- The client and API run in Docker as separate services; the containers currently start with `pnpm dlx` entrypoints because bind mounts hide package-local `node_modules`.
- The local Supabase stack is managed separately by the CLI and is healthy except for the expected `supabase_vector_supply` restart loop. **New quirk observed 2026-07-17:** after `supabase db reset` restarts containers, Kong sometimes keeps a stale internal IP for the `auth` container and returns "An invalid response was received from the upstream server" / 502s until `docker restart supabase_kong_supply`. Not caused by app code — a Docker DNS-caching artifact of the CLI's restart sequence.
- Auth, items, and BOM are now real: `requireAuth`/`requirePermission` (`server/src/middleware/auth.ts`), user/admin Supabase clients (`server/src/lib/supabase.ts`), and `/api/items` + `/api/bom/:itemId/tree` are Supabase-backed (RLS-scoped by JWT `tenant_id`). Verified end-to-end locally: provisioned a real tenant via `POST /api/admin/tenants`, signed in, created items/BOM lines, and confirmed the client renders them in a real browser (Playwright).
- Tenant provisioning is live: `POST /api/admin/tenants` (`server/src/routes/tenants.ts`, gated by `X-Admin-Secret` matching `ADMIN_SECRET`) creates the auth user, calls the `provision_tenant` RPC (tenant + Admin role + profile + default workflow steps, one transaction), then sets `app_metadata` — matches the exact flow in claude.md.
- BOM circular-reference protection is a DB trigger (`prevent_bom_cycle`, migration `20260717000000_bom_cycle_check.sql`) — verified it rejects both self-references and cycles via direct SQL.
- The client (`client/src/App.tsx`) is a minimal Login → Items list → BOM tree viewer flow (no router yet — plain conditional rendering). Needs `client/.env` with `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`VITE_API_URL` (see `client/.env.example`); `server/.dev.vars` needs the matching values (see `server/.dev.vars.example`).
- `pnpm run test` (10 tests) and `pnpm run typecheck` both pass across `packages/shared`, `client`, and `server`.
- Gotcha hit and fixed: Hono's bare `.use(requireAuth)` (no path) did not apply to a nested route (`/:itemId/tree`) even though it worked for a root `/` route — silently left `c.get('supabase')` undefined and crashed with a 500 instead of a 401. Fixed by using `.use('*', requireAuth)` explicitly in every sub-router. If you add a new router, use the `'*'` form, not the bare form.
- Git history: two commits total (`34b9eec`, `456cf10` — the gitignore/node_modules fix). Everything else in this note (schemas, Supabase wiring, tenant RPC, BOM trigger/RPC, client wiring) is uncommitted in the working tree as of 2026-07-17 — review and commit when ready.

Last updated: 2026-07-17
