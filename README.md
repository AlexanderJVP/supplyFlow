Manufacturing Platform — repo scaffold

This repository contains the architectural spec and initial scaffolding for the Manufacturing Operations Platform.

Key docs
- Architecture & rules: `claude.md`
- Agent guidance: `AGENTS.md`

Quick commands

```powershell
pnpm install
pnpm run dev
pnpm run typecheck
pnpm run test
pnpm --filter server run dev
pnpm --filter server run deploy
pnpm run docker:up
pnpm run docker:down
pnpm run db:up
pnpm run db:down
pnpm run db:reset
```

Docker

- Use two containers for local work: `server` for the Worker API and `client` for the Vite app.
- The API container runs Wrangler locally; that matches this repo better than a generic Node API container.
- Supabase runs separately with `pnpm run db:up`; that starts the local database, auth, storage, and Studio stack used for testing.
- After starting compose, open the app at `http://localhost:5173` and the API at `http://localhost:8787`.

Supabase local DB

- Start the Supabase Docker stack with `pnpm run db:up`.
- Reset the local schema and seed data with `pnpm run db:reset`.
- The local Supabase API runs on `http://127.0.0.1:54321` and Studio on `http://127.0.0.1:54323`.
- The first migration lives in [supabase/migrations/20260716000000_initial.sql](supabase/migrations/20260716000000_initial.sql).
- Put local Worker secrets in `server/.dev.vars` using the template in [server/.dev.vars.example](server/.dev.vars.example).
- Use the publishable and secret keys reported by `pnpm run db:status` for local Supabase access.
- For this repo, the local config is intentionally split: Docker Compose handles app containers, and the Supabase CLI handles the database stack.

Cloudflare setup

- The server Worker is configured in `server/wrangler.toml`.
- Keep Supabase and Cloudflare secrets out of the repo. Put local values in `server/.dev.vars` and CI values in GitHub Actions secrets.
- To connect Wrangler locally, run `pnpm --filter server run dev` after authenticating Wrangler on your machine.
- The first server endpoint is `GET /api/health` and should return `{ "ok": true, "service": "manufacturing-platform-server" }`.

What's next
- Wire the Worker routes to Supabase-backed data access.
- Add real unit tests for client and server.
- Finish deployment workflows for Cloudflare and client hosting.
- Add branch protection rules before opening the PR.

To ask the agent to scaffold the `client` and `server` packages, reply with "scaffold client and server".



