---
id: STORY-068
title: 'Bug: completing an order consumes every BOM level instead of only the direct components'
epic: EPIC-004-production-orders
status: backlog
sprint: null
story_points: 3
priority: high
type: bug
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-043, STORY-015]
---

## In gewone taal

Als je 4 fietsen maakt, haalt het systeem nu 4 frames van de voorraad én
nog eens 16 bouten, terwijl die bouten al in de frames zitten die je
eerder gemaakt hebt. Je boutenvoorraad daalt dus dubbel. Na deze fix
verbruikt een productieorder alleen wat er rechtstreeks in gaat: voor een
fiets zijn dat frames. Ontbreken er frames, dan toont het systeem hoeveel
je er met je voorraad bouten zou kunnen maken.

## User Story

As a production planner, I want completing a production order to consume
only the components that go directly into the product, so that stock of
parts already built into my sub-assemblies isn't deducted a second time.

## Acceptance Criteria

- **The bug (found 2026-09-26 while building `STORY-043`):** `can_produce`
  walks the whole BOM recursively and `complete_production_order` consumes
  every item it returns. Building 4 bikes (bike → 1 frame → 4 bolts)
  deducts 4 frames **and** 16 bolts. The bolts were already consumed when
  the frames were produced, so bolt stock is double-counted. The existing
  regression test in `production.test.ts` asserts this wrong behaviour
  (`-16` bolts) and must be changed.
- **Product decision (2026-09-26):** every item is a real, stocked item
  (the "Russian doll" in `CLAUDE.md`): a sub-assembly is produced by its
  own production order and then sits in stock. Phantom sets that are
  looked *through* are a separate, opt-in feature (`STORY-069`).
- `can_produce` returns only the **direct** components of the item
  (quantity × order quantity), with available stock and shortfall.
- `complete_production_order` consumes only those direct components,
  still taking `STORY-043`'s stock locks (now on the direct components)
  before re-reading stock.
- **Hint for short sub-assemblies:** for each short component that has
  its own BOM, the can-produce response includes
  `buildable_from_stock` — how many of it could be built right now from
  *its* direct components' stock (one level down, not further). The UI
  shows e.g. "Frame: short 3 — you can build 250 from stock".
- Tests updated:
  - bike → frame → bolt, qty 4: completion deducts 4 frames, **no** bolts.
  - A frame shortfall is reported with the correct `buildable_from_stock`.
  - The `STORY-043` concurrency test still passes.
- **Consequence for later stories:** `STORY-054` (reorder suggestions)
  must calculate demand level by level, netting each sub-assembly's own
  stock before looking at its components (so bolts are only "needed" for
  frames you still have to build). Update its acceptance criteria when
  this story lands.
- **Error cases:**
  - An item with no BOM lines → `can_produce` returns an empty list and
    completion simply credits the product (unchanged behaviour).
  - A component that was archived after the order was created → still
    consumed (the BOM line exists); archiving doesn't silently change
    what an order uses.

## Tasks
