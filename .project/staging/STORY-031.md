---
id: STORY-031
title: Shared jobs table + generic Queue consumer scaffold
epic: EPIC-008-background-jobs-reservations
status: backlog
sprint: null
story_points: 5
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: []
---

## In gewone taal

Het gedeelde "wachtrij"-systeem bouwen waar alle achtergrondklussen gebruik van maken. Zelf heeft het nog geen zichtbare functie.

## User Story

As a developer, I want one shared background-job pattern (queue +
status table + output storage) that every async job type can plug into,
so that PDF generation, label printing (and later very large imports)
don't each need their own bespoke async plumbing.

## Acceptance Criteria

- A Cloudflare Queue and its consumer Worker binding are configured
  (per `ADR-001`).
- A Postgres `jobs` table exists (`id`, `tenant_id`, `type`, `status`,
  `result_url`, `error`, `created_by`, timestamps), RLS-scoped by tenant
  like every other table.
- The consumer Worker dispatches on `job.type` to the right handler, per
  message error handling (not whole-batch), and writes the job's
  `status`/`result_url`/`error` back to Postgres when done.
- Job output files are written to Cloudflare R2.
- A `GET /api/jobs/:id` endpoint lets the client poll status.
- Nothing job-type-specific lives here — this is the scaffold STORY-033
  and STORY-034 build on (and, later, very large imports beyond
  `STORY-032`'s direct-import limit).

## Tasks
