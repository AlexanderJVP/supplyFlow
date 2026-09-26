---
id: STORY-069
title: Phantom items (sets) — a named group of parts that is never stocked
epic: EPIC-002-item-catalog-bom
status: backlog
sprint: null
story_points: 3
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-068]
---

## In gewone taal

Een "set" is alleen een naam voor een groepje bestaande onderdelen,
bijvoorbeeld "bevestigingsset" = 4 bouten + 4 moeren + 4 ringen. Je maakt
de set nooit apart en ze ligt nooit als geheel op de plank; je gebruikt
ze zodat je niet in elk product dezelfde regels opnieuw moet invoeren.
Bouw je een fiets met "1 bevestigingsset", dan boekt het systeem meteen de
bouten, moeren en ringen af. Wijzig je de set (bv. een andere bout), dan
geldt dat voor alle producten die ze gebruiken.

## User Story

As a production planner, I want to mark an item as a set (phantom) that
only groups other parts, so that I can reuse common part groups across
products without having to build or stock the group itself.

## Acceptance Criteria

- `items.is_phantom boolean not null default false`, editable on the item
  page ("This is a set, not a product"), with a *Set* badge in item
  lists and BOM trees.
- In `can_produce` and `complete_production_order` (after `STORY-068`):
  when a direct component is a phantom, it is replaced by *its* direct
  components (quantities multiplied), repeatedly for sets inside sets,
  stopping at the first non-phantom item on each branch. Locks from
  `STORY-043` are taken on the resulting real items.
- A phantom item never holds stock:
  - manual stock adjustments on it are rejected;
  - a production order for a phantom item is rejected;
  - it is excluded from stock lists, alerts and exports.
- Changing a set's BOM through a `bom_change` proposal works as for any
  item, so "use a Phillips bolt in the fastening set" changes every
  product that uses the set (fits `STORY-055`–`STORY-059`).
- **Error cases:**
  - Marking an item as a set while it has stock, ledger history, or open
    production orders → blocked, with the reason.
  - A set with no BOM lines used as a component → warning in the BOM
    editor; completing an order through it consumes nothing for that
    line (and says so), rather than failing silently.
  - Un-marking a set → allowed; from then on it behaves as a normal
    stocked item (starting at zero stock).

## Tasks
