---
id: STORY-039
title: Fulfillment order entity & lines (create / cancel)
epic: EPIC-009-multi-location-warehouse-ops
status: backlog
sprint: null
story_points: 3
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-036, STORY-041, STORY-042]
---

> **Split 2026-09-26** (was 5 points covering create + pick + pack + ship,
> too big for one sprint). This story is now only the order itself; the
> stock-moving steps are `STORY-044` (pick) and `STORY-045` (pack & ship).

## In gewone taal

Een "uitlevering" aanmaken: een lijstje van welke artikelen, hoeveel, en
voor wie of waarvoor ze het magazijn uit moeten. Hier gebeurt nog niets
met de voorraad; dat komt bij het verzamelen en verzenden.

## User Story

As a warehouse operator, I want to create an outbound order listing which
items and quantities must leave the warehouse, so that picking, packing
and shipping have a clear, checkable list to work from.

## Acceptance Criteria

- A new `fulfillment_orders` table, separate from `production_orders`
  (per `ADR-002`), tenant-scoped and RLS-isolated. Its status type is a
  new enum distinct from `production_status` (e.g. `fulfillment_status`:
  `draft`, `picked`, `packed`, `shipped`, `cancelled`).
- A `fulfillment_order_lines` table (tenant-scoped, `fulfillment_order_id`,
  `item_id`, `quantity > 0`) with `unique (fulfillment_order_id, item_id)`
  — one line per item per order; the unique constraint doubles as the
  lookup index.
- A free-text `reference` field on the order (e.g. customer name or order
  number). **Open question:** whether fulfillment orders need a real
  customer/address entity — deliberately not modelled until that's
  decided.
- API + permissions to create an order with lines, edit lines while
  `draft`, list/view orders, and cancel.
- **Error cases:**
  - Order with zero lines → cannot leave `draft`.
  - Line for an archived item or an item from another tenant → rejected.
  - Editing lines once the order is past `draft` → rejected.
  - Cancelling a `draft` order → allowed, no stock effect. Cancelling a
    `picked` order → handled by `STORY-044` (stock must move back).
    Cancelling a `packed`/`shipped` order → rejected.
- No `stock_ledger` writes in this story.

## Tasks
