---
id: STORY-071
title: Update GitHub Actions versions (Node 20 deprecation, Ubuntu 26 runner)
epic: EPIC-007-deployment-cicd
status: backlog
sprint: null
story_points: 1
priority: medium
type: chore
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-027]
---

## In gewone taal

GitHub waarschuwt bij elke run dat de bouwstenen van onze workflows
verouderd zijn (Node.js 20), en vanaf 19 oktober 2026 draaien de
testcomputers van GitHub op een nieuwe versie van Ubuntu. Nu werkt alles
nog, maar dit is klein onderhoud dat we best doen vóór het iets breekt.

## User Story

As the platform owner, I want our CI and deploy workflows on supported
action versions, so that they don't break unexpectedly when GitHub
retires old runtimes.

## Acceptance Criteria

- **Found 2026-10-05:** every run of `ci.yml`/`deploy.yml` warns that
  `actions/checkout@v4`, `actions/setup-node@v4` and `pnpm/action-setup@v4`
  target the deprecated Node.js 20, and that `ubuntu-latest` moves to
  Ubuntu 26 from 2026-10-19.
- All actions in both workflows are bumped to versions that run on a
  supported Node.js; no deprecation warnings remain in a run.
- Both workflows run green on the new `ubuntu-latest` (or the runner is
  pinned deliberately, with the reason in a comment).
- Optional while here: bump `wrangler` (4.101 → current) in client and
  server, and confirm the deploy still succeeds.
