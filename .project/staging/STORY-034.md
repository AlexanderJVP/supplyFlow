---
id: STORY-034
title: Label printing as an async job
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

> **Open question (blocks Definition of Ready, not acceptance):** Which labels exactly (item labels, production-order labels, location labels once `EPIC-009` exists), what's on them (SKU, name, barcode/QR?), and for which printer/format? Also confirm a label batch is really slow enough to need a background job — a small batch could be generated directly.

## In gewone taal

Labels voor artikelen of productie laten maken om te printen, zonder dat het scherm blijft hangen.

## User Story

As a warehouse operator, I want to request item/production labels and
have them generated in the background, so that printing a batch of
labels doesn't block the UI.

## Acceptance Criteria

- Requesting labels enqueues a `label_print` job on the shared queue
  (STORY-031) and returns a job id immediately.
- The consumer renders the label file(s) and writes them to R2; the job
  record's `result_url` points at it once done.
- The client polls the job and offers a download/print link on
  completion.

## Tasks
