---
id: STORY-041
title: Default warehouse & location on tenant provisioning
epic: EPIC-009-multi-location-warehouse-ops
status: backlog
sprint: null
story_points: 2
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-036]
---

## In gewone taal

Elk nieuw bedrijf krijgt meteen een standaardmagazijn met een standaardplek, zodat er altijd een plek is om voorraad aan te koppelen.

## User Story

As the platform, I want every new tenant to automatically get one default
warehouse and one default location the moment it's provisioned, so that
single-location tenants never depend on `location_id IS NULL` and every
stock event always has a real location to attach to from day one.

## Acceptance Criteria

- `provision_tenant` is extended to also insert one default `warehouse`
  (e.g. named after the tenant, or a fixed "Main Warehouse") and one
  default `location` (e.g. "Default") for the new tenant.
- This insert happens in the same atomic transaction as the rest of
  provisioning (tenant + Admin role + profile + one workflow step per
  proposal type) — no new RPC, per Non-Negotiable Rule 4. `provision_tenant`
  stays the single entry point for "what exists the moment a tenant is
  created."
- Requires `STORY-036` (the `warehouses`/`locations` schema) to exist
  first.
- Per `ADR-002`: this closes the "what happens for new tenants" half of
  the `location_id` semantics question left open in the original ADR
  draft — from this story onward, no tenant is ever created without a
  real default location.
- Does not by itself change `stock_ledger.location_id`'s nullability or
  touch existing tenants — that's `STORY-042`.

## Tasks
