---
id: STORY-008
title: Direct BOM line edit/delete API
epic: EPIC-002-item-catalog-bom
status: backlog
sprint: null
story_points: 3
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-006]
---

## In gewone taal

Een fout in een stuklijst snel zelf rechtzetten, zonder eerst een voorstel en goedkeuring. Pas bouwen als daar echt vraag naar is.

## User Story

As a production planner, I want to edit or remove an existing BOM line
directly, so that small corrections don't require going through a full
`bom_change` proposal and approval cycle.

## Acceptance Criteria

- A direct API (e.g. `PATCH`/`DELETE` on a BOM line) exists, gated by
  `bom.edit`, in addition to the existing proposal-based path.
- The existing cycle/cross-tenant triggers still apply to direct edits.
- Documented as a deliberate scope cut in Phase 2 ("line edit/delete is
  only reachable indirectly via an approved `bom_change` proposal ...
  revisit if a direct-edit need shows up") — only pick this up once
  there's an actual reported need for it.

## Tasks
