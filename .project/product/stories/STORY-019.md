---
id: STORY-019
title: Proposal inbox UI & structured BOM-change editor
epic: EPIC-005-workflow-proposals
status: done
sprint: null
story_points: 5
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-017, STORY-018]
---

## User Story

As a department lead, I want a proposal inbox where I can submit, review,
approve/reject/request-changes, and — for BOM changes specifically —
build the change with a structured line-item editor instead of writing
raw JSON, so that proposing a BOM change is as safe as editing the BOM
directly.

## Acceptance Criteria

- `Proposals.tsx` lists proposals with submit/approve/reject/request-
  changes actions.
- `BomChangeEditor.tsx` is scoped to one parent item at a time: it shows
  existing BOM lines (editable quantity/notes, removable) plus a
  BomTreeViewer-style add-line form, and assembles the
  `BomChangePayload` automatically.
- A new read endpoint, `GET /bom/:itemId/lines` (direct, non-recursive
  lines with their own `id`), backs the editor — the recursive `/tree`
  RPC never exposes `bom_lines.id`, so it couldn't be reused for this.

## Tasks
