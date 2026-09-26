---
id: STORY-024
title: Sentry integration (client + server)
epic: EPIC-006-platform-hardening-observability
status: done
sprint: null
story_points: 3
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: []
---

## User Story

As a developer, I want unhandled errors on both the client and server
reported to Sentry, so that production issues surface automatically
instead of only showing up when a user reports them.

## Acceptance Criteria

- Server uses `@hono/sentry` (toucan-js), which runs natively in the
  Workers isolate without needing the `nodejs_compat` flag.
- Client uses `@sentry/react`, initialized from `VITE_SENTRY_DSN` in
  `main.tsx`, with `<App />` wrapped in an `ErrorBoundary`.
- Both sides are DSN-gated and no-op cleanly when the DSN env var is
  unset (no real Sentry project exists yet — see STORY-025).

## Tasks
