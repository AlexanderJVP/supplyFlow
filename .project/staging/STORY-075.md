---
id: STORY-075
title: Database enforces role permissions and append-only tables (ADR-005)
epic: EPIC-006-platform-hardening-observability
status: backlog
sprint: null
story_points: 5
priority: high
type: security
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-074]
---

## In gewone taal

Vandaag controleert alleen onze server of je iets mag. Wie de database
rechtstreeks aanspreekt (de sleutel staat openbaar in de website), kan
binnen zijn eigen bedrijf langs die controle heen: voorraadregels wissen,
het logboek aanpassen, zichzelf goedkeurder maken of een
stuklijstwijziging doorvoeren zonder goedkeuring. Deze story laat de
database zelf de vinkjes van je rol controleren, en maakt de voorraadlijst
en het logboek echt "alleen toevoegen". Nodig vóór er een tweede bedrijf
op het platform komt.

## User Story

As the platform owner, I want the database itself to enforce each role's
permissions and the append-only rules, so that no user can bypass them by
calling the database directly instead of our API.

## Acceptance Criteria

- Implements the option chosen in `ADR-005` (recommended: writes only
  through permission-checking `security definer` RPCs; tables read-only
  for `authenticated`; nothing for `anon`).
- **Step 1 (can ship alone):** `anon` has no table or function rights;
  `stock_ledger`, `audit_logs`, `proposal_reviews` cannot be updated or
  deleted by `authenticated`; `audit_logs`, `profiles`, `roles`,
  `workflow_steps`, `tenants` cannot be written by `authenticated`;
  `apply_bom_change_payload`, `log_audit_event`, `lock_stock_keys`,
  `provision_tenant` are not executable by `authenticated`/`anon`.
- **Step 2:** every remaining write goes through an RPC that checks the
  caller's permission from Postgres (`profiles` → `roles.permissions`),
  takes the user and tenant from `auth.uid()` (no `p_user_id` /
  `p_tenant_id` parameters), and pins `search_path`.
- For each of the six bypasses listed in `ADR-005` an integration test
  calls PostgREST directly (as in `STORY-074`) and gets refused; the app's
  existing 85+ integration tests stay green.
- `CLAUDE.md` Security Rules 2, 4, 7 updated to match.

## Notes

Found 2026-10-19 while fixing `STORY-074`. Split into two stories at
sprint planning if 5 points is too much for one sprint (step 1 ≈ 2 pts).
