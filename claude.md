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

### Product Vision (from the product owner, 2026-09-26)

This is the *why* behind every feature. When a design choice is unclear,
pick the option that serves these two ideas best.

**1. The Russian doll — every in-house product is also a component.**
The company builds its products in house, so every part is tracked here:
not only bought components (a screw), but also the products it makes
itself and then builds into bigger products (a frame → a bicycle). Each
level is a full item in its own right that can be looked at on its own:
its own BOM, its own stock, its own history, and where it is used.
Design rules that follow from this:
- `item_type` (`component` / `sub_assembly` / `finished_good`) is a
  *label*, never a structural limit. Any item can be a parent and a child;
  never special-case "top-level product" vs. "component" in queries, RPCs
  or UI. Only `prevent_bom_cycle` / `prevent_bom_cross_tenant` restrict
  the tree.
- Every item page must work the same at every level of the doll: BOM
  down (built: `BomTreeViewer`, recursive CTE) **and** where-used up
  (*not built yet* — there is no "which products contain this item?"
  view or endpoint today).

**2. Change proposals replace slow meetings.**
Anyone with the right to propose can suggest a change to a product — e.g.
"use a Phillips screw instead of the current one" — and production,
supply managers and other managers review and decide *inside the app*,
in the order the company configured, instead of spending months in large
meetings. Design rules that follow from this:
- A proposal must be decidable from the app alone: a reviewer must see
  **what** changes (a readable before/after, not JSON), **impact** (which
  products are affected up the doll, stock of the old and new part,
  anything that can't be built afterwards), **who** already reviewed with
  what notes, and **who is next**.
- Approval chains are per company and multi-role (e.g. engineering →
  supply → management), configurable by the tenant admin without a
  developer.
- An approved change applies itself atomically (built for `bom_change`
  via `apply_bom_change_payload`) — no manual follow-up step.
- **Current gaps against this vision (as of 2026-09-26):** the proposal
  list shows reviewers only title/type/status — not the change, its
  impact, or the review history; every tenant gets exactly one workflow
  step per proposal type (the Admin role) and there is no API/UI to
  configure chains (`admin.manage_workflow` exists as a permission but
  nothing uses it); a `bom_change` is scoped to one parent item, so
  "swap this screw in every product that uses it" isn't expressible;
  `item_change` / `process_change` have no defined payload and apply
  nothing on approval. All of these are on the backlog (`.project/`):
  `STORY-055` review screen, `STORY-056` where-used, `STORY-057` impact,
  `STORY-058` approval chains, `STORY-059` replace everywhere,
  `STORY-060` notifications, `STORY-020` item_change (`process_change`
  parked — there are no production steps for it to change).

**3. Onboarding is a service, and every company is configured to fit.**
The platform owner onboards each customer personally: studies how they
work, then creates their roles, access and approval chains, and loads
their data. Roles and chains are never known in advance, so nothing about
a company's organisation may be hard-coded — everything is per-tenant
configuration (templates are only starting points). Design rules:
- **Visibility is per page, not per record** (decided 2026-09-26). Each
  role sees only the pages it needs — the Admin page's pattern (menu link
  hidden, page refuses, server refuses) applies to every page. Whoever may
  see a page sees all of that company's data on it; per-department or
  per-person data filters are deliberately out of scope. Today
  `items.view`/`bom.view` aren't enforced server-side and there is no
  `proposals.view` — `STORY-061`/`STORY-062`.
- The owner's access to a customer tenant is a visible, customer-removable
  support account, never hidden or impersonated access — proposed in
  `.project/engineering/decisions/ADR-004.md` (accepted 2026-09-26). Note one login belongs to exactly one
  tenant (`profiles.id` = `auth.users.id`).

**4. Long term:** the platform every manufacturing SME wants for managing
its stock as effectively as possible. Built for the owner's own company
first; intended to become a SaaS later — keep multi-tenant isolation,
per-tenant configuration and self-service admin as first-class concerns.

> **Pending scope decision (2026-08-01, not yet implemented):** multi-location/multi-building
> warehouse inventory and fulfillment (pick/pack/ship) have been confirmed as a deliberate,
> in-scope expansion — see `ADR-002` (`.project/engineering/decisions/ADR-002.md`, status
> `accepted` since 2026-09-26; `EPIC-009`/`STORY-040` still in `.project/staging/`). This line above reflects what's shipped today, not the decided
> future scope; it will be rewritten once `EPIC-009` ships (`STORY-040`). Left as an inline note
> rather than rewritten now, since the feature isn't built yet and this doc should describe
> reality, not intent.
>
> **ADR-003 accepted 2026-09-26 (not yet implemented):**
> `.project/engineering/decisions/ADR-003.md` (permission_version check — a demoted/deleted
> user's existing JWT stops working on their next request instead of up to ~1h later). The
> 2026-08-30 review's five concerns (non-atomic DB/GoTrue writes → infinite 401 loop,
> deploy-day thundering herd, missing-profile vs. stale collapsing into one 401, last-write-wins
> race, "not MVP" vs. invite lockout) were resolved in a revision: Postgres is the source of
> truth and `requireAuth` self-repairs a stale `app_metadata`; distinct `token_stale` /
> `account_inactive` codes with a single client retry; a `PERMISSION_VERSION_ENFORCE` rollout
> flag. Also found during that revision: `client/src/lib/api.ts` currently signs out on *every*
> 401 rather than refreshing — the ADR includes that client change. Tracked as `STORY-030`
> (backlog block 4, not MVP).

