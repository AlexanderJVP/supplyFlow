---
id: STORY-050
title: Purchase orders (create, send, cancel)
epic: EPIC-011-purchasing-receiving
status: backlog
sprint: null
story_points: 3
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-049]
---

## In gewone taal

Een bestelling bij een leverancier aanmaken: welke artikelen, hoeveel,
en wanneer je ze verwacht. Zo weet het systeem ook wat er "onderweg" is.

## User Story

As a purchaser, I want to create a purchase order for a supplier with the
items and quantities I'm ordering, so that I have a record of what's on
its way and can check deliveries against it.

## Acceptance Criteria

- `purchase_orders` (tenant-scoped, RLS): `supplier_id`, order number
  (unique per tenant), expected delivery date, notes, status enum
  `purchase_order_status`: `draft`, `sent`, `partially_received`,
  `received`, `cancelled`.
- `purchase_order_lines`: `item_id`, `quantity_ordered > 0`,
  `quantity_received` (starts at 0, only changed by `STORY-051`'s RPC);
  `unique (purchase_order_id, item_id)`.
- UI: list (paginated with the existing `useCursorPagination`), create,
  edit while `draft`, mark as `sent`, cancel.
- "On order" quantity per item (open lines: ordered minus received on
  non-cancelled orders) is available as a query/view for `STORY-054`.
- **Error cases:**
  - Order with no lines → can't be marked `sent`.
  - Line for an archived item, or supplier archived → rejected.
  - Editing lines after `sent` → rejected (cancel and re-create instead).
  - Cancelling an order that is `partially_received` → allowed; the
    already-received stock stays, the remaining quantity is no longer
    "on order". Cancelling a fully `received` order → rejected.

## Tasks
