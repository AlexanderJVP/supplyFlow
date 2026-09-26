---
id: STORY-013
title: CSV export loading/error state
epic: EPIC-003-inventory-stock-ledger
status: done
sprint: null
story_points: 2
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-012]
---

## In gewone taal

De knop "Export CSV" toont "bezig…" terwijl hij werkt, en een duidelijke foutmelding als het misloopt. (Al gebouwd.)

## User Story

As an inventory manager, I want to see when a CSV export is in progress
or has failed, so that a failed download doesn't just silently do
nothing.

## Acceptance Criteria

- `downloadCsv()` (`client/src/hooks/useDownloadCsv.ts`) exposes a
  loading state while the request is in flight.
- A failed export (network error, non-2xx response) surfaces a visible
  error to the user instead of only logging to the browser console.
- Applies to both the inventory and production export buttons, since
  they share the same hook.

## Tasks
