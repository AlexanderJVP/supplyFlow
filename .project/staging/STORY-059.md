---
id: STORY-059
title: Propose replacing a component everywhere it is used
epic: EPIC-005-workflow-proposals
status: backlog
sprint: null
story_points: 3
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-056, STORY-055]
---

## In gewone taal

Eén voorstel om schroef A overal te vervangen door schroef B, in alle
producten waar ze in zit (of in een selectie), in plaats van per product
een apart voorstel te moeten maken.

## User Story

As an engineer or supply manager, I want to propose replacing one
component with another across all (or selected) products that use it, as
a single proposal, so that a company-wide part change is decided once
instead of product by product.

## Acceptance Criteria

- A "Replace component" mode in the new-proposal form: pick the current
  item, the replacement item, and — using `STORY-056`'s where-used — tick
  which direct parents it applies to (default: all).
- Quantity per parent is kept by default and can be overridden per
  parent.
- Produces a normal `bom_change` payload (its schema already supports
  lines on several parents): per ticked parent, one delete of the old
  line and one create of the new line. No new proposal type, no new
  apply logic — `apply_bom_change_payload` applies it atomically as
  today.
- `STORY-055` renders it as one readable list of replacements; `STORY-057`
  shows the combined impact.
- **Error cases:**
  - Replacement item already present on a ticked parent → that parent is
    flagged; the user chooses "add quantities together" or "skip this
    parent" (no silent duplicate — `bom_lines` has a unique constraint).
  - Replacement would create a cycle (e.g. replacing with an assembly
    that contains the parent) → rejected up front by the same check as
    `prevent_bom_cycle`, per parent, with a clear message.
  - Replacement item archived, or the same as the current item →
    rejected.
  - Replacement item has a different unit of measure → warning shown.

## Tasks
