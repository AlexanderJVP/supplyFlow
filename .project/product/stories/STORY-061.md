---
id: STORY-061
title: Enforce "view" permissions on the server for every page's data
epic: EPIC-001-auth-tenants-roles
status: backlog
sprint: sprint-2
story_points: 2
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies:
  - STORY-002
---
## In gewone taal

In de rollen kun je nu al "mag artikelen bekijken" afvinken, maar de
server controleert dat niet voor artikelen, stuklijsten en voorstellen.
Deze story zorgt dat die vinkjes echt werken, zodat wie iets niet mag
zien het ook niet kan opvragen.

## User Story

As a tenant admin, I want the "view" permissions I set on a role to be
enforced by the server, so that someone without access to a page can't
get its data some other way either.

## Acceptance Criteria

- `items.view` is required on every items `GET` route, and `bom.view` on
  every BOM `GET` route (`/tree`, `/lines`, and `STORY-056`'s
  `/where-used`) — today neither is checked. Inventory and production
  already enforce their `view` permission; leave them as they are.
- A new `proposals.view` permission is added to the permissions shape
  (`packages/shared` + `CLAUDE.md`) and required on the proposals `GET`
  routes.
- **Migration:** every existing role gets `proposals.view: true` (and
  keeps its current `items.view` / `bom.view` values), and every current
  holder's `app_metadata` is re-synced — so nobody loses access they
  have today. `provision_tenant`'s Admin role gets it too.
- **Robustness fix found while writing this story:** permission checks
  must not crash when a role's permission block is missing (e.g.
  `roles.ts`'s `GET /` reads `perms.admin.manage_users` directly and
  throws a `500` if `admin` is absent). Missing block = no permission →
  `403`.
- Integration test per route: user without the view permission → `403`;
  with it → `200`.
- **Scope decision (2026-09-26, product owner):** visibility is per
  *page*, not per *record* — whoever may see a page sees all of the
  company's data on it. Per-department or per-person data filters are
  out of scope.

## Tasks
