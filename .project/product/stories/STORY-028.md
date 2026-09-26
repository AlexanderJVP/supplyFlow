---
id: STORY-028
title: Create Cloudflare Pages project & set required secrets
epic: EPIC-007-deployment-cicd
status: backlog
sprint: sprint-1
story_points: 3
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies:
  - STORY-026
  - STORY-027
---
## In gewone taal

De echte accounts en geheime sleutels aanmaken bij Cloudflare, Supabase en GitHub. Dit kan alleen jij doen.

## User Story

As a developer, I want the actual Cloudflare Pages project and its
required GitHub Actions secrets in place, so that `deploy.yml` has
somewhere real to deploy to instead of failing on missing config.

## Acceptance Criteria

- The Cloudflare Pages project `manufacturing-platform-client` exists,
  matching `client/wrangler.toml`.
- GitHub Actions repo secrets are set: `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID` (already needed by the Worker step), plus
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`,
  `VITE_SENTRY_DSN` for the client build.
- The Worker's production secrets are confirmed set via
  `wrangler secret put` for `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
  `ADMIN_SECRET`, `ALLOWED_ORIGIN`, `ADMIN_ORIGIN` — with
  `ALLOWED_ORIGIN` pointing at the real `*.pages.dev` or custom domain
  once the Pages project exists.
- Needs real Cloudflare/Supabase account access — not achievable from a
  sandboxed coding environment alone.

## Tasks
