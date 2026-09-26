---
id: STORY-037
title: Location-aware stock ledger (location_id, moved/counted reasons)
epic: EPIC-009-multi-location-warehouse-ops
status: backlog
sprint: null
story_points: 5
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-036]
---

## In gewone taal

Bij elke voorraadbeweging onthouden op welke plek ze gebeurde, en onderscheid maken tussen "verplaatst" en "geteld".

## User Story

As an inventory manager, I want stock movements to record which location
they happened at, and to distinguish a physical move or a cycle count
from a generic adjustment, so that the audit trail actually answers
"where" and "why", not just "how much changed".

## Acceptance Criteria

- `stock_ledger` gets a `location_id` FK to `locations`, nullable **only
  for the duration of this rollout** — so existing rows and any code path
  not yet location-aware keep working without a breaking migration, per
  `ADR-002`. This is a temporary state, not a permanent design: `STORY-042`
  backfills every existing row and drops the nullability once verified.
  New code should not be written to depend on `location_id IS NULL`
  meaning anything long-term.
- `ledger_reason` gains `moved` and `counted` (skip whichever
  `STORY-052` already added, if that ships first).
  - `moved` rows are only ever written by `move_stock` (`STORY-038`).
  - `counted` rows are only ever written by the cycle-count flow
    (`STORY-053`): the row's `quantity_delta` is *counted quantity minus
    system quantity* at that location, never the counted quantity itself.
    A count that matches the system writes no row.
- `current_stock` gains a location-scoped variant (per item, per
  location, per tenant) alongside the existing tenant-wide rollup — the
  existing view isn't removed, since other features still depend on the
  tenant-wide number until they're individually migrated to be
  location-aware (not part of this epic).
  - **This variant excludes `staging`-type locations from what counts as
    "available" stock** (joins `locations` and filters `type = 'storage'`,
    or exposes location type alongside the quantity so callers can
    filter). Without this, stock a fulfillment order has already picked
    but not yet shipped would show up as ordinary available stock at its
    staging location — double-countable by a second order or a
    production run. `STORY-039` depends on this distinction existing.
- Manual stock adjustment API accepts an optional `location_id`.
  - **Error cases:** a `location_id` from another tenant, an archived
    location, or a `staging` location for a manual adjustment →
    rejected. An adjustment that would take a location below zero →
    rejected with the available quantity.
- **Indexing**: add an explicit composite index on
  `stock_ledger (tenant_id, item_id, location_id)`. `stock_ledger` is
  append-only with many rows per item/location, so — unlike most other
  tables in this project — there's no unique constraint that could back
  this lookup for free; it needs a real `CREATE INDEX`. This is the
  first explicit secondary index added to the schema (everything else so
  far comes from a PK or a `UNIQUE` constraint); note that in the
  migration so it doesn't read as an accidental one-off. Needed by the
  location-scoped `current_stock` variant's `GROUP BY`, by `move_stock`'s
  per-location balance check (`STORY-038`), and by the fulfillment
  ledger writes (`STORY-039`) — all three read/write this exact key
  shape. (Pre-existing, out-of-scope-here observation: `stock_ledger` has
  no index at all today, not even `(tenant_id, item_id)` for the
  existing tenant-wide `current_stock` view — this story doesn't retrofit
  that, only adds what its own new query patterns need.)

## Tasks
