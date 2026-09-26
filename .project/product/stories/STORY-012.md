---
id: STORY-012
title: CSV export for inventory
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

As an inventory manager, I want to export the current inventory list as
CSV, so that I can share or analyze it outside the app (e.g. in Excel).

## Acceptance Criteria

- `GET /api/inventory/export` is gated by `inventory.export` and returns
  a CSV file, capped at 10k rows.
- The client "Export CSV" button on `StockDashboard.tsx` triggers a file
  download.

## Tasks
