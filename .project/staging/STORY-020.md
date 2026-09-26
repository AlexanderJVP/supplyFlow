---
id: STORY-020
title: Structured item_change proposals (process_change parked)
epic: EPIC-005-workflow-proposals
status: backlog
sprint: null
story_points: 3
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-019, STORY-055]
---

> **Narrowed 2026-09-26.** Originally covered both `item_change` and
> `process_change`. `process_change` is **parked**: the system has no
> concept of production steps or work instructions, so there is nothing
> for such a proposal to change, and it applies nothing on approval
> today. Revisit only if routing/work instructions are ever added. It stays
> in the `proposal_type` enum (removing an enum value is a breaking
> migration and buys nothing now); the new-proposal form simply stops
> offering it.

## In gewone taal

Een voorstel om de gegevens van een artikel te wijzigen (bv. de naam, de
omschrijving of het bestelpunt), met een gewoon invulformulier in plaats
van technische code. Na goedkeuring wordt de wijziging automatisch
doorgevoerd, net zoals bij stuklijstwijzigingen.

## User Story

As a department lead, I want to propose a change to an item's details
through a normal form, and have it applied automatically once approved,
so that item changes go through the same fast, visible decision process
as BOM changes.

## Acceptance Criteria

- An `ItemChangePayloadSchema` in `packages/shared`: `item_id` plus the
  subset of `UpdateItemSchema` fields being changed (name, description,
  unit of measure, reorder point, reorder quantity once `STORY-054` adds
  it). SKU and item type are not changeable this way.
- The new-proposal form shows a structured editor for `item_change`:
  pick an item, edit fields, see before → after.
- On final approval, `review_proposal` applies it atomically via a new
  `apply_item_change_payload` RPC (same pattern as
  `apply_bom_change_payload`).
- `STORY-055`'s review view renders it as "Reorder point 50 → 80".
- `process_change` is removed from the new-proposal type picker;
  existing `process_change` proposals remain readable and reviewable.
- **Error cases:**
  - Item archived or deleted between proposal and approval → approval is
    blocked with a clear message; nothing applied.
  - A field changed directly by someone else since the proposal was
    made → the review view shows "current value differs from the
    proposal's 'before' value", so the reviewer decides knowingly.
  - Empty change (no fields differ) → can't be submitted.

## Tasks
