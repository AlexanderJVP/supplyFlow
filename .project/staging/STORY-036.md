---
id: STORY-036
title: Warehouses & locations schema
epic: EPIC-009-multi-location-warehouse-ops
status: backlog
sprint: null
story_points: 5
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: []
---

## In gewone taal

In het systeem vastleggen welke magazijnen (gebouwen) je hebt en welke plekken (rekken, vakken) daarin zitten.

## User Story

As an inventory manager, I want to define my company's warehouses
(buildings/sites) and the locations (bins/zones) within each one, so
that stock can be tracked at the actual physical place it lives, not
just as one tenant-wide number.

## Acceptance Criteria

- A `warehouses` table exists, tenant-scoped, RLS-isolated like every
  other table.
- A `locations` table exists, FK'd to `warehouse_id`, RLS-isolated the
  same way. Has a `type` column (`location_type` enum: `storage`,
  `staging`) — needed so "available stock" queries (`STORY-037`) and
  fulfillment's pick step (`STORY-039`) can tell a normal storage bin
  apart from a transient staging area. Only these two values are added
  now; not speculatively adding `dock`/`receiving` ahead of an actual
  need.
- `locations` has a `unique (warehouse_id, name)` constraint — prevents
  duplicate location names within one warehouse, and its backing index
  is what makes "list locations in this warehouse" (`warehouse_id` is
  the leading column) a lookup instead of a scan, matching how existing
  tables (e.g. `items`' `unique(sku, tenant_id)`) already get their
  indexing for free from a unique constraint rather than a bare
  `CREATE INDEX`.
- **Creating a warehouse always creates exactly one companion `staging`
  location for it, in the same transaction** — the same "guarantee a
  default row exists, don't leave it as a special case" principle
  `ADR-002` already applies to tenants (`STORY-041`/`STORY-042`), applied
  here to warehouses. Without this, `STORY-039`'s `picked` step would
  have nothing well-defined to move stock to.
- Basic CRUD for both, gated by an appropriate permission (extend the
  `inventory` permission block or add a new one, per the existing
  permissions-shape convention).
- **Error cases:**
  - Duplicate location name in the same warehouse → `409`, from the
    unique constraint (not a generic `500`).
  - Deleting/archiving a location that still holds stock → rejected;
    stock must be moved first. Locations with ledger history are
    archived, never hard-deleted (the ledger references them).
  - Deleting, archiving or retyping a warehouse's automatic `staging`
    location → rejected.
  - Archiving a tenant's last active warehouse → rejected.
  - A location or warehouse from another tenant → invisible (RLS) and
    rejected as an FK target.
- Per `ADR-002` — this is the foundation STORY-037 through STORY-039
  build on.
- This schema alone doesn't guarantee every tenant has a row in it —
  `STORY-041` (new tenants, via `provision_tenant`) and `STORY-042`
  (existing tenants, via backfill) are what make "every tenant has at
  least one default warehouse + location" actually true. Without those,
  this story only adds empty tables.

## Tasks
