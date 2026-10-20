---
id: STORY-074
title: current_stock view must respect tenant isolation (security_invoker)
epic: EPIC-006-platform-hardening-observability
status: in-progress
sprint: sprint-2
story_points: 1
priority: critical
type: bug
origin: ai-generated
edited: false
generated_by: claude
dependencies: []
---

## In gewone taal

Supabase waarschuwde dat de voorraad-view (`current_stock`, die per artikel
de voorraad optelt) de bedrijfsafscheiding omzeilde. Iedereen met de
publieke sleutel uit de website kon zo, zonder in te loggen, de
voorraadaantallen van **alle** bedrijven opvragen — rechtstreeks bij de
database, buiten onze server om. Onze eigen app lekte niets, want die
filtert altijd op het eigen bedrijf. Deze story dicht het lek.

## User Story

As the platform owner, I want every database view to apply the same
tenant isolation as the tables behind it, so that no company's data can be
read by another company or by anyone without a login.

## Acceptance Criteria

- **Found 2026-10-19** via the Supabase security advisor: "View
  public.current_stock is defined with the SECURITY DEFINER property".
  The initial migration grants `select` on all public tables/views to
  `anon` and `authenticated`, so the view was readable cross-tenant and
  unauthenticated via `/rest/v1/current_stock`.
- `current_stock` runs with `security_invoker = true` (migration
  `20261020000000_current_stock_security_invoker.sql`), so
  `stock_ledger`'s `tenant_isolation_stock_ledger` policy applies.
- Integration test reads the view directly via PostgREST (not through our
  API): another tenant's user sees none of tenant A's rows, an anonymous
  caller sees no rows, tenant A sees its own row.
- `CLAUDE.md` security rules: every view is created with
  `security_invoker = true`.
- Migration applied to production (`pnpm dlx supabase db push`) **before**
  merge; the Supabase advisor warning is gone afterwards. **Done
  2026-10-20** (PR #9, `cda6299`): pushed to production, owner confirmed
  the warning is gone.

## Notes

The broader issue found alongside this — RLS only checks the tenant, not
the role's permissions, so a logged-in user can bypass permission checks
and the ledger's append-only rule by calling PostgREST directly — is
`STORY-075` / `ADR-005`.
