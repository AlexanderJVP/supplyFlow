---
id: STORY-035
title: Stock reservation RPC (reserve_stock / release_reservation)
epic: EPIC-010-stock-accuracy
status: backlog
sprint: null
story_points: 5
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-014, STORY-015, STORY-043]
---

## In gewone taal

Onderdelen vastzetten voor een productieorder, zodat een andere order ze intussen niet kan opmaken.

## User Story

As a production planner, I want to reserve the components a production
order needs, so that another order can't claim the same scarce stock in
the meantime and my "can we build N?" check stays true until I build.

## Acceptance Criteria

- A `reserve_stock`/`release_reservation` RPC pair, in Postgres per
  `ADR-001` (no Durable Objects). **Locking: `pg_advisory_xact_lock` per
  `(tenant_id, item_id)`, using the shared key helper from `STORY-043`** —
  *not* a copy of `complete_production_order`'s original `FOR UPDATE`,
  which only locks the order row and doesn't protect derived stock (see
  `ADR-001` amendment 2026-09-26).
- A reservation concept is added to the schema (e.g. a
  `stock_reservations` table, or a reserved-quantity view alongside
  `current_stock`) — exact shape is follow-up design work, not decided by
  this story.
- `can_produce` and `complete_production_order` account for existing
  reservations so two concurrent production orders can't both succeed
  against the same limited stock.
- Reservations are released (not just consumed) when a production order
  is cancelled, and consumed when it is completed.
- **Error cases:**
  - Reserving more than the unreserved available stock → rejected with
    the shortfall per component; no partial reservation is kept.
  - Reserving for an order that is `completed`/`cancelled` → rejected.
  - Releasing a reservation that doesn't exist or was already released →
    no-op, not an error (safe to retry).
  - Reserving twice for the same order → replaces the previous
    reservation instead of doubling it.

## Tasks
