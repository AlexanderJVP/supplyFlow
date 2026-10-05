---
id: STORY-070
title: Apply database migrations as part of the deploy (or block the deploy when they're missing)
epic: EPIC-007-deployment-cicd
status: backlog
sprint: null
story_points: 3
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-029]
---

## In gewone taal

Als we de opbouw van de database veranderen (een nieuwe tabel of kolom),
zet GitHub nu wel automatisch de nieuwe code online, maar níet de
database-aanpassing. Die moet iemand met de hand doen (`supabase db push`),
zoals op 2026-10-05 bij de eerste livegang. Vergeten we dat, dan draait er
nieuwe code tegen een oude database en gaan pagina's stuk. Na deze story
gebeurt het automatisch, of houdt GitHub het online zetten tegen tot de
database bijgewerkt is.

## User Story

As the platform owner, I want database migrations to reach production
together with the code that needs them, so that a deploy can never leave
new code running against an old schema.

## Acceptance Criteria

- **Found 2026-10-05 during `STORY-029`:** `deploy.yml` deploys the client
  and the Worker but never touches the production database; the 12
  migrations were applied by hand with `supabase link` + `supabase db push`.
- `deploy.yml` runs `supabase db push` against production **before** the
  Worker is published, using new repo secrets (`SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`), and stops the deploy if
  it fails. The seed (`supabase/seed.sql`) is never applied to production.
- If the owner prefers not to automate it: the workflow instead fails
  with a clear message when `supabase migration list --linked` shows a
  local migration that is missing remotely.
- The decision (automate vs. guard) and how to roll back a bad migration
  are written down in `CLAUDE.md`.
- Migrations must stay backwards compatible with the previous Worker
  version for the few seconds between the DB push and the Worker publish
  (add columns/tables first, remove old ones in a later release) — note
  this rule in `CLAUDE.md`.
