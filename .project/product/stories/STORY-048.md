---
id: STORY-048
title: Cancel a production order
epic: EPIC-004-production-orders
status: done
sprint: null
story_points: 1
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-016]
---

> Written 2026-09-26 to document an already-built feature that had no
> story (found while checking the backlog against the code).

## In gewone taal

Een productieorder die toch niet doorgaat kun je annuleren, zolang ze nog
niet afgerond is. Er verandert dan niets aan de voorraad.

## User Story

As a production planner, I want to cancel a production order that won't
go ahead, so that it no longer shows up as planned work.

## Acceptance Criteria

- `POST /api/production/:id/cancel`, gated by `production.cancel`, sets
  status `cancelled` — only from `draft` or `in_progress`.
- The "Cancel" button in `ProductionOrders.tsx` triggers it.
- Cancelling writes no `stock_ledger` rows (nothing was consumed yet).
- `complete_production_order` refuses a cancelled order.
- **Known limitation (not fixed):** cancelling an order that is already
  `completed`/`cancelled` (or doesn't exist) returns a generic `500`
  instead of a clear `409`/`404`, because the route relies on
  `.single()` finding no row.
- Once reservations exist (`STORY-035`), cancelling must also release
  them — tracked there.

## Tasks
