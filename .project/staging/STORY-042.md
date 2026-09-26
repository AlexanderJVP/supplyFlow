---
id: STORY-042
title: Backfill existing tenants' default location; make stock_ledger.location_id NOT NULL
epic: EPIC-009-multi-location-warehouse-ops
status: backlog
sprint: null
story_points: 3
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-037, STORY-041]
---

## In gewone taal

Bedrijven die al bestonden ook een standaardmagazijn geven, en hun oude voorraadboekingen aan die plek koppelen. Dit is een eenmalige, gecontroleerde uitzondering op de regel dat het voorraadlogboek nooit gewijzigd wordt.

## User Story

As the platform, I want tenants that existed before multi-location
support to be migrated onto a real default location — not left on `NULL`
indefinitely — so that `location_id IS NULL` stays a temporary rollout
state instead of becoming a permanent special case every future query
has to know about.

## Acceptance Criteria

- One-time migration: for every tenant that doesn't yet have a warehouse/
  location (i.e. every tenant created before `STORY-041` shipped), insert
  a default warehouse + location — same shape `STORY-041` creates for new
  tenants.
- Backfill: update every `stock_ledger` row where `location_id IS NULL`
  to point at that tenant's newly-created default location.
- **This is a deliberate, one-time exception to Non-Negotiable Rule 3**
  (`stock_ledger` is append-only), recorded in `ADR-002`. It is only
  allowed because it fills in `location_id` and nothing else:
  - The migration updates `location_id` only — never `quantity_delta`,
    `reason`, `user_id`, `reference_*`, `notes`, or `created_at`.
  - It runs as a reviewed SQL migration only, never from application code
    or an RPC, and is not reusable afterwards.
  - Before and after the backfill, `COUNT(*)` and `SUM(quantity_delta)`
    per `(tenant_id, item_id)` are captured and must be identical; if
    they differ, the migration rolls back.
- Verification step before the next migration: confirm the count of
  remaining `NULL` `location_id` rows is zero (or reconcile any that
  legitimately shouldn't be backfilled) — this changes a live table's
  data, not just its schema, so it must be checked, not assumed.
- Follow-up migration (can be the same PR, run after verification):
  `ALTER TABLE stock_ledger ALTER COLUMN location_id SET NOT NULL`.
  From this point on, `location_id IS NULL` is no longer possible for
  any `stock_ledger` row, existing or new.
- Per `ADR-002`: this is what makes the nullable rollout window in
  `STORY-037` genuinely temporary — without this story, `NULL` would
  become the de facto permanent representation for every tenant that
  existed before multi-location shipped, which is exactly the
  unspecified-forever-special-case this epic was revised to avoid.

## Tasks
