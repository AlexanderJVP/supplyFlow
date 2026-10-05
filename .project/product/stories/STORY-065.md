---
id: STORY-065
title: Record opening stock when a customer starts
epic: EPIC-012-onboarding
status: backlog
sprint: null
story_points: 2
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-009, STORY-032]
---

## In gewone taal

Op de eerste dag moet het systeem weten wat er al op de plank ligt. Deze
story laat je die beginvoorraad in één keer invoeren (of inladen uit een
bestand), herkenbaar als "beginstand", zodat later niemand denkt dat het
een gewone correctie was.

## User Story

As the platform owner onboarding a customer, I want to enter each item's
starting quantity once, clearly marked as the opening balance, so that
stock is correct from day one and the history shows where the first
numbers came from.

## Acceptance Criteria

- An "Opening stock" screen (and a CSV mode reusing `STORY-032`'s
  import) that takes item + quantity per row.
- Written through one RPC, one transaction, as positive `stock_ledger`
  rows with reason `adjusted` and `reference_type='opening_balance'` —
  no new `ledger_reason` value (keeps the enum small, in line with
  `ADR-002`).
- Movement history shows these rows as "Opening balance".
- Gated by `inventory.adjust`.
- **Error cases:**
  - An item that already has stock movements → rejected for that row
    ("opening stock can only be set before the first movement"); later
    corrections go through normal adjustments or a count (`STORY-053`).
  - Negative quantity → rejected; zero → skipped.
  - Unknown SKU in CSV mode → reported per row; all-or-nothing like
    `STORY-032`.
  - Entering opening stock twice for the same item → the second time is
    rejected by the rule above.

## Tasks
