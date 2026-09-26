---
id: EPIC-009-multi-location-warehouse-ops
title: Multi-Location Inventory & Warehouse Event Logging
status: backlog
---

## In gewone taal

Voorraad niet meer als één getal per bedrijf, maar per gebouw en per plek (rek, vak). Plus een aparte werkwijze om bestellingen te verzamelen, in te pakken en te verzenden.

## Doel

Extend inventory tracking beyond a single tenant-wide stock number to
real warehouses (buildings/sites) with locations (bins/zones) inside
them, richer stock event logging (`moved`, `counted`), and a fulfillment
order concept (picked/packed/shipped) distinct from production orders —
per `ADR-002`. Every tenant, new or existing, ends up with a guaranteed
default location (no permanent `NULL`-as-default convention). A
deliberate, confirmed scope expansion, not MVP.

## Stories

- STORY-036
- STORY-037
- STORY-038
- STORY-039
- STORY-040
- STORY-041
- STORY-042
- STORY-044
- STORY-045
- STORY-046
- STORY-047
