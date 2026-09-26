---
id: STORY-045
title: Pack & ship a fulfillment order
epic: EPIC-009-multi-location-warehouse-ops
status: backlog
sprint: null
story_points: 2
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-044]
---

## In gewone taal

"Inpakken" noteert alleen dat de doos klaar is (aantal dozen,
trackingnummer). "Verzenden" is het moment dat de spullen echt het bedrijf
verlaten: dan gaan ze van de voorraad af.

## User Story

As a warehouse operator, I want to record that an order is packed and
then shipped, so that stock only leaves the books at the moment goods
actually leave the building.

## Acceptance Criteria

- **Pack:** `picked` → `packed`, storing box count and an optional
  tracking reference. **No `stock_ledger` entry** (nothing physically
  moves).
- **Ship:** `packed` → `shipped`, writing one negative `stock_ledger` row
  per line with the existing `shipped` reason, at the staging location,
  `reference_type='fulfillment_order'` — one RPC, one transaction.
- **Error cases:**
  - Packing an order that isn't `picked`, or shipping one that isn't
    `packed` → rejected (no skipping steps).
  - Shipping twice → rejected; no double deduction.
  - Staging location no longer holds the picked quantity (e.g. someone
    moved it manually) → shipping is rejected with the missing lines;
    nothing is deducted.

## Tasks
