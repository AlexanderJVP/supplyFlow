---
id: STORY-016
title: Production orders UI (create/start/complete) & CSV export
epic: EPIC-004-production-orders
status: done
sprint: null
story_points: 3
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-014, STORY-015]
---

## User Story

As a production planner, I want a page to create, start, and complete
production orders, and export the order list as CSV, so that I can
manage a production run end-to-end without leaving the app.

## Acceptance Criteria

- `ProductionOrders.tsx` supports create/start/complete actions and a
  paginated order list. *(Corrected 2026-09-26: "filterable" was removed
  — no filter was ever built. Cancelling is covered by `STORY-048`.)*
- `GET /api/production/export` (gated by `production.view`) produces a
  CSV, capped at 10k rows, with an "Export CSV" button in the UI.

## Tasks
