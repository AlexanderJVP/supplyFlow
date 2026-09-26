---
id: STORY-023
title: Security headers, strict CSP & CORS allowlist
epic: EPIC-006-platform-hardening-observability
status: done
sprint: null
story_points: 2
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: []
---

## User Story

As a security-conscious operator, I want strict security headers and a
non-wildcard CORS allowlist applied globally, so that the API isn't
exposed to unnecessary browser-side attack surface.

## Acceptance Criteria

- `securityHeaders.ts` sets a maximally strict CSP (JSON-only API),
  `X-Frame-Options`, `X-Content-Type-Options`, HSTS, and `Referrer-Policy`
  globally, applied ahead of CORS.
- CORS allows only `[APP_ORIGIN, ADMIN_ORIGIN]` — no wildcard — and
  rejects unknown origins with 403.
- Any new custom response header (e.g. `X-Next-Cursor`) is added to
  `Access-Control-Expose-Headers`, or browsers silently strip it
  client-side.

## Tasks
