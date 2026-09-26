---
id: STORY-004
title: Admin — invite user & manage roles
epic: EPIC-001-auth-tenants-roles
status: done
sprint: null
story_points: 5
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-001, STORY-002]
---

## User Story

As a tenant admin, I want to invite new users and edit what each role can
do, so that I can manage my team's access without needing platform-level
support.

## Acceptance Criteria

- `POST /api/users/invite` sends a real invite email via
  `supabase.auth.admin.inviteUserByEmail`. (Its rate limit is covered by
  `STORY-022`, not duplicated here.)
- `PATCH /api/users/:id/role` reassigns a user's role and re-syncs their
  `app_metadata`.
- Editing a role's permissions (`roles.ts`) immediately pushes the new
  permission snapshot to every current member's `app_metadata`, since
  permissions are baked into the JWT at invite time rather than looked up
  live on every request.
- `Admin.tsx` (`/admin`) exposes a permissions checkbox-grid editor, and
  the nav link only appears for users holding
  `admin.manage_users`/`admin.manage_roles`.

## Tasks
