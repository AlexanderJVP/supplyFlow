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
```

What's next
- Add packages: `client`, `server`, and `packages/shared` with their own `package.json` and scripts.
- Configure linters, formatters, and real `typecheck`/`test` scripts.
- Hook up CI to build and deploy (Cloudflare Workers + client hosting) once builds are implemented.

To ask the agent to scaffold the `client` and `server` packages, reply with "scaffold client and server".