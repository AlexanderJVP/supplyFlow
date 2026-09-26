---
id: STORY-067
title: Verify the July work against a live Supabase (integration tests)
epic: EPIC-007-deployment-cicd
status: backlog
sprint: sprint-1
story_points: 1
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: []
---
> Added 2026-09-26 after the `scrum-master-sprint-risk` review flagged it
> as invisible work: the stories finished in July (`STORY-013`, `019`,
> `022`, `026`, the FK-nullable migration) were only typechecked, never
> run against a real database.

## In gewone taal

Het werk van juli is nooit getest tegen een echte database, omdat Docker
niet aanstond. Deze story zet Docker aan en draait alle tests. Wat faalt,
wordt een nieuwe bugstory in plaats van stilletjes gerepareerd.

## User Story

As the product owner, I want the full test suite to run green against a
real local database, so that "done" on the board actually means the code
works, not just that it compiles.

## Acceptance Criteria

- Docker Desktop running; `pnpm run db:up` (and `pnpm run db:reset` so the
  new migration `20260718000004_profiles_fk_set_null.sql` is applied).
- `pnpm run typecheck` and `pnpm run test` both pass — including the
  modified `bom.test.ts` and `users.test.ts` and all 9 server integration
  test files.
- **Any failing test becomes its own `type: bug` story** (via `staging/`)
  with the failing output, instead of being fixed silently inside this
  story. This story is done when the suite has run and every failure is
  either fixed or tracked.
- Result (pass count, date) noted in `CLAUDE.md`'s Current Development
  Snapshot, replacing the "still unverified" remarks.
- Needs a machine with Docker Desktop — the product owner's own PC, not a
  sandboxed AI environment.

## Tasks
