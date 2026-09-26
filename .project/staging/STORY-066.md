---
id: STORY-066
title: Platform support account per tenant & user deactivation
epic: EPIC-012-onboarding
status: backlog
sprint: null
story_points: 3
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-001, STORY-004]
---

> Implements `ADR-004` (accepted 2026-09-26 —
> `engineering/decisions/ADR-004.md`).

## In gewone taal

Jij krijgt bij elke klant een eigen, zichtbaar "support"-account om de
opstart te doen. De klant ziet het in zijn gebruikerslijst en kan het
zelf uitschakelen. Meteen komt er ook een knop om gewone gebruikers uit
te schakelen (bv. iemand die vertrekt).

## User Story

As the platform owner, I want a visible support account inside each
customer's environment, and as a customer admin I want to deactivate any
user — including that support account — so that onboarding access is
transparent and always under the customer's control.

## Acceptance Criteria

- Migration: `profiles.is_platform_support boolean not null default
  false`.
- `POST /api/admin/tenants` accepts an optional support e-mail; if given,
  `provision_tenant` creates the support profile (Admin role) in the same
  transaction. A new admin endpoint adds a support account to an existing
  tenant (same `X-Admin-Secret` gate and rate limit as tenant creation).
- Admin user list: "Platform support" badge on support accounts.
- **User deactivation (new, needed by this and by `ADR-003`):**
  `PATCH /api/users/:id/active`, gated by `admin.manage_users`, sets
  `profiles.is_active`. A deactivated user's requests are refused (`403`,
  or `401 account_inactive` once `ADR-003` is implemented) and they can't
  be picked as a reviewer.
- **Error cases:**
  - An admin deactivating themselves → blocked.
  - Deactivating the last active user with `admin.manage_users` in the
    tenant → blocked (the company would lock itself out).
  - Support e-mail already used by another tenant's login → rejected
    with a clear message (one login = one tenant, see `ADR-004`).
  - Reactivating a user → allowed; their role and history are intact.

## Tasks
