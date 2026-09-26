---
id: EPIC-008-background-jobs-reservations
title: Background Job Processing
status: backlog
---

## In gewone taal

Zware klussen, zoals PDF's maken, labels printen of later heel grote imports, laten gebeuren op de achtergrond, zodat je niet naar een draaiend wieltje moet kijken.

## Doel

Give the platform a consistent way to handle work that doesn't fit a
single stateless request: async output-producing jobs (PDF generation, label printing, and later
very large imports) via one shared Cloudflare Queue + Postgres
`jobs`-table pattern — per `ADR-001`. Stock reservations (`STORY-035`)
moved to `EPIC-010-stock-accuracy` on 2026-09-26: they are a
stock-correctness concern, unrelated to background jobs. CSV import
(`STORY-032`) moved to `EPIC-012-onboarding` the same day and now runs
directly for onboarding-sized files. Explicitly deferred to a later sprint,
not MVP (product decision, 2026-08-01).

## Stories

- STORY-031
- STORY-033
- STORY-034
