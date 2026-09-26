---
id: STORY-014
title: Atomic complete_production_order RPC
epic: EPIC-004-production-orders
status: done
sprint: null
story_points: 5
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-009, STORY-006]
---

## User Story

As a production planner, I want completing a production order to produce
the finished item and deduct every BOM component from stock in a single
atomic step, so that a failure partway through can never leave stock in
an inconsistent state.

## Acceptance Criteria

- `complete_production_order` is a single PostgreSQL function/transaction
  — never a sequence of separate application-code calls.
- It recursively resolves the full BOM requirement for the produced
  quantity and writes one stock-ledger entry per component consumed, plus
  one for the produced item.
- Verified end-to-end for a multi-level bolt → frame → bike BOM (both in
  integration tests and a live Docker Compose smoke test).

## Tasks
