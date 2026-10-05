---
id: STORY-056
title: 'Where-used view — which products contain this item? (the doll, upwards)'
epic: EPIC-002-item-catalog-bom
status: backlog
sprint: sprint-2
story_points: 3
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies:
  - STORY-006
  - STORY-007
---
## In gewone taal

Nu kun je bij een product zien waaruit het bestaat (naar binnen in de
Russische pop). Deze story voegt de andere richting toe: bij een schroef
zie je in welke frames die zit, en in welke fietsen die frames zitten.

## User Story

As a production planner or supply manager, I want to see on any item's
page every product it is used in, at every level up, so that I know what
is affected before I change, reorder or phase out that item.

## Acceptance Criteria

- `GET /api/bom/:itemId/where-used` backed by a Postgres recursive-CTE
  RPC walking `bom_lines` **upwards** (child → parent → grandparent …),
  returning per parent: item, depth, quantity per direct parent, and the
  cumulative quantity of this item in that top-level product.
- Gated by `bom.view`, RLS-scoped, filtered by `tenant_id` like every
  other route.
- `ItemDetail.tsx` shows a "Used in" section next to the existing BOM
  tree, with links to each parent item's page.
- Works identically at every level: a component, a sub-assembly and a
  finished good all use the same view (a finished good simply shows
  "not used in other products").
- Archived parents are shown, marked as archived (they still matter for
  history), and can be hidden with a toggle.
- **Error cases:** item from another tenant → `404`; item with no parents
  → empty list, not an error. (Cycles can't exist thanks to
  `prevent_bom_cycle`, but the CTE still has a depth limit as a safety
  net.)
- Reused by `STORY-057` (impact) and `STORY-059` (replace everywhere).

## Tasks
