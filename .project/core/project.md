---
project: supply
phase: 1
status: actief
started: 2026-08-01
---

# Project

Een lokaal, git-native project-OS waarin elke entiteit (epic, story, task) één
Markdown-bestand met frontmatter is als enige bron van waarheid. De app is een
visualisatielaag, geen database. AI schrijft nooit rechtstreeks naar de bron
van waarheid — enkel via `staging/` en menselijke goedkeuring.

Zie `vision.md` en `principles.md` voor de onderliggende ontwerpbeslissingen.

## Huidige fase

**Fase 1 — Fundament**

- [x] `core/`, `product/` (epics + stories), `scrum/` (DoD, DoR, backlog, sprints)
- [x] Kanban board (afgeleid uit story-status, geen aparte opslag)
- [x] `staging/`-mechanisme (ook zonder AI-knop al aanwezig)
- [x] Eerste epics en stories toevoegen