---

## ▶ Start Here — Next Session (handoff written 2026-09-26)

Read this first. It says where the work stands and what to do next; the
sections below are the detailed history and spec.

### Where we are (updated 2026-10-05, end of session)

- **LIVE since 2026-10-05 (`STORY-029` done):** site
  `https://manufacturing-platform-client.pages.dev`, API
  `https://manufacturing-platform-server.alexander-van-puyenbroeck15.workers.dev/api`.
  Deploy run `37280956724` green (all steps, incl. Pages + Worker). First
  tenant provisioned by the owner ("Magazijn Van Puyenbroeck", slug
  `van-puyenbroeck`); the owner signed in and opened the pages without
  errors. CORS verified: site origin allowed, unknown origin → 403.
- **Go-live gotchas (2026-10-05):**
  - Pages' `wrangler.toml` must **not** contain `account_id` —
    `wrangler pages deploy` rejects it (fixed in PR #3); CI passes
    `CLOUDFLARE_ACCOUNT_ID` as env instead. The Worker's toml keeps it.
  - `SUPABASE_URL` / `VITE_SUPABASE_URL` must be the bare project URL
    (`https://<ref>.supabase.co`), not the `/rest/v1/` URL some Supabase
    screens show — that gives `Invalid path specified in request URL`.
    The client value is public: check it in the built JS bundle.
  - Production migrations are **manual** today (`supabase db push` from
    the owner's linked machine) — `STORY-070` proposes automating it.
  - Auto mode blocks Claude from merging PRs and writing to GitHub/Worker
    secret stores: the owner runs `! gh pr merge <n> --squash
    --delete-branch` and secret commands themselves. Long `!` commands
    get line-wrapped when the owner copies them — keep them short, or use
    the owner's own PowerShell window.

- **Sprint 1** (`.project/scrum/sprints/sprint-1.md`): 2026-09-28 →
  2026-10-11, capacity 10 points. **All four stories are done** — the
  owner closes the sprint and sets `STORY-028` to `done` in the board app
  (so `done_at` is stamped); suggested goal text is in *Open loose ends*.

  | Story | Pts | State |
  |---|---|---|
  | `STORY-067` test July work against a real DB | 1 | **done** — CI run `36265866576`: server 79/79, client 2/2 |
  | `STORY-027` CI/CD runs green | 3 | **done** — pushed; CI + Deploy green |
  | `STORY-043` stock can go negative on concurrent completion | 3 | **done** — PR #1, `b09c280` |
  | `STORY-028` Cloudflare/Supabase/GitHub accounts + secrets | 3 | **done 2026-10-05** — see *Production setup* below |

- **Production setup (STORY-028, 2026-10-05)** — nothing has been deployed
  yet; the first push to `master` runs `deploy.yml` for real (`STORY-029`):
  - Cloudflare Pages project `manufacturing-platform-client` created →
    `https://manufacturing-platform-client.pages.dev`.
  - Worker `manufacturing-platform-server` exists (empty, created by the
    first `wrangler secret put`) → will serve at
    `https://manufacturing-platform-server.alexander-van-puyenbroeck15.workers.dev`
    (API under `/api`).
  - Worker secrets (6): `SUPABASE_URL`, `SUPABASE_ANON_KEY` (was missing
    from earlier lists — `createUserClient` needs it), `SUPABASE_SERVICE_KEY`,
    `ADMIN_SECRET`, `ALLOWED_ORIGIN` + `ADMIN_ORIGIN` (both the pages.dev
    URL; there is no separate admin app).
  - GitHub repo secrets (5): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
    `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`.
    `VITE_SENTRY_DSN` deliberately not set yet (Sentry no-ops without it).
  - Production Supabase project created by the owner and linked locally
    (`supabase link`); all 12 migrations applied via `supabase db push`
    (no seed). Auth Site URL + redirect URL (`…pages.dev/**`) set.
  - The owner keeps `ADMIN_SECRET` and the DB password in their password
    manager — never ask for them in chat.
- `.claude/` is deliberately untracked (personal settings); `.kilo/` is
  excluded via `.git/info/exclude`.
- The backlog was fully reviewed and reorganised on 2026-09-26. Order and
  reasoning: `.project/scrum/product-backlog.md`; phases:
  `.project/product/roadmap.md`; decisions: ADR-001…004 in
  `.project/engineering/decisions/` (all **accepted**).

### Do next, in this order

1. Owner, in the board app (`STORY-028`/`029` already set to `done`
   2026-10-05): close sprint 1 (still `planning`), fill in its goal; accept `STORY-061`, `062`, `056`
   (and the new `070`, `071`) from `staging/`, then link 061/062/056 to
   sprint 2.
2. **Sprint 2** (`.project/scrum/sprints/sprint-2.md`, 2026-10-12 →
   2026-10-25, 10 pts, `planning`): `STORY-068` (bolts deducted twice —
   start here), `STORY-061`, `STORY-062`, `STORY-056`. `STORY-055`/`058`
   (5 pts each) are for sprint 3.
3. `STORY-071` (GitHub Actions Node 20 / Ubuntu 26) is small and should
   land before 2026-10-19.
4. `STORY-068` and `STORY-069` are accepted (in `product/stories/`). Still
   waiting in `.project/staging/` for the owner's acceptance in the board
   app: the later-phase epics/stories (EPIC-005, 008, 009, 011, 012 and
   their stories). Don't move them yourself.

### How to work with this product owner

- **Language:** Dutch, plain words, no jargon — explain any technical term.
  Every story/epic has a `## In gewone taal` section; keep adding it.
- **Backlog changes:** propose them as a numbered list (V1, V2, … — the
  2026-09-26 session reached V39), each with what/why/which file, most
  important first. **Apply nothing until the owner approves** ("V1, V3
  ok"). Never delete a story or epic (use `archived`/`superseded` + a
  reason); new items get the next free ID (next: `STORY-072`,
  `EPIC-013`, `ADR-005`) and go to `.project/staging/`. After applying,
  list the changes per file and end with: applied / still open / new
  questions.
- **Git:** work on a branch `ai/<short-name>` and open a PR; CI runs the
  integration tests against a real Supabase (Docker is usually *not*
  running on the owner's PC, so local runs are typecheck/lint/client
  tests only). **Commit, push and merge only after the owner's explicit
  OK.** The pre-commit hook runs eslint + prettier on staged files.
- **Board app statuses:** editing `status:` in a file by hand works, but
  only a change made in the board app stamps `started_at`/`done_at`.
- The owner wants honest findings: if something looks wrong (like the
  double-deduction bug), say so and propose a story — don't silently fix
  outside the current story's scope.

### Open loose ends (small, not on the sprint)

- `README.md` is still the Phase-0 text — misleading as a repo entry point.
- `POST /production/:id/cancel` returns a generic 500 (not 409/404) for an
  order that can't be cancelled (noted in `STORY-048`).
- `.project/scrum/sprints/sprint-1.md` still has the placeholder goal
  "_Nog te bepalen._" — suggested goal: *"De code is getest, staat op
  GitHub, de workflows draaien groen, en voorraad kan niet meer negatief
  worden."*

## Current Development Snapshot

Phases 1-5 are real, tested, and verified end-to-end — including a full live Docker Compose smoke test (provision tenant → items → BOM line → stock → production order → proposal submit/approve, all through the actual containers, 2026-07-18). Most of Phase 6 (polish/production-readiness) is now done too. See Resume Point below for what's left.

- The app runs in two Docker services: `client` on `5173` and `api` on `8787` (see `docker-compose.yml`, `client/Dockerfile`, `server/Dockerfile`). **Gotcha**: the api/client containers' `node_modules` live in named Docker volumes that persist across `docker compose up --build` — adding a new dependency to `package.json` requires `docker compose down -v` (drops the volumes) before the next `up --build`, or the container runs against stale, pre-install node_modules and fails to resolve the new import. Hit this exact failure adding `@hono/sentry` (2026-07-18).
- Local Supabase runs separately through the CLI with `pnpm run db:up` and `pnpm run db:reset`.
- **Auth**: `server/src/lib/supabase.ts` (`createUserClient`/`createAdminClient`) and `server/src/middleware/auth.ts` (`requireAuth`, `requirePermission`) per the Auth Architecture section above.
- **Tenant provisioning**: `POST /api/admin/tenants` (`server/src/routes/tenants.ts`), gated by `X-Admin-Secret` and rate-limited to 3/IP/hour (`server/src/middleware/rateLimit.ts`, in-memory fixed-window). Calls `provision_tenant` (tenant + Admin role + profile + one workflow step per proposal type, one transaction), then sets `app_metadata`.
- **Items**: full CRUD — `GET /` (paginated), `POST /`, `PATCH /:id`, `PATCH /:id/archive` — gated by `items.create`/`items.edit`/`items.archive`, RLS-scoped. Client: `ItemList.tsx` (paged table, inline edit, archive) and `ItemDetail.tsx` (`/items/:id` — full fields, edit/archive, current stock, recent stock movements, embedded BOM tree).
- **BOM**: `GET /:itemId/tree` (recursive-CTE RPC), `POST /` (requires `bom.edit`). Two DB triggers guard integrity: `prevent_bom_cycle` (self-reference/circular) and `prevent_bom_cross_tenant` (parent/child item must belong to the BOM line's own tenant — RLS doesn't catch this since FK lookups bypass it). `BomTreeViewer.tsx` has a child-item + quantity add form.
- **Inventory & Production**: paginated list endpoints, `/inventory/alerts` (reorder-point), `/inventory/export` and `/production/export` (CSV, gated by `inventory.export`/`production.view`), `complete_production_order`/`can_produce` RPCs — verified end-to-end for a multi-level bolt→frame→bike BOM. Client pages have paged tables + "Export CSV" buttons.
- **Stock locking (STORY-043, 2026-09-26)**: `complete_production_order` now takes a transaction-scoped advisory lock per consumed component *before* re-reading stock, so concurrent completions can't overdraw it (the old `FOR UPDATE` only locked the order row; stock is a derived `SUM`). Shared helpers in migration `20260926000000_stock_lock_helper.sql`: `stock_lock_key(tenant_id, item_id, location_id default null)` and `lock_stock_keys(tenant_id, item_ids[], location_id)` (dedupes, locks in sorted key order). **Every future RPC that reads-then-writes stock (`move_stock`, `reserve_stock`, `post_stock_count`) must reuse these — never invent another key scheme.** Insufficient stock raises SQLSTATE `SK409` with the shortfalls as JSON in `DETAIL`; `POST /production/:id/complete` maps it to HTTP 409 `{ code: 'insufficient_stock', shortfalls }` (`InsufficientStockErrorSchema` in `packages/shared`).
- **Workflow & Proposals**: `server/src/routes/proposals.ts` (`GET /`, `POST /`, `POST /:id/submit`, `POST /:id/review`) backed by `submit_proposal`/`review_proposal` RPCs, which walk the tenant's `workflow_steps` chain matching the reviewer's actual `profiles.role_id` (not just the coarse `proposals.review` permission) and, on final approval of a `bom_change`, atomically apply the payload via `apply_bom_change_payload`. Client: `Proposals.tsx` — list, submit, approve/reject/request-changes; `bom_change` payloads use a structured line-item editor (`BomChangeEditor.tsx`, added 2026-07-18) scoped to one parent item at a time — shows existing BOM lines (editable quantity/notes, removable) plus a BomTreeViewer-style add-line form, and assembles the `BomChangePayload` automatically. Needed a new read endpoint, `GET /bom/:itemId/lines` (direct, non-recursive lines with their own `id`, unlike the recursive `/tree` RPC which never exposes `bom_lines.id`), backed by `useBomLines()`. `item_change`/`process_change` payloads still use the raw JSON textarea (no defined schema for those types).
- **Admin — invite user / manage roles** (closed the last Phase 1 gap): `server/src/routes/roles.ts` (list/create/edit; editing a role's permissions pushes the new snapshot to every current member's `app_metadata`, since permissions are baked into the JWT at invite time, not looked up live) and `server/src/routes/users.ts` (list, `POST /invite` via `supabase.auth.admin.inviteUserByEmail`, `PATCH /:id/role` reassignment, also syncing `app_metadata`). Client: `Admin.tsx` (`/admin`) with a `PermissionsEditor` checkbox-grid component, nav-linked only for users who actually hold `admin.manage_users`/`admin.manage_roles`.
- **Audit logging**: a single generic trigger (`log_audit_event`, migration `20260718000003_audit_log_triggers.sql`) attached to `items`, `bom_lines`, `production_orders`, `proposals`, `roles`, `profiles` — replaced the manual `insert into audit_logs` calls that used to be scattered across RPCs, and closed a real coverage gap (items/bom_lines direct writes were never audited before). Deliberately **not** attached to `stock_ledger` or `proposal_reviews` (both are already their own append-only audit trail) or `tenants`/`workflow_steps` (service-role-created, low churn).
- **Rate limiting / security headers**: registration (`POST /api/admin/tenants`, 3/IP/hour) and invite (`POST /api/users/invite`, 10/IP/hour — added 2026-07-18, same abuse shape since it sends a real email per call) are rate-limited via the shared `rateLimit()` middleware (`server/src/middleware/rateLimit.ts`); login is not server-side rate-limited because it never touches our server — the client calls `supabase.auth.signInWithPassword` directly (see Auth Architecture), so GoTrue's own limits are what protect it. `server/src/middleware/securityHeaders.ts` sets a maximally strict CSP (JSON-only API), `X-Frame-Options`, `X-Content-Type-Options`, HSTS, `Referrer-Policy` globally, ahead of CORS.
- **Sentry**: both sides DSN-gated and no-op cleanly when unset. Server: `@hono/sentry` (toucan-js, runs natively in the Workers isolate, no `nodejs_compat` flag needed). Client: `@sentry/react`, initialized from `VITE_SENTRY_DSN` in `main.tsx`, wrapping `<App />` in an `ErrorBoundary`.
- **Pagination**: `items`/`production`/`inventory` list endpoints accept `?after=<uuid>&limit=<n>` (default 50, max 200), reporting a next-page cursor via `X-Next-Cursor` — remember to also add the header to `Access-Control-Expose-Headers` in `server/src/index.ts` for any new one, or browsers silently strip it (hit this exact bug adding the frontend pager). Client: `useCursorPagination` + `Pager` component wired into all three list pages; picker/lookup consumers (BOM child select, production/inventory item selects) use a separate unpaginated (up to 200) query so dropdowns still show everything.
- **Client**: `App.tsx` — React Router v7, routes for `/items`, `/items/:id`, `/inventory`, `/production`, `/proposals`, `/admin`, all behind `ProtectedLayout`.
- `packages/shared` schemas: items (`UpdateItemSchema`, `is_archived` on `ItemSchema`), tenants, bom, inventory, production, proposals (`BomChangePayloadSchema`, `ProposalType`/`ProposalStatus` type aliases), auth, pagination (`PaginationQuerySchema`), roles, users.
- **Verified 2026-09-26 in CI (first run since July):** after pushing, GitHub Actions `CI` run `36265866576` started a fresh Supabase, applied all migrations, and passed typecheck, all tests (**client 2/2, server 79/79 in 10 files**, all integration tests against a real database — including the July `bom.test.ts`/`users.test.ts` changes and the FK-nullable migration) and lint. `Deploy` run `36265866587` also green (build OK; deploy steps skipped until the Cloudflare secrets exist, `STORY-028`). The history below is kept for context.
- `pnpm run test` (76 tests: server + client + shared combined) and `pnpm run typecheck` both green as of 2026-07-18, plus the live Docker smoke test above. **Re-checked 2026-08-10** and again **2026-08-30**: `pnpm run typecheck` still passes clean both times. `pnpm run test` server-side integration tests need local Supabase running (`pnpm run db:up`) — Docker wasn't reachable in either check's environment, so the 9 integration test files still fail the same way (`ECONNREFUSED 127.0.0.1:54321`, now surfaced as an outer `TypeError: fetch failed` wrapping the same cause — cosmetic vitest-version difference, not a new failure mode; environmental, not a code regression; the 2 client tests and Supabase-independent server tests passed both times). The uncommitted changes to `bom.test.ts`/`users.test.ts` are therefore **still** unverified against a real run, 20 days on — this needs a machine with Docker Desktop actually running, not another sandboxed check.
- **Known gotchas**:
  - Hono's bare `.use(requireAuth)` (no path) doesn't apply to nested dynamic routes — always `.use('*', requireAuth)`.
  - `alter table ... enable row level security` with no matching `create policy` is a silent deny-all, not a no-op (hit this with `proposal_reviews`) — grep for this pairing whenever adding a table.
  - **Fixed 2026-07-18**: `proposal_reviews.reviewer_id` (and similarly `items.created_by`, `stock_ledger.user_id`, `production_orders.created_by`, `proposals.created_by`) referenced `profiles(id)` with no `ON DELETE` behavior, so a tenant that had ever had a proposal reviewed couldn't be cascade-deleted through `tenants` (`profiles.tenant_id`'s cascade and `proposals.tenant_id`'s cascade raced as two independent paths, and the FK check on `reviewer_id` could fire before the other path removed the referencing row). Migration `20260718000004_profiles_fk_set_null.sql` changed all five FKs to `ON DELETE SET NULL` and dropped `NOT NULL` on those columns, so historical audit/ownership records now survive an actor's removal instead of blocking it. `cleanupTenant()` in `server/src/test/integrationHelpers.ts` no longer needs its manual `proposal_reviews` pre-clear workaround — removed along with the fix. Client-facing types (`ProposalSchema.created_by`, `ProposalReviewSchema.reviewer_id`, `ProductionOrderSchema.created_by`, `StockLedgerEntrySchema.user_id`) are now `.nullable()` in `packages/shared`.
  - `supabase db reset` can leave Kong holding a stale `auth` container IP (502 until `docker restart supabase_kong_supply`), and `supabase_vector_supply` restart-loops on `Network unreachable` (Logflare's log-shipping sidecar failing to reach the Docker socket on Windows/Docker Desktop) — neither affects Postgres/Auth/PostgREST/Kong or the app itself.
- **Update 2026-09-26 (later the same day): everything is committed and pushed** — `origin/master` = `49be0fd`, nothing unpushed; CI and Deploy green (see above); `.project/`, `app/` and `domain-model.*` are committed (`app/` excluded from eslint/prettier via `.eslintignore`/`.prettierignore`); `.kilo/` is excluded locally via `.git/info/exclude`; the pnpm/setup-node order and Node 18→22 (wrangler 4 needs ≥ 22) were fixed in `c62193a`. The sentences below describe the state earlier that day.
- **Earlier 2026-09-26 — the uncommitted work below is now committed** as five local commits on `master` (`a5a3353` FK migration, `d992e16` BOM-diff editor, `867efc5` CSV export state, `4c2d6f2` invite rate limit, `61004f0` Cloudflare Pages deploy — the last also fixes `deploy.yml`'s invalid `secrets` reference in step `if:`). Still **not pushed** (local `master` is now 17 ahead of `origin/master`), integration tests still **not run** against a live Supabase, and `.project/`/`app/`/`domain-model.*`/`.kilo/` are still untracked pending a decision. Still open in CI: `actions/setup-node` with `cache: 'pnpm'` runs before pnpm is installed in both `ci.yml` and `deploy.yml`. The paragraph below is kept as history.
- **Git history / uncommitted state (found by `/catchup` audit, 2026-08-10; re-verified unchanged by `/catchup` on 2026-08-30)**: the doc claim below ("working tree is clean except `.claude/`") was stale and wrong. A full round of work — items 2, 3, 6, 7, 8 below, plus the FK-nullable migration from Known Gotchas — was actually implemented (confirmed complete and working: typecheck passes clean, code is fully wired up, not stubs) but **never committed**. It's sitting as unstaged/untracked changes in the working tree right now: `.github/workflows/deploy.yml`, `client/package.json`, `client/src/hooks/useBom.ts` + new `useDownloadCsv.ts`, `client/src/pages/inventory/StockDashboard.tsx`, `client/src/pages/production/ProductionOrders.tsx`, `client/src/pages/proposals/Proposals.tsx` + new `BomChangeEditor.tsx`, `client/wrangler.toml` (new), `packages/shared/src/schemas/{inventory,production,proposals}.ts`, `server/src/routes/{bom,bom.test,users,users.test}.ts`, `server/src/test/integrationHelpers.ts`, `supabase/migrations/20260718000004_profiles_fk_set_null.sql` (new). The prior commit (`e450ccc`, a docs-only reconciliation) documented this work as shipped without the actual code landing alongside it. **Also untracked, unrelated to product code**: `app/` and `.project/` (a separate "AI-native agile project OS" scaffold from a Claude Code skill — kanban/backlog tooling, not manufacturing-platform features) and `domain-model.json`/`domain-model-notes.md` (from a domain-modeling skill). These need a deliberate decision (commit, or add to `.gitignore`) rather than sitting untracked indefinitely. **Confirmed on 2026-08-30: nothing has changed in the intervening 20 days** — `HEAD` is still `e450ccc` (2026-07-18, now 43 days old), the dirty/untracked file lists above are byte-for-byte identical, and no partial progress landed. **New fact found 2026-08-30**: separately from the uncommitted working-tree changes, local `master` is also **12 commits ahead of `origin/master`** (nothing behind) — there's an unpushed-commits backlog on top of the uncommitted-work problem, so "committed" and "on GitHub" are two different gaps to close.
- `README.md` is also stale — it still describes Phase-0/bootstrap state ("ask the agent to scaffold client and server") and doesn't mention any shipped feature. Not the source of truth (this file is), but misleading as a repo entry point.

### Resume Point

> **Superseded for day-to-day use by *▶ Start Here* above (2026-09-26).** The list below is the pre-2026-09-26 history; the live plan is `.project/scrum/product-backlog.md`.

Phases 1-5 are done, plus most of Phase 6. What's left, ordered by what actually blocks a real deployment vs. polish:

1. ~~Decide and fix the `profiles(id)` FK cascade gap~~ — **implemented 2026-07-18, but see the uncommitted-state note above: the migration file itself is still untracked in git.**
2. ~~Decide the client's deployment target~~ — **decided 2026-07-18: Cloudflare Pages.** `client/wrangler.toml` (static SPA, `pages_build_output_dir = "dist"`, same `account_id` as `server/wrangler.toml`), `wrangler` as a client devDependency, and `pnpm --filter client run deploy` all implemented and verified working locally — **but still uncommitted**, see note above.
3. ~~Fix `deploy.yml` to inject production env vars into the client build~~ — **implemented 2026-07-18** (triggers on `[main, master]`, builds client with the four `VITE_*` secrets, deploys via `wrangler pages deploy`, gated on `CLOUDFLARE_API_TOKEN`) — **but still uncommitted**, see note above.
4. **Still open — needs your Cloudflare/Supabase account access, not something achievable from this sandbox**: create the actual Cloudflare Pages project (`manufacturing-platform-client`, matching `client/wrangler.toml`), add the GitHub Actions repo secrets deploy.yml now expects (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — already needed by the Worker step; plus new `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, `VITE_SENTRY_DSN` for the client build), and confirm the Worker's production secrets are set via `wrangler secret put SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `ADMIN_SECRET` / `ALLOWED_ORIGIN` / `ADMIN_ORIGIN` (`ALLOWED_ORIGIN` should point at the real `*.pages.dev` or custom domain once the Pages project exists).
5. **Do a real staging deploy dry run** once 4 is sorted, and smoke-test it the same way the live Docker E2E test does locally — provision a tenant, sign in, hit a few routes.
6. ~~Structured BOM-diff editor for `bom_change` proposals~~ — **implemented 2026-07-18** (`BomChangeEditor.tsx` + `GET /bom/:itemId/lines`) — **but still uncommitted**, see note above.
7. ~~Extend rate limiting to `POST /api/users/invite`~~ — **implemented 2026-07-18** (10/IP/hour, same `rateLimit()` middleware as registration) — **but still uncommitted**, see note above.
8. ~~CSV export UI has no loading/error state~~ — **implemented**: `useDownloadCsv.ts` wraps `downloadCsv()` with `isDownloading`/`error` state, wired into both `StockDashboard.tsx` and `ProductionOrders.tsx` (disabled "Exporting…" button + visible error message on failure) — **but still uncommitted**, see note above.
9. ~~Reconcile Non-Negotiable Security Rule 6's wording~~ — **already done** (commit `e450ccc`); the rule below already describes GoTrue's own login limits instead of claiming an unimplemented 5/IP/15min server-side check. This Resume Point item was stale.
10. **Get a real Sentry DSN** once there's an actual deployment to monitor, and confirm errors from that deploy show up.
11. **Done 2026-09-26 except the README** — committed, scaffolds committed, verify pass green in CI (79/79 server tests against a real database). Only the stale `README.md` update remains. Original item: **commit the uncommitted work.** Items 1, 2, 3, 6, 7, 8 above are all done in the working tree but not in git history — **still true 43 days later as of 2026-08-30, zero progress**. Split into logical commits (FK migration + nullable schema types + integrationHelpers cleanup; BOM-diff proposal editor; CSV export loading/error UX; Cloudflare Pages deploy pipeline; invite rate limiting), decide what to do with the untracked `app/`/`.project/`/`domain-model.*` tooling scaffolds (commit deliberately or `.gitignore`), then re-run the full verify pass (`pnpm run typecheck`, `pnpm run test` with local Supabase up via `pnpm run db:up` — the modified `bom.test.ts`/`users.test.ts` are unverified against a live Supabase, only typechecked) before treating any of 1/2/3/6/7/8 as actually done. Also update the stale `README.md`.
12. ~~Push local `master` to `origin/master`~~ — **done 2026-09-26** (`2a102ce..49be0fd`). Original item: Local is 12 commits ahead of the remote with nothing behind (unrelated to the uncommitted working-tree changes — a separate, already-committed backlog that's just never been pushed). Confirm with the user before pushing.
13. ~~Resolve ADR-003's review before implementing it~~ — **done 2026-09-26**: revised to address all five concerns and accepted (see the note at the top). Ready to implement when `STORY-030` comes up in the backlog; not urgent.

Items 2–5 are a connected deployment-readiness cluster worth doing together; 6, 8, 10 are independent polish; 11 blocks all of them from being durably "done," and 12 is the next gap right after 11 closes. 13 is resolved. Also still open: CSV export payload growth (both export endpoints cap at 10k rows with no pagination — fine for SME scale today) and the `stock_ledger` audit-exemption rationale isn't written down anywhere except code comments. Re-run the full verify pass (typecheck + all tests + a live Docker E2E smoke test) after any of the above, before committing.

---

## Non-Negotiable Security Rules

These are checked on every PR. No exceptions.

1. **Never use the Supabase service-role key for data queries.** The service key is only for tenant provisioning (creating new tenants + users) and admin user-management (inviting users, reassigning roles). Every data operation uses the user's JWT, so RLS enforces isolation automatically.

2. **RLS is the enforcement layer, not application code.** Always write `WHERE tenant_id = ?` in queries too, but the database rejects cross-tenant access even if the application forgets.

3. **Every stock mutation goes through `stock_ledger`.** Never UPDATE a stock counter directly. The ledger is append-only — no DELETE, no UPDATE on existing rows.

4. **All multi-step mutations are PostgreSQL functions (RPCs).** Produce an item → deduct components → log audit. This runs in a single transaction. Never implement this sequence in application code.

5. **Validate input at the API boundary with Zod.** Import schemas from `packages/shared`. The same schema validates the frontend form and the API handler.

6. **Rate-limit all server-side auth endpoints.** Registration (`POST /api/admin/tenants`): 3 per IP per hour — implemented (`server/src/middleware/rateLimit.ts`). Login is *not* implemented here because it never reaches our server: the client calls `supabase.auth.signInWithPassword` directly (see Auth Architecture), so Supabase Auth's (GoTrue's) own rate limits are what actually protect it.

7. **Permissions are in `app_metadata` (set server-side only).** Never trust client-supplied role/permission claims. When a role's permissions change, push the new snapshot to every current holder's `app_metadata` (see `roles.ts`) — don't just apply it to new invites.

8. **Audit every mutation via a DB trigger, not application code.** Implemented as a single generic trigger (`log_audit_event`) attached to every actively-mutated business table (`items`, `bom_lines`, `production_orders`, `proposals`, `roles`, `profiles`) — see migration `20260718000003_audit_log_triggers.sql`. Exceptions: `stock_ledger` and `proposal_reviews` are already their own append-only audit trail, so a redundant audit_logs entry would just double-book the same fact; `tenants`/`workflow_steps` are service-role-created bootstrapping config.

9. **No wildcard CORS.** The allowlist is explicit: `[APP_ORIGIN, ADMIN_ORIGIN]`. Reject unknown origins with 403. Any new custom response header (e.g. `X-Next-Cursor`) must also be added to `Access-Control-Expose-Headers` or browsers silently strip it client-side.

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
- [x] Admin: create tenant, invite user, manage roles — `server/src/routes/roles.ts` + `server/src/routes/users.ts`, `client/src/pages/admin/Admin.tsx`

### Phase 2 — Item Catalog
- [x] Schema: `items`, `bom_lines`
- [x] API: CRUD for items, BOM line management — items has `GET`/`POST`/`PATCH :id`/`PATCH :id/archive`; BOM has `GET tree`/`POST` (line edit/delete is only reachable indirectly via an approved `bom_change` proposal, not a direct BOM API — acceptable for now, revisit if a direct-edit need shows up)
- [x] BOM circular reference prevention (DB trigger + app check)
- [x] Frontend: item list, item detail, BOM tree viewer — `ItemList.tsx` (paged, inline edit/archive), `ItemDetail.tsx` (`/items/:id`), `BomTreeViewer.tsx` (with line-add form)
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
- [x] Frontend: proposal inbox, review UI, proposal history — `client/src/pages/proposals/Proposals.tsx`

### Phase 6 — Polish & Production-Readiness
- [x] Pagination on all list endpoints (cursor-based: `?after=<uuid>&limit=50`) — both backend (items/production/inventory, via `X-Next-Cursor`) and frontend (`useCursorPagination` + `Pager` on all three list pages)
- [x] CSV/Excel export for inventory and production — CSV only (`GET /api/inventory/export`, `GET /api/production/export`), not Excel/.xlsx; reasonable scope cut since CSV opens fine in Excel and avoids a new dependency
- [x] Sentry integration (client + server) — wired and DSN-gated on both sides; no real Sentry project/DSN configured yet (see Resume Point)
- [x] Rate limiting on auth routes — registration only; login can't be rate-limited server-side since it never reaches our server (see Non-Negotiable Security Rule 6)
- [x] CSP headers, security headers (`X-Frame-Options`, `X-Content-Type-Options`) — `server/src/middleware/securityHeaders.ts`, applied globally ahead of CORS
- [x] Integration tests for: tenant isolation, production order completion, approval flow — tenant isolation covered on items/bom/inventory/production/proposals/roles/users; production completion and the full proposal approval flow both have dedicated tests

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

*Last updated: 2026-10-05 (live: STORY-029 done, go-live gotchas, STORY-070/071 proposed, sprint 2 planned). Earlier that day: (STORY-028 done: production Cloudflare/Supabase/GitHub setup recorded in *▶ Start Here*; sprint 1 complete). Before that: 2026-09-26, end of day (added *▶ Start Here* handoff: sprint 1 status, next steps, how to work with the owner; STORY-043 built in PR #1; STORY-068/069 proposed). Earlier the same day: (added the Product Vision section from the product owner — Russian-doll BOM and in-app change proposals as the core idea, with current gaps against it; recorded that the previously uncommitted work is now committed but unpushed/untested. The `.project/` backlog was also reviewed and reorganized the same day — see `.project/scrum/product-backlog.md` and `.project/product/roadmap.md`.)*
*Prior update: 2026-08-30 (`/catchup` audit: re-verified the 2026-08-10 findings are still accurate 20 days later — the same working-tree changes are still uncommitted (43 days now), typecheck still clean, integration tests still blocked on Docker/Supabase not running. New findings this pass: local `master` is 12 commits ahead of unpushed `origin/master` (Resume Point item 12); `ADR-002` moved from `.project/staging/` to `.project/engineering/decisions/ADR-002.md`; a new `ADR-003` (permission_version JWT-staleness check) exists in `.project/staging/` with `review_status: changes_requested` and unresolved reviewer concerns (Resume Point item 13). No new features built this pass, just reconciliation.)*
*Prior update: 2026-08-10 (`/catchup` audit: found and documented that the BOM-diff editor, invite rate-limiting, CSV export loading/error state, Cloudflare Pages deploy pipeline, and the FK-nullable migration were all fully implemented but never committed — see the uncommitted-state note in Current Development Snapshot and Resume Point item 11. No new features built this pass, just reconciliation.)*
*Prior update: 2026-07-18 (invite-user/manage-roles admin, proposal inbox UI, item detail page, frontend pagination, CSV export, Sentry, generic audit triggers, and auth-endpoint rate limiting all shipped and verified via a live Docker E2E smoke test; Current Development Snapshot, Resume Point, Non-Negotiable Security Rules, and Feature Build Order checklists reconciled against actual code). Update this document whenever an architectural decision changes.*
