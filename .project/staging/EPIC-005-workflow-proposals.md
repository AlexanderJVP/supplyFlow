---
id: EPIC-005-workflow-proposals
title: Workflow & Proposals
status: in-progress
---

## In gewone taal

Wie iets wil veranderen, bijvoorbeeld aan een stuklijst, dient een voorstel in. De juiste collega's keuren het in de juiste volgorde goed, en pas dan wordt het doorgevoerd.

## Doel

Departments propose changes (BOM edits, item changes, process changes)
that route through a per-tenant configurable approval chain
(`workflow_steps`) before taking effect. Approved `bom_change` proposals
are applied atomically via RPC. `bom_change` has a structured line-item
editor; `item_change`/`process_change` are still raw-JSON.

This epic is the heart of the product vision (see `CLAUDE.md` → Product
Vision): change proposals replace slow meetings. Still missing as of
2026-09-26: a review screen that shows what a proposal changes and its
impact (`STORY-055`, `STORY-057`), configurable multi-role approval chains
(`STORY-058`), replacing a part everywhere in one proposal (`STORY-059`),
and notifications (`STORY-060`).

## Stories

- STORY-017
- STORY-018
- STORY-019
- STORY-020
- STORY-055
- STORY-057
- STORY-058
- STORY-059
- STORY-060
