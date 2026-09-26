---
id: STORY-005
title: Item CRUD (create, list, edit, archive)
epic: EPIC-002-item-catalog-bom
status: done
sprint: null
story_points: 3
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-002]
---

## User Story

As a production planner, I want to create, list, edit, and archive
catalog items (components, sub-assemblies, finished goods), so that the
item catalog stays an accurate, current source of truth.

## Acceptance Criteria

- `GET /` (paginated), `POST /`, `PATCH /:id`, and `PATCH /:id/archive`
  are gated by `items.create`/`items.edit`/`items.archive` and scoped by
  RLS to the caller's tenant.
- `ItemList.tsx` shows a paged table with inline edit and archive actions.
- Every request also filters explicitly by `tenant_id` in application
  code, even though RLS is the real enforcement layer.

## Tasks
