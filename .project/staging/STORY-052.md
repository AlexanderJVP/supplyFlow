---
id: STORY-052
title: Cycle count sessions (create count list, enter counts)
epic: EPIC-010-stock-accuracy
status: backlog
sprint: null
story_points: 3
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-009]
---

## In gewone taal

Een "telronde" starten: je kiest welke artikelen je gaat tellen, loopt
langs de rekken en vult in hoeveel er echt ligt. Tijdens het tellen zie je
bewust níet wat het systeem denkt, zodat je echt telt en niet overneemt.

## User Story

As an inventory manager, I want to start a count for a selection of items
and let my team enter what they physically find, so that I can
regularly check the system's stock against reality without shutting
down the warehouse.

## Acceptance Criteria

- `stock_counts` (tenant-scoped, RLS): status enum `open`, `submitted`,
  `posted`, `cancelled`; created_by; started_at.
- `stock_count_lines`: `item_id`, `system_quantity_at_start` (snapshot),
  `counted_quantity` (nullable until entered), counted_by, counted_at;
  `unique (stock_count_id, item_id)`. (Location is added once `EPIC-009`
  lands.)
- Create a count from: selected items, all items not counted in the
  last N days (e.g. 90), or all items.
- Counting screen is **blind**: it shows item and unit, not the system
  quantity. Works on a phone-sized screen.
- `ledger_reason` gains `counted` here if `STORY-037` hasn't added it
  yet (same value, whichever ships first).
- New permissions: `inventory.count` (enter counts) and
  `inventory.approve_count` (used by `STORY-053`).
- **Error cases:**
  - Submitting with lines still empty → blocked, uncounted lines listed
    (or explicitly marked "skip").
  - Negative or non-numeric count → rejected.
  - An item already in another `open` count → warned, can't be in two
    open counts at once.
  - Stock moved for an item after the count started → flagged on that
    line so the manager knows the snapshot is outdated (handled at
    posting, `STORY-053`).

## Tasks
