---
id: STORY-063
title: Role templates as a starting point for a customer's roles
epic: EPIC-012-onboarding
status: backlog
sprint: null
story_points: 2
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-004, STORY-061]
---

## In gewone taal

Een paar voorbeeldrollen (bv. Productie, Inkoop, Magazijn, Management)
die je bij een nieuwe klant met één klik kopieert en daarna aanpast aan
hoe dat bedrijf werkt. Het zijn startpunten, geen vaste standaard.

## User Story

As the platform owner onboarding a customer, I want to start a role from
a template and adjust it, so that I don't tick every permission from
scratch for every company.

## Acceptance Criteria

- A small set of platform-wide role templates (name + permission set),
  e.g. *Production*, *Purchasing*, *Warehouse*, *Management*,
  *Viewer*. Stored as data (a platform-level table or a versioned file in
  `packages/shared`), not hard-coded in the UI.
- In the Admin roles editor: "New role from template" copies a template's
  name and permissions into a **normal, independent tenant role** that
  can then be renamed and edited. Later template changes never alter
  roles already created from it.
- Templates are never assigned automatically to new tenants —
  `provision_tenant` still only creates the Admin role.
- **Error cases:** a role with the template's name already exists → the
  copy gets a suffix ("Production (2)") or the user renames it first; a
  template containing a permission key that no longer exists → that key
  is dropped with a warning, not copied.

## Tasks
