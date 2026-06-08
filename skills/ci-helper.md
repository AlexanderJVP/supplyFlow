# ci-helper skill

Purpose
- Automate CI-like steps locally or in PR checks: install, typecheck, run tests, lint, and build.

When to use
- On every PR or before merging to `main`/`master`.

What the skill does
- Runs `pnpm install`.
- Runs `pnpm -w -r run typecheck`.
- Runs `pnpm -w -r run test`.
- Runs ESLint across workspace.
- Optionally runs builds for `client` and `server` packages.

Execution steps
1. Ensure `pnpm` is installed.
2. From workspace root run:

```powershell
pnpm install
pnpm -w -r run typecheck
pnpm -w -r run test
pnpm -w -r run lint || true
```

Notes
- The CI helper should not auto-fix failing tests or type errors; instead it returns a structured report of failures.
- Use this skill in combination with `test-runner` to extract failing tests and stack traces.

Last updated: 2026-06-08
