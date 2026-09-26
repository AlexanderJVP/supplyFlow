---
id: STORY-057
title: Show the impact of a proposal (affected products, stock, open orders)
epic: EPIC-005-workflow-proposals
status: backlog
sprint: null
story_points: 5
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-055, STORY-056]
---

## In gewone taal

Bij een voorstel "gebruik schroef B in plaats van schroef A" toont het
systeem meteen de gevolgen: welke producten verderop veranderen, of er
genoeg schroef B op voorraad is, en of lopende productieorders daardoor
vastlopen. Zo hoeft niemand dat eerst zelf uit te zoeken.

## User Story

As a reviewer, I want to see the consequences of a proposed change next to
the change itself, so that I don't approve something that silently breaks
production or leaves us without parts.

## Acceptance Criteria

- The proposal detail view (`STORY-055`) gets an "Impact" section,
  computed server-side by one Postgres function (no BOM recursion in
  application code), for `bom_change` proposals:
  - **Affected products:** every parent edited by the proposal plus all
    products above it (via `STORY-056`'s where-used).
  - **Stock:** for each item added or whose quantity rises — current
    stock, and whether it covers open production orders' needs after the
    change; for each removed item — current stock that would no longer
    be used (possible dead stock).
  - **Open production orders:** orders (`draft` / `in_progress`) for
    affected products, and for each whether it could still be built
    after the change (same logic as `can_produce`, run against the
    proposed BOM).
- Impact is calculated live when the proposal is opened (not stored), so
  it reflects today's stock, and is labelled with the time it was
  calculated.
- Informational only: impact never blocks approval by itself — the
  reviewer decides.
- **Built to be extended:** the impact response consists of separate,
  named sections (`affected_products`, `stock`, `production_orders`), each
  computed and rendered independently. A later section (e.g. `cost`) can
  be added without changing the existing ones or their consumers.
- **Out of scope: costs** (product-owner decision 2026-09-26). Items have
  no cost price yet, and a partial cost calculation is worse than none —
  a reviewer would trust it. Costs are never shown as `€0.00` or guessed;
  until cost data exists (see `product/roadmap.md`), the impact simply
  has no cost section.
- **Error cases:** a proposal whose referenced lines no longer exist (see
  `STORY-055`) shows impact for the valid parts and lists what couldn't
  be evaluated; a very large impact (e.g. hundreds of products) is
  summarised with counts plus an expandable list, not a page that hangs.

## Tasks
