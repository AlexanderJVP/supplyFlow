---
id: STORY-055
title: Review a proposal in the app (readable change, history, next step)
epic: EPIC-005-workflow-proposals
status: backlog
sprint: null
story_points: 5
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-019]
---

## In gewone taal

Wie een voorstel moet beoordelen, ziet nu alleen de titel. Met deze story
opent hij het voorstel en ziet hij in gewone woorden wat er verandert,
waarom, wie er al naar gekeken heeft (met hun opmerkingen) en wie hierna
aan de beurt is. Zo kan hij beslissen zonder vergadering.

## User Story

As a reviewer (e.g. a production lead or supply manager), I want to open a
proposal and see exactly what it changes, why, what others already said,
and who decides after me, so that I can make a well-founded decision in
the app instead of in a meeting.

## Acceptance Criteria

- A proposal detail view (e.g. `/proposals/:id`), backed by a
  `GET /api/proposals/:id` endpoint returning the proposal, its reviews
  (reviewer name, action, notes, time) and its workflow position.
- **The change in plain words, not JSON.** For `bom_change`, each line is
  rendered with item names and SKUs, e.g.:
  - "Frame X: replace Screw A (4 pcs) → Phillips Screw B (4 pcs)"
    (a delete + create on the same parent is shown as one replacement);
  - "Frame X: Screw A quantity 4 → 6";
  - "Frame X: add Washer C (4 pcs)" / "remove Washer C".
- Title, description and author are shown.
- **Workflow position:** "step 2 of 3 — waiting for role *Supply*", plus
  which steps are done and by whom.
- Review actions (approve / reject / request changes) live on this view
  and **require a note for reject and request changes**, so the author
  knows why.
- Only a user whose role matches the current step sees the review buttons;
  others see "waiting for *role*" — no button that would fail with an
  error.
- **Error cases:**
  - An item referenced in the payload was archived or deleted since the
    proposal was made → shown with a warning ("Screw A no longer
    exists"), not a crash.
  - A BOM line the proposal wants to update/delete no longer exists →
    flagged per line; approving is blocked until the author updates the
    proposal (applying would otherwise fail or do something unexpected).
  - Proposal from another tenant → `404` (RLS).

## Tasks
