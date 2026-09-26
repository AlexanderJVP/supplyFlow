# Domain Model Notes — Manufacturing Operations Platform

Source of truth used: `supabase/migrations/*.sql` (all 11 files, read in full — the
initial schema plus every structural/trigger/RLS migration through
`20260718000004_profiles_fk_set_null.sql`). Every entity, attribute, key marker,
and relationship cardinality in `domain-model.json` was read directly off these
migrations — **none of the ER-level content (entities, attributes, relationships)
is guessed.** `packages/shared/src/schemas/*.ts` was spot-checked and confirms
the same shapes (no additional fields beyond the DB columns).

## What's flagged with ⚠ and why

This codebase is Hono routes + Supabase/PostgREST + PL/pgSQL RPCs — there are no
literal `*Aggregate`, `*Repository`, `*Factory`, or `*Service` classes anywhere.
So every DDD *tactical* construct in the model (aggregate root stereotypes,
repositories, the one factory, the three domain services) is an interpretive
reading, not something read off a class name, and is marked `⚠ ... (inferred)`
per convention. The **ER diagram content is not flagged** — it's tier-1, straight
from the migrations.

- **Aggregate roots** (`tenant`, `role`, `profile`, `item`, `stock_ledger`,
  `production_order`, `proposal`): chosen because each has its own dedicated
  route file (`tenants.ts`, `roles.ts`, `users.ts`, `items.ts`, `inventory.ts`,
  `production.ts`, `proposals.ts`) that is the only place rows of that table are
  created/mutated directly. Verify by checking those files still only touch
  their own table for writes.
- **`bom_line` as a child of the `item` aggregate, not its own root**: CLAUDE.md
  says this explicitly — "line edit/delete is only reachable indirectly via an
  approved `bom_change` proposal, not a direct BOM API." This is actually
  tier-1 confidence (stated in project docs), just still flagged per the
  "no literal class" rule.
- **`proposal_review` as a child of `proposal`**: same reasoning — always
  queried/created scoped to a `proposal_id`, no standalone route.
- **`workflow_step` and `audit_log` left with no aggregate**: no dedicated CRUD
  route exists for either (workflow_steps are only read internally by the
  `review_proposal`/`submit_proposal` RPCs; audit_logs are populated only by
  the `log_audit_event` trigger). If a direct admin route for either appears
  later, revisit.
- **Repositories / the one Factory / the three Services**: mapped from route
  file responsibilities and the RPC table in CLAUDE.md's "Critical Routes — Use
  PG Functions" section. The three services
  (`ProductionCompletionService`, `WorkflowReviewService`,
  `PermissionSyncService`) correspond to real cross-aggregate operations
  documented in CLAUDE.md (`complete_production_order`,
  `submit_proposal`/`review_proposal`/`apply_bom_change_payload`, and the
  role-permission-edit → `app_metadata` push described under `roles.ts`)
  — high confidence, but still a naming/packaging choice I made, not a class
  that exists in the repo.
- **`domainEvents` is empty, deliberately**: the codebase uses a DB-trigger-based
  audit log (`log_audit_event`), not a domain event bus/dispatcher. No
  `*Event`/`*Happened` classes or publish/subscribe code were found, so nothing
  was fabricated here.
- **Bounded context groupings** (`identity_access`, `catalog`, `inventory`,
  `production`, `workflow`, `audit`): map to the route-file groupings
  (`tenants.ts`+`roles.ts`+`users.ts`, `items.ts`+`bom.ts`, `inventory.ts`,
  `production.ts`, `proposals.ts`, and the `audit_logs` trigger respectively).
  This is reasonably strong evidence (route files are the closest thing this
  backend has to module boundaries) but there's no formal package/service
  split enforcing it, so treat the boundary lines as a proposal to validate
  with the team, not a fact.

## Other things worth knowing (not uncertain, just non-obvious)

- **`profile.id` also references `auth.users.id`** (Supabase Auth's own table,
  outside this schema/migrations). Not modeled as an entity since it's a
  managed third-party table, not part of the application's domain.
- **`audit_logs.tenant_id` and `audit_logs.user_id` have no actual FK
  constraint** in the migration (`tenant_id uuid not null,` / `user_id uuid,`
  with no `references`) — enforced only by the trigger that populates them and
  by RLS. Modeled as plain attributes, not as relationships, since there's no
  real FK to derive cardinality from.
- **Composite unique constraints aren't representable as a single `UK` flag**
  in this schema format, so they're described here instead of on the diagram:
  `roles(name, tenant_id)`, `items(sku, tenant_id)`,
  `bom_lines(parent_item_id, child_item_id)`,
  `workflow_steps(tenant_id, proposal_type, step_order)`.
