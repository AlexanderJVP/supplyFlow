---
id: STORY-006
title: Recursive BOM tree with cycle/cross-tenant guards
epic: EPIC-002-item-catalog-bom
status: done
sprint: null
story_points: 5
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-005]
---

## User Story

As a production planner, I want to build and view a multi-level Bill of
Materials (a bolt → frame assembly → bicycle), with the database itself
refusing to let me create an invalid tree, so that BOM data can never
silently become corrupt or cross-tenant.

## Acceptance Criteria

- `GET /:itemId/tree` returns the full recursive tree via a PostgreSQL
  recursive-CTE RPC (no recursion in application code).
- `POST /` (add a BOM line) requires `bom.edit`.
- The `prevent_bom_cycle` trigger rejects any line that would create a
  circular reference (including self-reference).
- The `prevent_bom_cross_tenant` trigger rejects a line whose parent or
  child item belongs to a different tenant — this is necessary because
  RLS doesn't catch it, since FK lookups bypass RLS.

## Tasks
