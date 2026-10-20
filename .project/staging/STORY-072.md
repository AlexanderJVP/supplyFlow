---
id: STORY-072
title: Make the BOM easy to find and understand on every item
epic: EPIC-002-item-catalog-bom
status: backlog
sprint: null
story_points: 3
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-007]
---

## In gewone taal

Op 2026-10-05 maakte je een bout, een frame en een fiets, maar je vond
niet waar je zegt dat een frame uit 4 bouten bestaat. Dat zit nu verstopt
onderaan de detailpagina, die je alleen bereikt door op de artikelcode
te klikken, onder de Engelse vakterm "BOM tree". Na deze story zie je bij
elk artikel meteen een duidelijk blok "Bestaat uit", kun je vanuit de
lijst met één klik naar de stuklijst, en zegt de app zelf wat je moet doen
als een artikel nog geen onderdelen heeft.

## User Story

As someone setting up products, I want to see and fill in what an item is
made of right where I'd expect it, so that I can build multi-level
products without having to know where the BOM is hidden.

## Acceptance Criteria

- **Found 2026-10-05 by the product owner:** the BOM add-form only exists
  at the bottom of `ItemDetail.tsx` (via `BomTreeViewer`), reachable only
  by clicking the SKU in `ItemList.tsx`; it's labelled "BOM tree" /
  "Add component…" with no explanation.
- In the item list, the item **name** links to the detail page too (not
  only the SKU), and each row has a visible "Stuklijst" / "BOM" action.
- On the detail page the BOM section is near the top, titled in plain
  words (e.g. "Bestaat uit" — wording follows the app-language decision,
  see Notes), with a one-line explanation.
- Empty state: an item without BOM lines shows "Dit artikel heeft nog
  geen onderdelen" plus the add form (for users with `bom.edit`) or a
  short "Je hebt geen recht om de stuklijst te wijzigen" (without it).
- The add form has labels for both fields ("Onderdeel", "Aantal per
  stuk") and shows the unit of measure next to the quantity.
- After adding a line the tree updates immediately and the form resets.
- Where a line can't be changed directly (edit/remove goes through a
  `bom_change` proposal), the page says so and links to Proposals.
- Works the same for every item type — no special-casing of
  `component` / `sub_assembly` / `finished_good` (product vision rule 1).

## Notes

- The whole UI is in English today while the owner and their users work
  in Dutch. Whether the app becomes Dutch (or bilingual) is a separate
  decision — raise it with the owner before writing new labels.
