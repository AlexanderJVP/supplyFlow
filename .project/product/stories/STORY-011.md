---
id: STORY-011
title: Stock dashboard & movement history UI
epic: EPIC-003-inventory-stock-ledger
status: done
sprint: null
story_points: 3
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-009, STORY-010]
---

## User Story

As an inventory manager, I want a dashboard of current stock levels and
per-item movement history, so that I can see at a glance what's low and
trace how it got that way.

## Acceptance Criteria

- `StockDashboard.tsx` lists paginated inventory with reorder-point
  alerts surfaced, using the shared `useCursorPagination` + `Pager`
  components.
- `MovementHistory.tsx` shows the stock-ledger entries for a given item.

## Tasks
