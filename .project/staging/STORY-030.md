---
id: STORY-030
title: Bound permission staleness window on role demotion
epic: EPIC-001-auth-tenants-roles
status: backlog
sprint: null
story_points: 5
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-004]
---

> Design decided in `ADR-003` (revised after review, accepted 2026-09-26 —
> `engineering/decisions/ADR-003.md`). Implement exactly as specified
> there; still not MVP, picked up when its turn comes in the backlog.

## In gewone taal

Als je iemand rechten afneemt, werkt dat nu pas na maximaal een uur. Deze
story zorgt dat het bij de volgende klik van die persoon al geldt.

## User Story

As a tenant admin, I want a demoted or deactivated user's old permissions
to stop working promptly instead of persisting for up to an hour, so that
a role change is actually enforced in a reasonable time for
security/safety-sensitive actions (stock adjustments, production order
approval, BOM changes).

## Acceptance Criteria

- **Known gap (confirmed 2026-08-01)**: permissions are baked into a
  user's JWT `app_metadata`. Editing a role (`roles.ts`) or reassigning a
  user's role (`users.ts`) re-syncs `app_metadata` but does not
  invalidate an already-issued access token, so a demoted user keeps
  their old permissions for up to the ~1h token TTL.
- Explicitly **not MVP** — deferred by product decision (2026-08-01).
- Implemented exactly as `ADR-003` specifies (once accepted): a
  `profiles.permission_version`, a `buildAppMetadata()` helper used by all
  four write paths (`provision_tenant`, `POST /invite`, `PATCH /:id/role`,
  `roles.ts`), a self-repairing check in `requireAuth`, and the
  `PERMISSION_VERSION_ENFORCE` rollout flag.
- After a demotion, the user's **next** request returns
  `401 { code: 'token_stale' }`; the client refreshes once, retries, and
  the retried request runs with the new (reduced) permissions.
- A newly invited user's first request succeeds (the invite path sets
  `permission_version`).
- If the `app_metadata` push fails after the DB change, the user's next
  request repairs it and the user ends up with the correct permissions —
  no endless 401/refresh loop.
- A deleted or deactivated profile gets
  `401 { code: 'account_inactive' }` and the client signs out without
  retrying.
- With `PERMISSION_VERSION_ENFORCE=false`, tokens without the claim still
  work (no mass logout on deploy day); a present-but-outdated claim is
  still rejected.
- `requireAuth`'s added latency is measured on staging (target: less than
  10 ms at p95) before enforcement is switched on.

## Tasks
