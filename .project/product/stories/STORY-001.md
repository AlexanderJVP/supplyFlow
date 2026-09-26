---
id: STORY-001
title: Tenant provisioning endpoint
epic: EPIC-001-auth-tenants-roles
status: done
sprint: null
story_points: 5
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: []
---

## User Story

As a platform operator, I want a single admin-gated endpoint that creates
a brand new tenant (company, admin role, admin profile, and one default
workflow step per proposal type) atomically, so that onboarding a new
customer never leaves the system in a half-created state.

## Acceptance Criteria

- `POST /api/admin/tenants` is gated by an `X-Admin-Secret` header and
  rate-limited to 3 requests per IP per hour.
- The tenant, its Admin role, the first profile, and one `workflow_steps`
  row per proposal type are created inside a single `provision_tenant`
  database transaction — no partial tenant can exist if any step fails.
- On success, the new user's `app_metadata` (`tenant_id`, `role_id`,
  `permissions`) is set server-side via the Supabase admin client.

## Tasks
