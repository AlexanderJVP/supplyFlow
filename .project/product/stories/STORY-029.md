---
id: STORY-029
title: Real staging deploy dry run & smoke test
epic: EPIC-007-deployment-cicd
status: done
sprint: ''
story_points: 3
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies:
  - STORY-028
started_at: '2026-10-05T09:31:04.770Z'
done_at: '2026-10-05T09:31:04.770Z'
---
## In gewone taal

Een eerste proefversie online zetten en doorklikken of alles werkt zoals lokaal.

## User Story

As a developer, I want to do a real staging deploy and smoke-test it the
same way the local Docker E2E test does, so that I know the deployed
system actually works before calling it production-ready.

## Acceptance Criteria

- A deploy runs against the real Cloudflare Pages project + Worker.
- The staging deploy is smoke-tested: provision a tenant, sign in, and
  hit a handful of core routes (items, BOM, inventory, production,
  proposals).
- Any issues found are captured as new stories rather than silently
  patched without a record.

## Tasks
