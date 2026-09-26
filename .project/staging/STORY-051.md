---
id: STORY-051
title: Receive goods against a purchase order (incl. partial deliveries)
epic: EPIC-011-purchasing-receiving
status: backlog
sprint: null
story_points: 3
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-050]
---

## In gewone taal

Als een levering binnenkomt, open je de bestelling en vul je in wat er
echt geleverd is. Het systeem zet dat op voorraad en onthoudt wat nog
openstaat. Komt de rest later, dan ontvang je die later.

## User Story

As a warehouse operator, I want to book an incoming delivery against its
purchase order, entering what actually arrived, so that stock goes up by
exactly what came in and I can see what's still outstanding.

## Acceptance Criteria

- A `receive_purchase_order` RPC takes the order and, per line, the
  quantity received now. In one transaction it:
  - writes one positive `stock_ledger` row per line received, reason
    `received`, `reference_type='purchase_order'`, `reference_id` = the
    order;
  - increases each line's `quantity_received`;
  - sets the order to `partially_received` or `received`.
- Multiple receipts per order are allowed (partial deliveries).
- UI: a "Receive" screen on a `sent`/`partially_received` order, showing
  ordered / already received / receiving now per line.
- Once `EPIC-009` lands, the receipt takes a destination location; until
  then it books tenant-wide like today's manual adjustment.
- **Error cases:**
  - Receiving on a `draft`, `received` or `cancelled` order → rejected.
  - Receiving more than the open quantity on a line → rejected by
    default with the open amount shown. (Accepting over-deliveries is a
    later, explicit option — not silently allowed.)
  - Quantity zero or negative → ignored (zero) / rejected (negative).
  - An item not on the order → rejected; it must be added as a manual
    adjustment or a new order, so the purchase order stays accurate.
  - Two people receiving the same order at the same time → the RPC
    locks the order row (`FOR UPDATE` on `purchase_orders` — correct
    here, because the counter being protected lives on that row), so the
    second receipt sees the updated open quantities.

## Tasks
