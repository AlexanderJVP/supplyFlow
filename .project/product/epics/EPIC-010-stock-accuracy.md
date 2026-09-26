---
id: EPIC-010-stock-accuracy
title: Stock Accuracy (reservations, concurrency, cycle counts)
status: backlog
---

## In gewone taal

Zorgen dat het voorraadgetal in het systeem klopt met wat er echt ligt. Dat
betekent: twee orders kunnen niet tegelijk hetzelfde onderdeel
"opmaken", je kunt voorraad vastzetten voor een order, en je kunt
regelmatig tellen en verschillen netjes laten verwerken.

## Doel

Keep the system's stock numbers trustworthy: no negative stock from
concurrent writes, reservations so planned work can't be starved by other
orders, and a proper cycle-count flow to reconcile system stock with what
is physically on the shelf. Split out of `EPIC-008` (2026-09-26), which
now only covers background jobs. Locking follows the advisory-lock
scheme from `ADR-002` (as amended in `ADR-001`).

## Stories

- STORY-043
- STORY-035
- STORY-052
- STORY-053
