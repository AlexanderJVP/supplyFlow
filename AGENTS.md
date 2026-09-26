# AGENTS.md — Repo agent instructions

Purpose: give AI coding agents the minimal, actionable guidance needed to be productive in this repo.

**New session? Read the "▶ Start Here — Next Session" section in [claude.md](claude.md#L1) first** — current sprint, what to do next, and how to work with the product owner.

Quick start
- Install: `pnpm install`
- Run dev (client + server): `pnpm run dev`
- Run server only: `pnpm --filter server run dev`
- Run local app containers: `docker compose up -d --build`
- Start the local Supabase stack: `pnpm run db:up`
- Run tests: `pnpm run test`

Key sources
- Architecture & rules: see [claude.md](claude.md#L1)
- Product vision: see the "Product Vision" section in [claude.md](claude.md#L1) — read it before designing any feature
- Backlog, roadmap, ADRs: `.project/` (`scrum/product-backlog.md`, `product/roadmap.md`, `engineering/decisions/`); new AI-written stories/ADRs go to `.project/staging/` for human review, never straight into `product/` or `engineering/decisions/`

Product intent (short — details in claude.md)
- **Russian doll:** every in-house product is also an item that can be a component of a bigger product. `item_type` is a label, never a structural limit — don't special-case "top-level product" vs "component". Each item must be viewable on its own at any level (BOM down; where-used up — not built yet).
- **Change proposals replace meetings:** e.g. "use a Phillips screw instead" is proposed, reviewed by the configured roles in order, and decided in the app. A reviewer must be able to see what changes, its impact, the review history and who is next — today the review screen shows only title/type/status, and approval chains aren't configurable yet.
- **Onboarding is a service:** the owner configures each customer's roles, access and approval chains by hand — never hard-code a company's organisation. **Visibility is per page, not per record**: hide/refuse whole pages by permission (copy the Admin page's pattern); don't build per-department data filters.
- **Goal:** effective stock management for manufacturing SMEs; own use first, SaaS later — keep tenant isolation and per-tenant configuration first-class.
- The product owner prefers explanations in Dutch and without jargon.

Agent rules (short)
- Follow the Non‑Negotiable Security Rules in [claude.md](claude.md#L1). Do NOT use the Supabase service key for data queries.
- Prefer RPCs for multi-step DB mutations; changes touching data integrity must be implemented as PG functions and tested.
- Link rather than copy: reference existing docs (e.g., [claude.md](claude.md#L1)) instead of embedding large sections.
- Before changing architecture or core patterns, propose a short plan and get confirmation.
- Run `pnpm run typecheck` and lint locally before committing; `pnpm run test`'s integration tests need Docker + `pnpm run db:up`, which usually isn't running on the owner's PC — then rely on CI, which runs the full suite against a real Supabase on every PR.
- Create changes on a feature branch named `ai/<short-descriptor>` and open a PR with a short summary and test evidence. **Commit, push and merge only after the product owner's explicit OK.**
- Backlog changes (`.project/`): propose as numbered V-items and apply only after approval; AI-written stories/epics/ADRs go to `.project/staging/`; never delete a story/epic (mark `archived`/`superseded`); add a `## In gewone taal` section to every item.
- Stock-touching RPCs must reuse the advisory-lock helpers `stock_lock_key`/`lock_stock_keys` (see claude.md, STORY-043).

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
- `pnpm run test` (76 tests) and `pnpm run typecheck` both pass — re-verified 2026-07-18, plus a full live Docker E2E smoke test (provision tenant → item → BOM line → stock → production order complete → proposal submit/approve → CSV export → pagination header, all through the real containers). **`pnpm run typecheck` re-confirmed clean again 2026-08-30**; `pnpm run test`'s 9 server integration test files still fail on `ECONNREFUSED 127.0.0.1:54321` (no local Supabase running in the check environment) — same environmental cause as before, not a regression.
- Gotcha hit and fixed: Hono's bare `.use(requireAuth)` (no path) doesn't apply to a nested route — always `.use('*', requireAuth)` in new sub-routers.
- RLS gotcha hit and fixed: `enable row level security` with no matching `create policy` is a silent deny-all (hit this with `proposal_reviews`) — check for the pairing whenever you add a table.
- **Schema gap found via the live smoke test 2026-07-18, fixed same day**: `proposal_reviews.reviewer_id` (and `items.created_by`, `stock_ledger.user_id`, `production_orders.created_by`, `proposals.created_by`) referenced `profiles(id)` with no `ON DELETE` behavior — a tenant that had ever had a proposal reviewed couldn't be cascade-deleted through `tenants` (two independent cascade paths raced). Migration `20260718000004_profiles_fk_set_null.sql` changed all five FKs to `ON DELETE SET NULL` and dropped `NOT NULL` on those columns, so historical audit/ownership records now survive an actor's removal instead of blocking it. Test cleanup (`server/src/test/integrationHelpers.ts`'s `cleanupTenant`) no longer needs its manual `proposal_reviews` pre-clear workaround — removed along with the fix. Client-facing types (`ProposalSchema.created_by`, `ProposalReviewSchema.reviewer_id`, `ProductionOrderSchema.created_by`, `StockLedgerEntrySchema.user_id`) are now `.nullable()` in `packages/shared`.
- **Update 2026-09-26 (later): committed and pushed; CI green for the first time since July** — server 79/79 tests against a real Supabase, client 2/2, typecheck and lint clean (GitHub Actions run `36265866576`); Deploy builds green with deploy steps skipped until Cloudflare secrets exist. The rest of this bullet and the next describe the state earlier that day.
- **Earlier 2026-09-26: the work described in the next bullet is now committed** (five local commits `a5a3353`…`61004f0`), but not pushed (local `master` 17 ahead of `origin/master`) and integration tests are still unrun against a live Supabase. `.project/`, `app/`, `domain-model.*` and `.kilo/` (a Kilo Code worktree) are still untracked. CI gotcha still open: `actions/setup-node` with `cache: 'pnpm'` runs before pnpm is installed in `ci.yml`/`deploy.yml`.
- **Git history is stale relative to the working tree (found 2026-08-10, re-confirmed unchanged 2026-08-30)**: a full round of finished work — the FK-nullable migration, the BOM-diff proposal editor (`BomChangeEditor.tsx`), CSV export loading/error state (`useDownloadCsv.ts`), the Cloudflare Pages deploy pipeline (`client/wrangler.toml`, `deploy.yml`), and invite-endpoint rate limiting — is sitting unstaged/untracked in the working tree, not committed. `pnpm run typecheck` passes clean against it. Before trusting "committed on master" claims elsewhere in this doc or in `claude.md`, run `git status` yourself. Also untracked: `app/` and `.project/` (an unrelated local agile-project-OS tooling scaffold from a Claude Code skill, not product code) and `domain-model.json`/`domain-model-notes.md` — these need a deliberate commit-or-gitignore decision. **As of 2026-08-30, HEAD is still `e450ccc` (2026-07-18) — nothing has been committed in 43 days, and the dirty/untracked file set is byte-for-byte identical to 2026-08-10.** Separately, local `master` is also **12 commits ahead of `origin/master`** (nothing pushed) — a second, distinct gap from the uncommitted working-tree changes.
- Phases 1-5 plus most of Phase 6 (polish/production-readiness) are implemented end-to-end, but see the git-history note above — several of these "done" items aren't actually committed yet. See `claude.md`'s Resume Point (item 11) for the commit plan, plus the remaining open items (Cloudflare/Supabase account setup + staging smoke test, a real Sentry DSN, `item_change`/`process_change` proposal payload schemas).
- `README.md` is stale (still describes Phase-0 bootstrap state) — don't rely on it, use this file and `claude.md` instead.

Last updated: 2026-09-26 (end of day — handoff in claude.md ▶ Start Here)
