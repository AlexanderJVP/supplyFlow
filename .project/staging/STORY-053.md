---
id: STORY-053
title: Review & post count differences (with approval threshold)
epic: EPIC-010-stock-accuracy
status: backlog
sprint: null
story_points: 3
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-052, STORY-043]
---

## In gewone taal

Na het tellen toont het systeem per artikel het verschil tussen "wat we
dachten te hebben" en "wat er echt ligt". Kleine verschillen worden
meteen verwerkt, grote verschillen moet een verantwoordelijke eerst
goedkeuren.

## User Story

As an inventory manager, I want to review the differences found in a
count and post them to stock, with large differences needing approval,
so that the system matches reality and big discrepancies get a second
look instead of being silently written off.

## Acceptance Criteria

- A review screen per submitted count: item, system quantity, counted
  quantity, difference (units and %), and a flag when stock moved during
  the count.
- A tenant setting for the approval threshold (e.g. difference above X %
  or above Y units); lines above it need a user with
  `inventory.approve_count`.
- A `post_stock_count` RPC, one transaction:
  - per line, difference = counted quantity − **current** system
    quantity (not the start snapshot, so movements during the count are
    accounted for);
  - writes one `stock_ledger` row per non-zero difference, reason
    `counted`, `reference_type='stock_count'`;
  - sets the count to `posted`.
  - Uses the shared advisory-lock helper from `STORY-043` per item, so a
    concurrent production completion can't interleave.
- **Error cases:**
  - Posting while a line above the threshold is unapproved → rejected,
    those lines listed.
  - Posting a count twice → rejected (status check inside the RPC).
  - A difference that would make stock negative → impossible by
    construction (counted quantity is ≥ 0), but asserted in a test.
  - Cancelling a submitted count → allowed, nothing posted.

## Tasks
