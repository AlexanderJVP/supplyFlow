---
id: STORY-044
title: Pick a fulfillment order (move stock to staging)
epic: EPIC-009-multi-location-warehouse-ops
status: backlog
sprint: null
story_points: 3
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-039, STORY-038]
---

## In gewone taal

"Verzamelen": de artikelen van een uitlevering uit hun vak halen en naar
de klaarzetplek brengen. Het systeem boekt ze van het vak naar die plek,
zodat ze niet meer als vrij beschikbaar meetellen.

## User Story

As a warehouse operator, I want to mark an outbound order as picked,
with the system moving each line's stock from its shelf location to the
warehouse's staging area, so that picked goods can't be promised to
anyone else and I can see exactly where they are.

## Acceptance Criteria

- Picking calls `move_stock` (`STORY-038`) per line: from the chosen
  source location to the **staging location of that location's
  warehouse** (guaranteed to exist per `STORY-036`), reason `moved`,
  `reference_type='fulfillment_order'`, `reference_id` = the order.
- All lines are picked in one transaction (one RPC, Non-Negotiable Rule
  4): either every line moves, or none does.
- Order status goes `draft` → `picked` in the same transaction.
- **Error cases:**
  - Not enough stock at the source location for any line → nothing
    moves, status stays `draft`, response lists the short lines.
  - Picking an order that isn't `draft` → rejected.
  - Source location in a different warehouse than expected / not a
    `storage` location → rejected.
  - Cancelling a `picked` order → stock is moved back from staging to
    the original source locations (reason `moved`, same reference), then
    status `cancelled`, in one transaction.
- **Known follow-on (not solved here):** picking claims stock without a
  reservation until `STORY-035` lands — two orders picking the same stock
  at the same moment are still serialized by `move_stock`'s advisory
  lock, so stock can't go negative, but the second order will simply
  fail. Revisit once reservations exist.

## Tasks
