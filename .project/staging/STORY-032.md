---
id: STORY-032
title: CSV import of items, BOM lines (and opening stock)
epic: EPIC-012-onboarding
status: backlog
sprint: null
story_points: 5
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-005, STORY-006]
---

> **Changed 2026-09-26:** moved from `EPIC-008` (background jobs) to
> `EPIC-012-onboarding`, and no longer depends on the async job scaffold
> (`STORY-031`). Onboarding-sized files (up to ~10k rows) are imported
> directly in the request; moving very large imports onto the shared
> queue is a later follow-up once `STORY-031` exists, not a prerequisite.

## In gewone taal

Een Excel/CSV-bestand met artikelen of stuklijsten uploaden in plaats van
alles met de hand in te tikken. Het systeem controleert elke regel en
laadt alles in één keer in, of niets als er iets fout is, en zegt dan
per regel wat er mis was.

## User Story

As the platform owner onboarding a customer (or a production planner
later on), I want to upload a CSV of items and BOM lines, so that a
company's existing product data is in the system in minutes instead of
days of typing.

## Acceptance Criteria

- An import screen with a downloadable template per kind (items, BOM
  lines, and — for `STORY-065` — opening stock).
- **Two steps: check, then import.** Uploading first validates every row
  and shows a preview (how many rows will be created, per-row errors).
  Nothing is written until the user confirms.
- The import itself runs as one Postgres RPC in one transaction, writing
  through the same tables and triggers as the normal screens (so
  `prevent_bom_cycle`, `prevent_bom_cross_tenant`, RLS and audit logging
  all apply). Items are created before BOM lines, so one file can
  reference items created in the same import.
- Gated by `items.create` (items), `bom.edit` (BOM lines),
  `inventory.adjust` (opening stock).
- **Error cases:**
  - File isn't valid CSV, is empty, or misses required columns → rejected
    immediately with a clear message; nothing is written.
  - Invalid rows (unknown item type, negative quantity, non-numeric
    value, unknown child SKU in a BOM row) → reported per row with row
    number and reason.
  - Duplicate SKU (already in the catalog, or twice in the file) →
    reported per row; existing items are never silently overwritten.
  - BOM rows that would create a cycle → reported per row.
  - **All-or-nothing:** if any row fails, no rows are committed, so a
    half-imported catalog can't happen. (A "commit the valid rows anyway"
    option is a later decision, not this story.)
  - File larger than the limit (e.g. 5 MB / 10k rows) → rejected up front,
    with a hint to split it.

## Tasks
