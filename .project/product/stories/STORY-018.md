---
id: STORY-018
title: Auto-apply approved bom_change proposals
epic: EPIC-005-workflow-proposals
status: done
sprint: null
story_points: 5
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-017, STORY-006]
---

## User Story

As a BOM approver, I want an approved BOM change to apply itself
immediately and atomically, so that final approval and the actual BOM
update can never drift apart.

## Acceptance Criteria

- On final approval of a `bom_change` proposal, `review_proposal` calls
  `apply_bom_change_payload` in the same transaction as recording the
  approval.
- The existing `prevent_bom_cycle`/`prevent_bom_cross_tenant` triggers
  still apply to changes applied this way.

## Tasks
