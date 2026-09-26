---
id: STORY-058
title: Configure approval chains per company (who approves what, in which order)
epic: EPIC-005-workflow-proposals
status: backlog
sprint: null
story_points: 5
priority: high
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-017]
---

## In gewone taal

Per bedrijf instellen wie een voorstel moet goedkeuren en in welke
volgorde, bijvoorbeeld eerst Productie, dan Inkoop, dan Management. Nu
keurt altijd alleen de Admin goed. Dit stel je typisch in tijdens de
onboarding bij een klant.

## User Story

As a tenant admin (or the platform owner during onboarding), I want to
define per proposal type which roles approve it and in what order, so
that each company's real decision process is reflected in the app.

## Acceptance Criteria

- API: list / replace the ordered steps for a proposal type
  (`workflow_steps`), gated by `admin.manage_workflow` (the permission
  already exists but nothing uses it yet). Replacing a chain is one
  atomic RPC (delete + insert in one transaction).
- UI: an "Approval chains" section on the Admin page — per proposal type,
  an ordered list of roles with add / remove / move up-down. Only shown to
  users with `admin.manage_workflow`.
- A chain has at least one step; the same role may not appear twice in
  one chain.
- `workflow_steps` gets the `log_audit_event` trigger (it's now
  user-edited, no longer only bootstrap config).
  - **This changes Non-Negotiable Security Rule 8 in `CLAUDE.md`**, which
    currently lists `workflow_steps` as deliberately excluded from
    auditing ("service-role-created bootstrapping config"). Update rule 8
    (and the audit bullet in *Current Development Snapshot*) in the same
    change, so the doc and the triggers don't disagree.
- **Behaviour decisions (explicit):**
  - **In-flight proposals keep the chain they started with.** On submit,
    the proposal records a snapshot of its chain (e.g. a
    `proposal_workflow_steps` copy or a JSON snapshot); `review_proposal`
    walks that snapshot. Changing a chain only affects proposals
    submitted afterwards.
  - **Resubmitting after "request changes" restarts the chain at step 1.**
    Today `review_proposal` counts *all* earlier approvals, so a changed
    proposal skips reviewers who already approved the old version — that
    is a bug for this product's purpose (people would approve something
    they never saw). Only approvals since the latest submit count.
- **Error cases:**
  - Deleting a role that is used in a chain → blocked, listing the
    chains.
  - A chain step whose role has no members → warning in the UI ("nobody
    can approve this step").
  - Saving an empty chain → rejected.

## Tasks
