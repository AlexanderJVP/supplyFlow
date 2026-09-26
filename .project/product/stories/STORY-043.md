---
id: STORY-043
title: 'Bug: concurrent production order completions can drive stock negative'
epic: EPIC-010-stock-accuracy
status: backlog
sprint: sprint-1
story_points: 3
priority: high
type: bug
origin: ai-generated
edited: false
generated_by: claude
dependencies:
  - STORY-014
---
## In gewone taal

Als twee mensen tegelijk een productieorder afronden die hetzelfde
onderdeel nodig heeft, kunnen ze allebei "genoeg voorraad" zien en samen
meer verbruiken dan er is. De voorraad komt dan onder nul. Dit moet
onmogelijk worden.

## User Story

As a production planner, I want the system to refuse to complete a
production order when another order has just used up the components it
needs, so that stock can never go negative and the numbers on screen can
always be trusted.

## Acceptance Criteria

- **The bug (found during `ADR-002` review):** `complete_production_order`
  takes `FOR UPDATE` on the `production_orders` row only. Component stock
  is a derived `SUM` over `stock_ledger`, so nothing locks it: two
  concurrent completions consuming the same component can both pass the
  shortfall check and jointly overdraw it.
- `complete_production_order` takes `pg_advisory_xact_lock` per consumed
  component, keyed on `(tenant_id, item_id)` hashed to a `bigint` (same
  scheme as `STORY-038`'s `move_stock`, without `location_id` until
  `EPIC-009` lands), acquired in sorted key order **before** the shortfall
  check.
- **Error cases:**
  - Second concurrent completion with insufficient remaining stock → the
    RPC raises, nothing is written (no partial ledger rows), and the API
    returns `409` with the shortfall per component; the order stays
    `in_progress`.
  - The UI shows the shortfall message instead of a generic error.
  - Completing an already-completed or cancelled order still fails as
    today.
- An integration test fires two completions for the same scarce
  component in parallel and asserts: exactly one succeeds, stock never
  goes below zero.
- The key scheme is shared with `move_stock` (`STORY-038`) and
  `reserve_stock` (`STORY-035`) — one documented helper function, not
  three improvised hashes.
  - **This story builds that shared helper first** (e.g. a
    `stock_lock_key(tenant_id, item_id, location_id default null)` SQL
    function plus a `lock_stock_keys(...)` that acquires them in sorted
    order). `STORY-035`, `STORY-038` and `STORY-053` reuse it later —
    don't wait for any of them.

## Tasks
