---
id: STORY-003
title: Login page, auth context & protected routes
epic: EPIC-001-auth-tenants-roles
status: done
sprint: null
story_points: 3
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: []
---

## User Story

As a user, I want to sign in with email/password and stay signed in
across a page refresh, so that I don't have to re-authenticate constantly
while I'm using the app.

## Acceptance Criteria

- `Login.tsx` calls `supabase.auth.signInWithPassword` directly from the
  client (never through our own server), matching the documented auth
  architecture.
- All feature routes (`/items`, `/inventory`, `/production`, `/proposals`,
  `/admin`) are behind a `ProtectedLayout` that redirects unauthenticated
  users to `/login`.
- The API client (`lib/api.ts`) attaches the current session's access
  token to every request and signs the user out on a 401 response.

## Tasks