- **The two `item`↔`bom_line` relationships** (parent side and child side) are
  both real, independent FKs (`parent_item_id`, `child_item_id`) — that's not a
  duplicate, it's BOM lines genuinely referencing two different items.

## Proposed / future layer — now via the `status` field, not text

The skill's schema changed since this layer was first added: every top-level
construct can now carry a structured `"status"` field (`"built"` |
`"planned"` | `"proposed"`), and that's what actually drives the Studio's
**Project state** toggle (Current / Final / Final + Suggested). Baking
"(proposed — ADR-XXX, not built)" into a `name`/`label` string — what this
file previously described — does **not** hide anything when someone switches
the Studio to "Current"; only `status` does. This revision rewrites the file
to use `status` correctly and strips that lifecycle wording back out of
names/labels, keeping them clean.

Everything shipped/real (all 6 original bounded contexts, 11 entities, 20
relationships, 7 repositories, 1 factory, 3 services) is now explicitly
`"status": "built"`. Everything sourced from `.project/staging/`'s three ADRs
(`ADR-001`, `ADR-002`, `ADR-003` — all `status: proposed` in their own
frontmatter, dated 2026-08-01, explicitly **not MVP**) is `"status":
"proposed"` — not `"planned"`, since none of the three has been accepted out
of staging yet. If any of them later moves to `.project/engineering/
decisions/` (accepted but still unbuilt), flip its slice from `"proposed"` to
`"planned"`; once actually implemented, flip to `"built"` and remove the
confidence-flag notes below (they'll no longer apply).

The `⚠` confidence-flag convention is a **separate axis** from `status` and
stays exactly as before — it's the model author's uncertainty, not a
lifecycle claim:

- Two new bounded contexts, `jobs_reservations` and `warehouse_ops` — clean
  names now (`"Background Jobs & Reservations"`, `"Multi-Location Warehouse
  Ops"`), `"status": "proposed"`, distinct colors from the six built contexts.
- Five new entities: `job`, `stock_reservation` (ADR-001); `warehouse`,
  `location`, `fulfillment_order` (ADR-002) — all `"status": "proposed"`,
  clean names (no `⚠`, since the ADRs are explicit about these entities'
  *existence*, even where their exact shape isn't nailed down yet — see
  "Lifecycle status" in the skill for why existence-certain-but-unbuilt gets a
  clean name while shape-uncertain gets a `⚠` on the specific attribute).
  `ADR-001`/`ADR-002` say outright that `stock_reservation`'s and
  `fulfillment_order`'s detailed schemas **aren't designed yet** — those two
  only have the columns the ADR text actually names, plus a `"…schema not yet
  designed"` placeholder attribute (type `"?"`). `warehouse` and `location`
  are similarly light — the ADR only says "one row per building/site" /
  "bins/zones within a warehouse", so an obvious column like `name` isn't
  stated, hence also left as a `"?"` placeholder rather than invented.
- Two attribute-level additions on **existing, built** entities. There's no
  per-attribute `status` field (a known schema limitation — see "Known
  limitation" in the skill), so these stay flagged the old text way, on the
  attribute itself, while the entity as a whole correctly stays `"status":
  "built"`: `profile` gets `⚠ permission_version (proposed, ADR-003, not
  built — no per-attribute status field, see notes)`, and `stock_ledger` gets
  `⚠ location_id (proposed, ADR-002, not built — no per-attribute status
  field, see notes)` plus the same caveat appended to its `reason` enum type
  string (`moved`/`counted` are ADR-002-proposed additions to
  `ledger_reason`).
- Ten new relationships, all `"status": "proposed"` with clean labels (added
  `tenant → location` this pass, for consistency with every other table being
  directly tenant-scoped — ADR-002 says locations are "RLS-isolated per
  tenant like every other table").
- Three new domain services (`JobDispatchService`, `StockReservationService`,
  `StockMoveService`), `"status": "proposed"`, clean names — mapped directly
  from the RPCs/queue pattern the ADRs name explicitly (`reserve_stock`/
  `release_reservation`, `move_stock`, the generic Queue consumer), with the
  ADR reference kept in each `description` field instead of the name. No
  repositories or factories were added for the proposed entities — that would
  mean inventing implementation detail the ADRs don't specify.
- **Not included**: `ADR-002`'s point that `CLAUDE.md`'s "this is not a
  warehouse system" framing becomes inaccurate once it ships. That's a
  documentation consequence tracked in the ADR itself, not a domain-model
  fact — worth remembering next time `CLAUDE.md` is revised, but out of scope
  for this file.
