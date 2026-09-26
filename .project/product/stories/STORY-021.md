---
id: STORY-021
title: Generic audit_logs trigger on core business tables
epic: EPIC-006-platform-hardening-observability
status: done
sprint: null
story_points: 3
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: []
---

## User Story

As a compliance-conscious operator, I want every mutation on core
business tables logged automatically at the database level, so that
audit coverage can't be accidentally skipped by a forgotten application-
code call.

## Acceptance Criteria

- A single generic trigger (`log_audit_event`) is attached to `items`,
  `bom_lines`, `production_orders`, `proposals`, `roles`, and `profiles`.
- It replaced the previous manual `insert into audit_logs` calls scattered
  across RPCs, and closed a real gap where direct `items`/`bom_lines`
  writes were never audited before.
- `stock_ledger` and `proposal_reviews` are deliberately excluded (each is
  already its own append-only audit trail — a redundant `audit_logs` row
  would just double-book the same fact); `tenants`/`workflow_steps` are
  excluded as service-role-created, low-churn bootstrap config.

## Tasks
