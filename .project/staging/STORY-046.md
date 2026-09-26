---
id: STORY-046
title: Manage warehouses & locations (UI)
epic: EPIC-009-multi-location-warehouse-ops
status: backlog
sprint: null
story_points: 3
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-036]
---

## In gewone taal

Een scherm waar je je magazijnen (gebouwen) en de plekken daarin (rekken,
vakken) aanmaakt, hernoemt en opruimt.

## User Story

As an inventory manager, I want a screen to add, rename and archive my
warehouses and their storage locations, so that the system's layout
matches my real building without needing a developer.

## Acceptance Criteria

- A new page (e.g. `/warehouses`) lists warehouses, and per warehouse its
  locations with their type (`storage` / `staging`).
- Create/rename warehouses and `storage` locations, gated by the same
  permission `STORY-036` introduces; nav link only shown to users who
  hold it.
- The automatic `staging` location of each warehouse is shown but cannot
  be deleted or retyped.
- **Error cases:**
  - Duplicate location name within one warehouse → inline error (backed
    by the `unique (warehouse_id, name)` constraint).
  - Archiving a location that still holds stock → blocked, with the
    items and quantities listed ("move this stock first").
  - Archiving the last warehouse of a tenant → blocked.

## Tasks
