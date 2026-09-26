---
id: STORY-027
title: CI/CD deploy workflow builds client with production env vars
epic: EPIC-007-deployment-cicd
status: done
sprint: sprint-1
story_points: 3
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies:
  - STORY-026
---
## In gewone taal

Elke keer dat er nieuwe code op GitHub komt, moet de app vanzelf gebouwd,
getest en online gezet worden. Dat is ingesteld, maar het heeft nog nooit
één keer echt gewerkt: de code staat nog niet op GitHub en er zaten fouten
in de instellingen.

## User Story

As a developer, I want `deploy.yml` to actually fire on this repo's real
branch and inject production env vars into the client build, so that a
push to the main branch produces a working deployed build instead of
silently doing nothing or shipping a client pointed at dev config.

## Acceptance Criteria

- `deploy.yml` triggers on `[main, master]` (this repo's actual branch is
  `master`; the workflow previously only listened for `main` and had
  never fired).
- The client build step injects `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, and `VITE_SENTRY_DSN` from
  GitHub Actions secrets.
- The client deploy step uses `wrangler pages deploy` (replacing the old
  GitHub Pages step), gated on `CLOUDFLARE_API_TOKEN` being set — the
  same conditional pattern as the existing Worker deploy step.
- **Added 2026-09-26 — the workflow must actually run green at least
  once.** It never has so far:
  - Fixed 2026-09-26: `secrets` can't be referenced in a step-level
    `if:`; both deploy steps now gate on a job-level
    `HAS_CLOUDFLARE_TOKEN` env var instead.
  - Fixed 2026-09-26 (commit `c62193a`): `actions/setup-node` ran with
    `cache: 'pnpm'` *before* pnpm was installed (both `deploy.yml` and
    `ci.yml`); pnpm is now installed first via `pnpm/action-setup`. Same
    commit bumps both workflows from Node 18 to 22, since wrangler 4
    requires Node >= 22.
  - **Push the local commits to GitHub** (`master` was 18 commits ahead
    of `origin/master` on 2026-09-26). Until this happens nothing runs on
    GitHub at all, so this story can't finish. Pushing is the product
    owner's explicit call — never done implicitly.
  - Done when a push to `master` produces a green `Deploy` run (the
    deploy steps may still be skipped until `STORY-028` provides the
    secrets — but the workflow itself must not error).
  - **Done 2026-09-26:** all local commits pushed (`2a102ce..49be0fd`);
    `Deploy` run `36265866587` green in 43s (client + server build OK,
    both deploy steps skipped as expected without `CLOUDFLARE_API_TOKEN`),
    and `CI` run `36265866576` green. Actual deploying is verified by
    `STORY-028`/`STORY-029`.

## Tasks
