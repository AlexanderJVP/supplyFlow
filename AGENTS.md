# AGENTS.md — Repo agent instructions

Purpose: give AI coding agents the minimal, actionable guidance needed to be productive in this repo.

Quick start
- Install: `pnpm install`
- Run dev (client + server): `pnpm run dev`
- Run server only: `pnpm --filter server run dev`
- Run tests: `pnpm run test`

Key sources
- Architecture & rules: see [claude.md](claude.md#L1)

Agent rules (short)
- Follow the Non‑Negotiable Security Rules in [claude.md](claude.md#L1). Do NOT use the Supabase service key for data queries.
- Prefer RPCs for multi-step DB mutations; changes touching data integrity must be implemented as PG functions and tested.
- Link rather than copy: reference existing docs (e.g., [claude.md](claude.md#L1)) instead of embedding large sections.
- Before changing architecture or core patterns, propose a short plan and get confirmation.
- Run `pnpm run test` and `pnpm run typecheck` locally before committing changes.
- Create changes on a feature branch named `ai/<short-descriptor>` and open a PR with a short summary and test evidence.

If missing context
- Ask one concise clarifying question (tenant, API contract, expected behavior) rather than guessing.

Suggested next customizations
- `create-skill test-runner` — a skill that runs `pnpm run test` and reports failures.
- `create-agent ci-helper` — helper agent that formats commits, runs tests, and opens PR drafts.

Last updated: 2026-06-08
