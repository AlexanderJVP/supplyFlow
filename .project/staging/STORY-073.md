---
id: STORY-073
title: In-app user guide (handleiding)
epic: EPIC-012-onboarding
status: backlog
sprint: null
story_points: 5
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-072]
---

## In gewone taal

Een handleiding ín de app, zodat jij en je collega's (en later klanten)
zelf kunnen opzoeken hoe iets werkt: artikelen aanmaken, een stuklijst
opbouwen, voorraad boeken, een productieorder afronden, een voorstel
indienen en beoordelen, gebruikers en rollen beheren. In gewone taal, met
voorbeelden zoals bout → frame → fiets, en op elke pagina een knopje "?"
dat meteen naar het juiste stuk springt.

## User Story

As a user of the platform, I want a built-in guide that explains each
page and the common tasks step by step, so that I can work on my own
without asking the platform owner every time.

## Acceptance Criteria

- A "Handleiding" page (e.g. `/help`) reachable from the main menu for
  every signed-in user, regardless of role.
- Chapters, at minimum: getting started (sign in, the menu);
  items; bill of materials (the bout → frame → fiets example, what
  "direct components" means for production since `STORY-068`); stock
  (adjustments, history, reorder alerts, CSV export); production orders
  (create, start, complete, shortfalls and the "you can build N" hint);
  proposals (submit, review, what happens on approval); admin (invite
  users, roles and permissions).
- Each page in the app has a small "?" link that opens the matching
  chapter.
- Written in plain Dutch without jargon; any unavoidable term (BOM, SKU)
  is explained the first time it appears.
- The guide content lives as Markdown files in the client repo (e.g.
  `client/src/help/*.md`), so updating it is a normal code change; no
  CMS or external service.
- Only describes features that exist; a chapter for a later feature is
  added in that feature's story (add this to the Definition of Done as
  "guide updated if user-facing behaviour changed").
- Readable on a phone.

## Notes

- Depends on `STORY-072` so the BOM chapter describes the improved
  screens, not the current hidden ones.
- Same open question as `STORY-072`: if the app UI stays English, the
  guide must name buttons exactly as they appear on screen.
