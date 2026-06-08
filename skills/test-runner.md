# test-runner skill

Purpose
- Instruct AI agents how to run the project's test suite and report failures concisely.

When to use
- Run before committing or opening a PR.
- Use in CI simulation steps executed locally by an agent.

What the skill does
- Runs the repository test command: `pnpm run test`.
- Captures exit code and stderr/stdout.
- Parses common JavaScript/TypeScript test output (Jest, Vitest, or other runner) for failing tests and stack traces.
- Returns a short summary: pass/fail, number of tests passed/failed, failing test names, and first relevant stack frames.

How agents should execute
1. Open a terminal in the workspace root.
2. Run the tests synchronously and capture output.

Example commands

```powershell
pnpm install
pnpm run typecheck
pnpm run test
```

Expected output format (from the skill)
- `status`: `passed` | `failed` | `errored`
- `summary`: short human-friendly text
- `failures`: array of { `test`: string, `message`: string, `stack`: string }

Notes / constraints
- Do not attempt to fix failing tests automatically. Provide the failing test names and stack frames and ask for permission before changing code.
- If `pnpm` is missing, report that to the user and suggest installing Node.js + pnpm.

Last updated: 2026-06-08
