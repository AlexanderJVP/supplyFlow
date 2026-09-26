---
id: STORY-038
title: move_stock RPC (atomic location transfer)
epic: EPIC-009-multi-location-warehouse-ops
status: backlog
sprint: null
story_points: 3
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-037]
---

## In gewone taal

Voorraad van plek A naar plek B verplaatsen als één handeling, zodat er onderweg nooit iets "zoekraakt".

## User Story

As a warehouse operator, I want to move stock from one location to
another as a single action, so that a transfer can never leave stock
"lost" between locations if something fails halfway.

## Acceptance Criteria

- `move_stock(item_id, from_location_id, to_location_id, quantity)` is a
  single PostgreSQL RPC — never two separate application-code calls, per
  Non-Negotiable Rule 4.
- It writes one negative `stock_ledger` row at the source location and
  one positive row at the destination, both reason `moved`, in the same
  transaction.
- Rejects the move if source location doesn't have enough stock.
- Accepts an optional `reference_type`/`reference_id` pair (same
  convention as `stock_ledger` generally) so callers other than a manual
  UI move — e.g. `STORY-039`'s fulfillment `picked` step — can tag the
  resulting ledger rows back to their originating record.
- **Concurrency guard, explicit and required, not inherited from
  elsewhere**: a per-location stock balance is a derived `SUM` over
  `stock_ledger`, not a physical row, so there's nothing for a plain
  `FOR UPDATE` to lock the way `complete_production_order` locks its
  `production_orders` row. Without an explicit guard, two concurrent
  `move_stock` calls draining the same source location could both read
  "sufficient stock" and jointly overdraw it negative. `move_stock` must
  take `pg_advisory_xact_lock` keyed on `(tenant_id, item_id,
  location_id)` for **both** the source and destination location, before
  reading available stock and inserting the ledger rows.
  - **Key hashing**: `pg_advisory_xact_lock` only accepts a single
    `bigint` (or two `int4`s) — not a composite tuple. The
    `(tenant_id, item_id, location_id)` key must be collapsed into one
    `bigint` first, e.g.
    `pg_advisory_xact_lock(hashtextextended(tenant_id || ':' || item_id || ':' || location_id, 0))`.
    Don't leave this to be improvised at implementation time.
  - **Deadlock-safe acquisition order**: for a single-item move (fixed
    `tenant_id`/`item_id`, only `location_id` differs between the two
    locks), sorting by `location_id` alone is sufficient. But this must
    be specified as sorting the **full composite key**
    `(tenant_id, item_id, location_id)` lexicographically, not
    `location_id` in isolation — if `move_stock` ever grows batch support
    (multiple items per call), sorting by `location_id` alone stops being
    deadlock-safe: two concurrent batch calls touching different items
    but overlapping locations in opposite orders could still deadlock.
    Get the general rule right now even though batch isn't a current
    requirement, so it doesn't silently regress later.
  - **Advisory locks share one global namespace per database.** Checked
    at review time: nothing else in this codebase currently uses
    `pg_advisory_lock`/`pg_advisory_xact_lock`, so there's no existing
    key scheme to collide with — this story is the first introduction of
    the pattern. If another feature adopts advisory locks later, it must
    be checked against this key scheme (hash collisions are non-fatal —
    locks are conservative, worst case is unrelated features
    serializing against each other unnecessarily — but still worth
    avoiding).
  - **Scope of protection**: this guard only serializes concurrent
    `move_stock` calls against each other. It does not, and is not meant
    to, protect against direct `stock_ledger` writes that bypass the RPC
    — that's already covered by Non-Negotiable Rules 3/4 (all stock
    mutation goes through RPCs), not a new gap. State this explicitly in
    the implementation so it isn't mistaken for a database-level
    guarantee.
  - Note: `complete_production_order`'s existing `FOR UPDATE` only locks
    the order row, not the component items' stock — it has the same
    latent race today, outside this epic's scope. Flagged in `ADR-002`;
    not fixed by this story.

## Tasks
