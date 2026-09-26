---
id: STORY-047
title: Stock per location view & move-stock screen (UI)
epic: EPIC-009-multi-location-warehouse-ops
status: backlog
sprint: null
story_points: 3
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-037, STORY-038, STORY-046]
---

## In gewone taal

Zien hoeveel van een artikel op welke plek ligt, en voorraad van de ene
plek naar de andere verplaatsen met een paar klikken.

## User Story

As a warehouse operator, I want to see an item's stock broken down per
location and move stock between locations from the app, so that I can
find things and keep the system in line with where goods really are.

## Acceptance Criteria

- The inventory dashboard and item detail page can show stock per
  location (using `STORY-037`'s location-scoped view); staging stock is
  shown separately and not counted as available.
- A "Move stock" form: item, from-location, to-location, quantity,
  optional note → calls `move_stock` (`STORY-038`).
- Movement history shows the location for each entry.
- **Error cases:**
  - Quantity more than available at the source location → the form shows
    the available amount and blocks submit; a server-side rejection
    (someone else moved it first) is shown as a clear message, not a
    generic error.
  - Same source and destination → blocked.
  - Quantity zero or negative → blocked.

## Tasks
