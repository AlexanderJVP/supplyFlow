---
id: STORY-033
title: PDF generation as an async job
epic: EPIC-008-background-jobs-reservations
status: backlog
sprint: null
story_points: 3
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-031]
---

> **Open question (blocks Definition of Ready, not acceptance):** Which documents exactly? The story says "e.g. a production order or BOM report" — decide the concrete first document(s) and their content before this is sprint-ready.

## In gewone taal

Een PDF laten maken (bijvoorbeeld een productiebon) en een melding krijgen als hij klaar is om te downloaden.

## User Story

As a user, I want to request a PDF (e.g. a production order or BOM
report) and be notified when it's ready, so that generating it doesn't
block the page I requested it from.

## Acceptance Criteria

- Requesting a PDF enqueues a `pdf_export` job on the shared queue
  (STORY-031) and returns a job id immediately.
- The consumer renders the PDF and writes it to R2; the job record's
  `result_url` points at it once done.
- The client polls the job and offers a download link on completion.

## Tasks
