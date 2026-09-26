---
id: STORY-007
title: Item detail page with embedded BOM tree & stock
epic: EPIC-002-item-catalog-bom
status: done
sprint: null
story_points: 3
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-005, STORY-006]
---

## User Story

As a production planner, I want a single page for one item that shows
its full fields, current stock, recent stock movements, and its BOM tree,
so that I don't have to piece the picture together from multiple screens.

## Acceptance Criteria

- `ItemDetail.tsx` is reachable at `/items/:id`.
- The page shows all item fields with edit/archive actions, current
  stock, recent stock-ledger movements, and an embedded `BomTreeViewer`.
- `BomTreeViewer.tsx` includes a child-item + quantity add form scoped to
  that item.

## Tasks
