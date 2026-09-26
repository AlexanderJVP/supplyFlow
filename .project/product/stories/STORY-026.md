---
id: STORY-026
title: Client deploy target — Cloudflare Pages
epic: EPIC-007-deployment-cicd
status: done
sprint: null
story_points: 3
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: []
---

## User Story

As a developer, I want the client's deploy target decided and locally
verified to work, so that CI/CD has something real to build on instead
of an aspirational config that was never actually wired up.

## Acceptance Criteria

- `client/wrangler.toml` exists as a static SPA config (
  `pages_build_output_dir = "dist"`, same `account_id` as
  `server/wrangler.toml`, no Pages Functions/bindings).
- `wrangler` is a client devDependency.
- `pnpm --filter client run deploy` (`vite build && wrangler pages deploy
  dist --project-name=manufacturing-platform-client`) builds and deploys
  successfully when run locally.

## Tasks
