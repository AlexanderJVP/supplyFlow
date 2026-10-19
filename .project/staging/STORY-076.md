---
id: STORY-076
title: Show the real reason when saving fails, not a guess
epic: EPIC-006-platform-hardening-observability
status: backlog
sprint: null
story_points: 2
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: []
---

## In gewone taal

Als het aanmaken van een artikel mislukt, zegt de app altijd "check that
the SKU is unique" — ook als de echte oorzaak iets heel anders is, zoals
geen verbinding met de server. Op 2026-10-19 zette dat de eigenaar op het
verkeerde spoor. Deze story laat de app de echte reden tonen, in gewone
woorden.

## User Story

As a user, I want error messages that say what actually went wrong, so
that I know whether to fix my input, retry, or ask for help.

## Acceptance Criteria

- **Found 2026-10-19:** the owner opened a Cloudflare preview URL, whose
  origin the API rejects (CORS 403); `ItemList.tsx` showed "Failed to
  create item — check that the SKU is unique." for that network failure.
- The server returns a recognisable code for a duplicate SKU (Postgres
  `23505` on `items (sku, tenant_id)` → HTTP 409 `{ code: 'duplicate_sku'
  }`) instead of a generic 500.
- The client distinguishes at least: duplicate SKU, no permission (403),
  validation error (400), cannot reach the server (network/CORS), and
  "something else went wrong".
- The same shared helper is used by the other create/edit forms (stock
  adjust, production order, BOM line, proposal, role, invite), so none of
  them guesses the cause either.
- Messages follow the UI language decision from `STORY-072`/`073` (English
  until decided).
