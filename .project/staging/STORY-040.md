---
id: STORY-040
title: Reconcile CLAUDE.md's "not a warehouse system" framing
epic: EPIC-009-multi-location-warehouse-ops
status: backlog
sprint: null
story_points: 1
priority: low
origin: ai-generated
edited: false
generated_by: claude
dependencies: []
---

## In gewone taal

De projectbeschrijving aanpassen zodra de magazijnfuncties echt af zijn. Alleen documentatie.

## User Story

As a developer reading `CLAUDE.md`, I want the product's opening
description to match what's actually shipped, so that the single source
of truth doesn't contradict real functionality once multi-location and
fulfillment ship.

## Acceptance Criteria

- `CLAUDE.md`'s opening framing ("This is not a warehouse system. It is a
  Manufacturing Operations Platform.") is revised to explicitly describe
  multi-location/multi-building inventory and fulfillment as in-scope,
  once `EPIC-009` has actually shipped — this is a docs-only change, done
  last, not speculatively ahead of the feature.
- The revision should still draw a clear line around what's *not*
  included (e.g. no wave planning, no pick-path optimization, no carrier
  integration) so scope doesn't silently balloon further than what was
  actually decided in `ADR-002`.

## Tasks
