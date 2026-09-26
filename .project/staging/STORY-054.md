---
id: STORY-054
title: Reorder suggestions (what should I order, and how much?)
epic: EPIC-011-purchasing-receiving
status: backlog
sprint: null
story_points: 5
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-010, STORY-015, STORY-050]
---

## In gewone taal

Het systeem kijkt naar wat je hebt, wat al besteld is en wat je binnenkort
nodig hebt voor geplande productie, en stelt voor wat je moet bijbestellen
en hoeveel. Met één klik maak je daar een bestelling van.

## User Story

As a purchaser, I want a list of items I should reorder, with a suggested
quantity and supplier, so that I order in time instead of reacting after
something has already run out.

## Acceptance Criteria

- Items get an optional `reorder_quantity` (how much to order at once),
  next to the existing `reorder_point`.
- For each item, the suggestion uses:
  *projected stock* = current stock + on order (`STORY-050`) − demand
  from open production orders (`draft`/`in_progress`, via the recursive
  BOM, same logic as `can_produce`). An item is suggested when projected
  stock is below `reorder_point`.
- Suggested quantity = enough to get back above `reorder_point`, rounded
  up to `reorder_quantity` and to the preferred supplier's minimum order
  quantity (`STORY-049`).
- Implemented as one Postgres function (recursive CTE, no BOM recursion
  in application code).
- UI: a "Reorder suggestions" page grouped by preferred supplier, with
  "Create purchase order" per supplier (creates a `draft` order the user
  can still edit).
- Replaces nothing: the existing reorder-point alerts (`STORY-010`) keep
  working; this is the forward-looking version.
- **Error cases / edge cases:**
  - Item without `reorder_point` → never suggested (same rule as alerts).
  - Item without a preferred supplier → listed under "No supplier" and
    can't be turned into an order until one is set.
  - Archived items → never suggested.
  - Creating an order from a suggestion that another user just ordered →
    the page refreshes the numbers first and shows the updated
    suggestion instead of double-ordering.

## Tasks
