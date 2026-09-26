---
id: STORY-009
title: Append-only stock ledger & current_stock view
epic: EPIC-003-inventory-stock-ledger
status: done
sprint: null
story_points: 3
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-005]
---

## User Story

As the platform, I want every stock change recorded as an append-only
ledger entry rather than a mutable counter update, so that stock levels
always have a full, tamper-evident history of who changed what and why.

## Acceptance Criteria

- `stock_ledger` has no UPDATE or DELETE route — only INSERT.
- `current_stock` is a derived view (`SUM(quantity_delta)` grouped by
  item/tenant), never a stored counter column on `items`.
- A manual stock adjustment API exists for ad-hoc corrections, going
  through the ledger like every other stock mutation.

## Tasks
