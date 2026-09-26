---
id: STORY-015
title: can_produce availability check
epic: EPIC-004-production-orders
status: done
sprint: null
story_points: 3
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-006, STORY-009]
---

## User Story

As a production planner, I want to check whether current stock can cover
a production run before I commit to it, so that I don't start a
production order I can't finish.

## Acceptance Criteria

- `can_produce(item_id, quantity, tenant_id)` recursively walks the BOM
  and returns, per required component, the required quantity, available
  stock, and shortfall.
- The RPC returns every required component with its `shortfall`
  (zero when stock covers it); the UI filters to the components with
  `shortfall > 0` to show what's missing. *(Corrected 2026-09-26: this
  criterion previously claimed the RPC itself returned only shortfalls,
  which never matched the code.)*
- The production order UI surfaces this check before order creation.

## Tasks
