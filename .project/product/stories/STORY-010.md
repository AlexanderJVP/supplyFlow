---
id: STORY-010
title: Reorder-point stock alerts
epic: EPIC-003-inventory-stock-ledger
status: done
sprint: null
story_points: 2
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-009]
---

## User Story

As an inventory manager, I want to see which items have fallen below
their reorder point, so that I know what to restock before it blocks
production.

## Acceptance Criteria

- `GET /api/inventory/alerts` returns items whose current stock is below
  their configured `reorder_point` (items with a null `reorder_point`
  never alert).
- The endpoint is covered by an integration test.

## Tasks
