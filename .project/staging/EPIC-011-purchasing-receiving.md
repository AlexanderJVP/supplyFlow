---
id: EPIC-011-purchasing-receiving
title: Purchasing, Goods Receipt & Reorder Suggestions
status: backlog
---

## In gewone taal

Bijhouden bij welke leveranciers je koopt, bestellingen bij hen plaatsen,
en bij levering netjes ontvangen wat er echt binnenkomt (ook als het maar
een deel is). Daarbovenop stelt het systeem zelf voor wat je moet
bijbestellen, zodat je niet pas ingrijpt als iets al op is.

## Doel

Close the inbound half of stock management. Today stock only enters the
system through a manual adjustment with reason `received` — there are no
suppliers, no purchase orders, and no way to see what's already on order.
This epic adds suppliers, purchase orders, receiving against a purchase
order (including partial deliveries), and reorder suggestions that
combine current stock, open purchase orders, planned production demand
and the item's reorder point. All stock changes still go through
`stock_ledger` via RPCs (Non-Negotiable Rules 3 and 4).

## Stories

- STORY-049
- STORY-050
- STORY-051
- STORY-054
