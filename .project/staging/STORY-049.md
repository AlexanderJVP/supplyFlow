---
id: STORY-049
title: Suppliers & per-item supplier info
epic: EPIC-011-purchasing-receiving
status: backlog
sprint: null
story_points: 3
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-005]
---

## In gewone taal

Een lijst van je leveranciers, en per artikel bij wie je het koopt, onder
welk nummer de leverancier het kent en hoe lang levering meestal duurt.

## User Story

As a purchaser, I want to keep a list of my suppliers and record per item
who I buy it from, their article number and the usual delivery time, so
that ordering is quick and reorder suggestions know how far ahead to plan.

## Acceptance Criteria

- A `suppliers` table (tenant-scoped, RLS): name, contact email, phone,
  notes, `is_archived`.
- A `supplier_items` table: `supplier_id`, `item_id`, supplier's own SKU,
  lead time in days, minimum order quantity, `is_preferred`;
  `unique (supplier_id, item_id)`. At most one preferred supplier per
  item.
- API + UI (suppliers page; supplier section on the item detail page),
  gated by a new `purchasing` permission block (`view`, `edit`) added to
  the permissions shape and to the Admin role in `provision_tenant`.
- Audited by the existing `log_audit_event` trigger (attach it to both
  new tables).
- **Error cases:**
  - Duplicate supplier name within a tenant → `409`.
  - Linking the same supplier to the same item twice → `409`.
  - Marking a second preferred supplier for an item → the previous one
    is un-marked in the same transaction (not an error, not two
    preferred).
  - Lead time or minimum order quantity negative → rejected by Zod.
  - Archiving a supplier with open purchase orders → blocked.

## Tasks
