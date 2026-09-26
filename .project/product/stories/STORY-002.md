---
id: STORY-002
title: requireAuth / requirePermission middleware
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

As a backend developer, I want shared middleware that validates a
request's JWT and checks the caller's baked-in permissions, so that every
route enforces auth and authorization the same way instead of
reimplementing the check per-route.

## Acceptance Criteria

- `requireAuth` rejects requests with no/invalid token (401) and requests
  from a user with no `tenant_id` in `app_metadata` (403), and otherwise
  sets `user` (id/tenantId/roleId/permissions) and a user-scoped
  `supabase` client on the request context.
- `requirePermission('domain.action')` returns 403 when the caller's
  `app_metadata.permissions` doesn't grant that specific key.
- Every route file registers `requireAuth` with `.use('*', requireAuth)`
  (not the bare no-path form), since Hono's bare `.use()` doesn't apply to
  nested dynamic routes.

## Tasks
