---
id: STORY-060
title: Notify reviewers when a proposal is waiting for them
epic: EPIC-005-workflow-proposals
status: backlog
sprint: null
story_points: 3
priority: medium
origin: ai-generated
edited: false
generated_by: claude
dependencies: [STORY-055, STORY-058]
---

## In gewone taal

Snel beslissen lukt alleen als mensen weten dat er iets op hen wacht.
Deze story toont een teller "wacht op jou" in de app en stuurt een
e-mail wanneer een voorstel bij jouw rol aankomt, en aan de indiener
wanneer er beslist is.

## User Story

As a reviewer, I want to be told when a proposal reaches my step, and as
an author, when my proposal is decided, so that decisions don't stall
because nobody noticed.

## Acceptance Criteria

- In-app: the "Proposals" menu item shows a count of proposals waiting
  for the current user's role; the proposals list has a "Waiting for me"
  filter (default view for reviewers).
- E-mail: when a proposal enters a step, every active user with that
  step's role gets one e-mail with a link to the proposal (`STORY-055`);
  the author gets one when it is approved, rejected or sent back.
- E-mail sending happens after the database transaction commits and
  never makes a review fail (a failed e-mail is logged, not raised).
- Users can turn e-mail notifications off for themselves; in-app counts
  always stay on.
- No personal data beyond name and proposal title in e-mails; no tokens
  in links (Non-Negotiable Rule 10).
- **Error cases:** a step whose role has no active members → no e-mail,
  and the author sees "nobody can approve this step" on the proposal;
  e-mail provider down → proposal flow unaffected, failure logged.
- The e-mail provider is chosen at implementation time (e.g. Cloudflare
  Email Service or Supabase's mailer) — not decided by this story.

## Tasks
