---
id: STORY-025
title: Provision a real Sentry DSN and verify error capture
epic: EPIC-006-platform-hardening-observability
status: backlog
sprint: null
story_points: 2
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-024, STORY-029]
---

> **Not for sprint 1** (sprint-risk review 2026-09-26): this can only be
> verified once `STORY-029` has put a real deployment online. Priority
> stays low on purpose.

## In gewone taal

De crashmeldingen echt aanzetten en testen dat ze binnenkomen. Kan pas als de app online staat.

## User Story

As a developer, I want a real Sentry project and DSN wired into the
actual deployment, so that Sentry integration goes from "code is ready"
to "we actually get paged/notified when something breaks in production".

## Acceptance Criteria

- A real Sentry project exists and its DSN is set as `VITE_SENTRY_DSN`
  (client) and the equivalent server secret, for the real deployment.
- A deliberately triggered test error on the deployed app shows up in
  the Sentry dashboard.
- Blocked on there being an actual deployment to monitor (see
  EPIC-007-deployment-cicd) — this can't be verified from a local/sandbox
  environment alone.

## Tasks
