---
id: STORY-064
title: Onboarding checklist per customer
epic: EPIC-012-onboarding
status: backlog
sprint: null
story_points: 2
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-063, STORY-032, STORY-065, STORY-058]
---

## In gewone taal

Een lijstje op de Admin-pagina dat toont hoe ver de opstart van een
bedrijf is: rollen gemaakt, gebruikers uitgenodigd, artikelen en
stuklijsten ingeladen, beginvoorraad ingevoerd, goedkeuringsketen
ingesteld. Zo zie je in één oogopslag wat nog ontbreekt.

## User Story

As the platform owner (or the customer's admin), I want a checklist that
shows which setup steps are done for this company, so that onboarding is
complete and nothing is forgotten before people start using it.

## Acceptance Criteria

- An "Getting started" panel on the Admin page, computed live from the
  tenant's data (nothing stored):
  - roles besides Admin exist;
  - at least one user besides the admin/support accounts is invited;
  - items exist; at least one BOM exists;
  - opening stock is recorded (`STORY-065`);
  - every proposal type has an approval chain that isn't just the
    default single Admin step (`STORY-058`).
- Each item links to the screen where it's done.
- The panel can be hidden once everything is done.
- Visible only with an `admin.*` permission.
- **Error cases:** none beyond permission checks — the checklist only
  reads; an unreadable section (e.g. missing permission for one domain)
  shows "unknown", not an error.

## Tasks
