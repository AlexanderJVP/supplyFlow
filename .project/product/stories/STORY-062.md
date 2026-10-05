---
id: STORY-062
title: Menu and pages follow the user's permissions
epic: EPIC-001-auth-tenants-roles
status: backlog
sprint: sprint-2
story_points: 2
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies:
  - STORY-061
---
## In gewone taal

Iedereen ziet alleen de menuknoppen van pagina's die hij mag gebruiken,
zoals nu al bij Admin. Zo klikt niemand per ongeluk op een pagina die
niet voor hem bedoeld is, en ziet elke rol een rustig, eigen menu.

## User Story

As a user, I want to see only the pages my role gives me access to, so
that the app is simple for me and I can't wander into screens that
aren't meant for me.

## Acceptance Criteria

- Same pattern the Admin page already uses, applied to every page:
  - Menu: *Items* needs `items.view`, *Inventory* `inventory.view`,
    *Production* `production.view`, *Proposals* `proposals.view`
    (*Admin* stays as it is).
  - Opening a page's URL directly without permission shows a friendly
    "You don't have access to this page" message — not an empty page and
    not a raw error.
  - Buttons for actions the user can't perform (create, edit, archive,
    export, review …) are hidden rather than failing on click; audit the
    existing pages for any that aren't yet.
- After login (and for unknown URLs) the user lands on the first page
  they may see, instead of always `/items`; a user with no page at all
  sees a "no access yet — contact your administrator" message.
- The server-side checks from `STORY-061` remain the real protection;
  hiding is for clarity, not security.
- **Error cases:** permissions change while the user is logged in → the
  menu updates after the next token refresh (see `STORY-030`/`ADR-003`
  for making that prompt); a user whose role has no `permissions` object
  at all → treated as "no pages", not a crash.

## Tasks
