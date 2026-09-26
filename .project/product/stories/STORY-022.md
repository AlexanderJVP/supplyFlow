---
id: STORY-022
title: Rate limiting on registration & user invite
epic: EPIC-006-platform-hardening-observability
status: done
sprint: null
story_points: 2
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-001, STORY-004]
---

## User Story

As a platform operator, I want the endpoints that create tenants and send
invite emails to be rate-limited per IP, so that they can't be abused to
spam-provision tenants or spam invite emails.

## Acceptance Criteria

- `POST /api/admin/tenants` is limited to 3 requests/IP/hour.
- `POST /api/users/invite` is limited to 10 requests/IP/hour (same abuse
  shape — it sends a real email per call).
- Both use the shared `rateLimit()` middleware (in-memory fixed-window).
- Login is explicitly *not* rate-limited server-side, since it never
  reaches our server — the client calls
  `supabase.auth.signInWithPassword` directly, so GoTrue's own limits
  protect it (documented in Non-Negotiable Security Rule 6).

## Tasks
