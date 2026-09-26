---
id: STORY-017
title: Proposal submit/review with per-tenant workflow chain
epic: EPIC-005-workflow-proposals
status: done
sprint: null
story_points: 5
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-001, STORY-002]
---

## User Story

As a department lead, I want to submit a proposed change and have it
routed through my tenant's configured approval chain, so that the right
roles review it in the right order before it takes effect.

## Acceptance Criteria

- `POST /:id/submit` and `POST /:id/review` are backed by
  `submit_proposal`/`review_proposal` RPCs.
- `review_proposal` walks the tenant's `workflow_steps` chain for that
  proposal's type, matching the reviewer's actual `profiles.role_id` —
  not just the coarse `proposals.review` permission.
- Every tenant is seeded with one workflow step per proposal type at
  provisioning time (`provision_tenant`).

## Tasks
