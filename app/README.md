# Scrum app

Local visualization layer described in `.project/docs/architectuurplan-v2.md`.
It is deliberately split in three layers so the UI never touches files
directly:

```
web/     vanilla HTML/CSS/JS — calls ONLY the server's /api/* endpoints
server/  thin Express wrapper — routing + error handling only
engine/  pure Node functions  — reads/writes .project markdown+frontmatter,
                                 computes the board. No HTTP, no Electron,
                                 no UI dependency, so a real remote server
                                 (or an Electron main process) can reuse it
                                 unchanged later.
```

## Run it

```
cd app
npm install
npm start
```

Then open http://localhost:3456 — you'll see the kanban board (columns from
`.project/scrum/views/kanban-board.md`, cards derived from every story's
`status` field in `.project/product/stories/*.md`). Click a card to edit its
title, status, priority, story points, epic, sprint and body; saving writes
straight back to the `.md` file. Drag a card to another column to change its
status without opening the edit form.

The "Epics" section lists every epic in `.project/product/epics/`, with a
live count of how many stories point at it. Click "+ Nieuwe epic" to create
one, or click an existing epic to edit its title/status/description. An
epic's `id` doubles as its filename (e.g. `EPIC-002-billing`) and never
changes after creation — that's what stories' `epic:` field points at, so
renaming a title later won't break that link.

Open a story and you'll see a "Taken" (tasks) section at the bottom of the
edit form — the Epic -> Story -> Task level from the architecture plan.
Click "+ Taak" to add one, or click an existing task to edit its title,
status, type (task/bug), and git commit hash. Tasks live in
`.project/execution/tasks/TASK-XXX.md` and link back to their story via a
`story:` field; creating or reassigning a task to a story that doesn't
exist is rejected with a clear error rather than silently creating a
dangling reference.

Above the board, the filter bar lets you search by title/id and narrow the
board down by epic, priority, or sprint (the sprint dropdown only lists
sprints that actually appear on a story right now). Filters combine with
AND logic and only affect what's *shown* — WIP limits are still checked
against the real, unfiltered card count, so a column can't look "under
limit" just because a filter is hiding some of its cards. Column headings
show "shown van totaal" while a filter is active.

The "Sprints" section lists every sprint in `.project/scrum/sprints/`
(retro files like `sprint-1-retro.md` are a different entity and excluded),
with live totals: combined story points of every story whose `sprint:`
field points at it, versus that sprint's capacity. A sprint card turns red
and says "overcommitted" when the total exceeds capacity — but only once
you've actually set a capacity above 0; a capacity of 0 means "not set
yet" and never triggers the warning. Click "+ Nieuwe sprint" to create one
or click an existing sprint to edit its dates/status/capacity. There's
deliberately no "add story to sprint" control here — that would be a
second place recording the same fact as the story's own `sprint:` field
(architecture plan §2 rules that out). To move a story into a sprint, set
its Sprint field in the story's own edit form; the sprint view picks it up
automatically since the total is always computed fresh, never stored.

A story's edit form now also has an "Afhankelijk van" field — a
comma-separated list of story ids it depends on, stored in that story's
own `dependencies:` field (nothing new to store; that field already
existed in the format, it just wasn't editable from the app yet). The
"Afhankelijkheden" section further down surfaces what those add up to
across the whole project: circular dependencies (A needs B needs A, which
can never be resolved one at a time), references to a story id that
doesn't actually exist, and stories that are blocked because something
they depend on isn't done. Like the board, none of this is stored — it's
recomputed from the story files every time you refresh.

The "Engineering" section is read-only: it shows `.project/engineering/architecture.md`
(the technical write-up of this app itself — deliberately separate from
`docs/architectuurplan-v2.md`, which is the product plan, not the
implementation) and every Architecture Decision Record under
`engineering/decisions/`. Click an ADR to expand its full body inline.
There's no create/edit UI for these on purpose — they're meant to be
considered write-ups, not something to dash off through quick form
fields.

The "Analytics" section shows a simple velocity view: for every sprint,
how many story points were committed (every story whose `sprint` field
points at it) versus how many actually finished (`status: done`), as a
bar per sprint plus an average across completed sprints once there are
at least two of them ("not enough sprint history yet" otherwise). Like
the board, this is always recomputed fresh from the sprint + story files
— nothing new is stored to produce it. "Momentopname opslaan" is
optional: it writes the current numbers to `.project/analytics/velocity.json`
as a timestamped, git-friendly export. That file is explicitly derived
data, never source of truth — nothing in the app reads from it, and
deleting it loses nothing, since the same numbers can be recomputed from
the sprint/story files at any time; it exists only for anyone who wants a
historical record even if sprint data changes shape later.

The "History" section is append-only: "Milestones" and "Lessons Learned"
each show a running log (newest first) read from
`.project/history/milestones.md` and `.project/history/lessons-learned.md`.
Use the small form under each list to add an entry (a title, plus an
optional description) — it's appended as a new `## YYYY-MM-DD — Title`
section rather than overwriting anything, so the files stay a permanent,
readable record. There's no edit or delete here on purpose, matching how a
changelog works elsewhere: you add to history, you don't rewrite it.

By default it reads `../.project` relative to this folder (i.e.
`scrum/.project`). Override with an environment variable if you ever move
things:

```
PROJECT_ROOT=/path/to/.project npm start
```

## Verify the engine on its own

```
npm run test:engine
```

This exercises `listStories`, `computeBoard`, and a round-trip
`updateStory` (changes STORY-001's priority, checks it changed, then sets
it back) directly against your real `.project` folder — no server or
browser needed.

## Generating stories (no API key needed)

There's no in-app "Generate with AI" button — that would need a paid
Anthropic API key. Instead, story generation happens through a Claude
skill (see the project's Claude conversation): ask Claude to generate
stories for an epic, and it writes proposal `.md` files straight into
`.project/staging/`, in the exact same frontmatter format as a normal
story — no API cost, since it's Claude itself doing the writing, not a
metered API call.

Once proposals exist in `staging/`, review them right here in the app:
the "Staging — voorstellen ter review" section lists each one, and
Accepteren moves it into `product/stories/` (now source of truth) while
Verwerpen deletes it. This is the same staging rule from the architecture
plan (§6.4) — nothing skips human review.

## AI agent roles (Phase 4)

Beyond generating stories, two more Claude skills act out explicit,
bounded roles — each one's "mag/mag niet" is written down in
`.project/ai/agents/*.md` (architecture plan §6.5), not just implied:

- **scrum-master** (`.project/ai/agents/scrum-master.md`, skill
  `scrum-master-sprint-risk`): analyzes the active sprint for
  overcommitment, dependency risk, and Definition-of-Ready gaps. It never
  writes a file — the role is explicitly analysis-only ("mag niet:
  product backlog aanpassen zonder goedkeuring"), so its whole output is
  the chat response.
- **architect** (`.project/ai/agents/architect.md`, skill
  `architect-draft-adr`): drafts a new Architecture Decision Record. Like
  story generation, it never writes straight to `engineering/decisions/`
  — the draft goes to `staging/` with `proposal_type: adr`, and only
  becomes a real ADR once accepted in the Staging section here.

To support a second kind of staged entity, `acceptStagingProposal()` now
routes by each proposal's `proposal_type` field (`story` → default,
routes to `product/stories/`; `adr` → routes to `engineering/decisions/`)
instead of always assuming `product/stories/`. The Staging cards show a
small type badge so it's clear at a glance what you're reviewing.

Every Accepteren/Verwerpen decision — for either proposal type — is now
also logged to `.project/audit/ai-events.jsonl` (architecture plan §7):
which agent, what action, whether it was approved, and when. It's
visible under Staging as a small "Audit log" list. Like `analytics/`,
this is explicitly a log, never a source of truth — nothing reads from
it to decide anything; it exists purely for traceability of what AI
roles proposed and what a human decided.

## Concurrency safety (optimistic locking)

Every story, epic, task and sprint carries a `_version` — a content hash
of the `.md` file, computed fresh on every read — alongside its other
fields. The app remembers that hash the moment you open something for
editing (including a board card, for drag-and-drop) and sends it back as
`expectedVersion` when saving. `engine.update*()` compares that against
the file's current hash right before writing; if someone else changed the
file since you opened it — another browser tab, a manual edit, an AI
agent accepting a staging proposal onto the same id — the save is
rejected instead of silently overwriting their change, and the API
answers with `409` plus the file's actual current content. The app then
asks whether to reload the latest version (discarding what's in the open
form) rather than guessing for you. This resolves the "what happens if AI
and a human touch the same file at once" risk from the architecture plan
(§8.1). Saves that don't pass `expectedVersion` behave exactly as before —
the check is opt-in per request, so nothing existing broke.

## Git integration (commit ↔ task/story-koppeling)

The "Git sync" button in the header scans `git log` for the repo containing
this project (walking up from `.project` to find `.git`, so it works even
if `.project` isn't at the repo root) and links commits to tasks by id: any
commit whose message mentions `TASK-003` sets that task's `commit` field
to the commit's short hash. A GitHub-style `closes TASK-003` / `fixes
TASK-003` / `resolves TASK-003` (case-insensitive, subject or body)
additionally moves that task to `status: done` — but only forward; a task
already done, or a task with no closing keyword, is never moved backward
or reopened by this. Running it again is a no-op if nothing changed.

The same scan also links commits to **stories**: any commit whose message
mentions `STORY-003` appends that commit's short hash to the story's
`commits[]` field — append-only, deduplicated, chronological. This is
**link-only**: no keyword ever moves a story to `done`, unlike tasks. A
story's Definition of Done requires a human to actually verify it, so the
only way a story reaches `done` is through the story edit UI itself, a
deliberate human action — a commit message, however phrased, can never
close one automatically. The story edit modal shows a read-only
"Gekoppelde commits" list combining a story's own direct links with the
`commit` field of every task under it (`getStoryCommitTrail()`), so the
full trail — whether a change was recorded against the story directly or
against one of its tasks — is visible in one place.

This intentionally does **not** go through `staging/`. Staging exists for
uncertain, AI-generated content a human should review before it becomes
truth (architecture plan §6.4) — a git commit is already truth, a
permanent record of something that already happened, so writing it here is
the same kind of direct write a git hook would make, not a proposal.
Every change it makes is still logged to `.project/audit/ai-events.jsonl`
with `agent: "git-sync"`, same as every other write this app makes on
someone's behalf, so it stays traceable from the Staging section's audit
log. This resolves the "Git-koppeling (commit → status-update)" item from
the roadmap (Fase 3) and the matching unresolved risk in the architecture
plan (§8.4).

## Schema validation

Every story, epic, task, sprint and ADR is checked against a small,
hand-written schema (required fields, basic types, a few enums like
`priority`) — the "Parsing-fragiliteit" risk from the architecture plan
(§8.2): a human can always break a `.md` file by hand (wrong field name,
unclosed YAML bracket, a typo'd enum value), and the app needs to say so
clearly instead of crashing or, worse, silently dropping the file. Two
different problems are handled differently:

- **Syntactically broken YAML** (readEntity can't even parse it) — the
  file is skipped when listing (so one broken story doesn't take the
  whole board down), and shows up in the new **"Validatie"** section with
  its parse error. Opening it directly by id (e.g. clicking a link that
  points straight at it) surfaces the real error instead of a misleading
  "not found".
- **Valid YAML, invalid data** (e.g. a story with no `title`, or
  `priority: urgent` instead of one of the three allowed values) — the
  entity still loads and shows up everywhere it normally would (so you
  can open it to fix it), but is flagged with the specific problem in the
  Validatie section. Saving a change that would make an entity invalid is
  rejected outright (`422`) *before* it's written, so the file on disk
  never becomes invalid through the app itself — including AI-generated
  staging proposals: accepting one that fails its schema is refused,
  so a malformed proposal can't become a broken "real" story just because
  a human clicked Accepteren without noticing.

While building this, the test suite caught a real bug in `gray-matter`
itself: it caches parsed results keyed by raw file content, and writes
that cache entry *before* parsing — so if the YAML parse throws, the
cache is left holding a stale, half-built object, and a second read of
the exact same broken file silently returns empty data instead of
throwing again. `engine/index.js` now always passes an explicit (empty)
options object to `matter()`, which bypasses that cache entirely, so a
broken file reliably fails every time it's read, not just the first.

## Cycle time & release forecasting

Every story and task now auto-stamps `started_at` (the first time it
leaves `backlog`) and `done_at` (when it reaches `done`) on any save that
changes its status — nothing to fill in by hand, and reopening a
"done" item clears `done_at` again rather than leaving a stale
timestamp. The Analytics section's new **Cycle time** view is just the
gap between those two timestamps, averaged across everything that has
both; anything `done` from before this existed (or hand-edited straight
to done) has neither timestamp, and is listed separately as "missing
data" rather than silently being counted as instant or left out without
explanation.

The **Forecast** view answers "at this rate, when": remaining (not-done)
story points divided by the same average velocity the velocity chart
above it already shows, both for the whole backlog and per epic, turned
into a rough calendar date using the team's average sprint length. Like
the velocity average, it needs at least 2 completed sprints of history
before it'll project a number — with less than that it says so instead
of guessing. This covers the roadmap's Fase 4 "capacity planning,
release forecasting" line item, deliberately at the **team** level only:
the architecture plan (§7) treats individual team members' availability
as sensitive data that belongs in the optional, git-ignored `people/`
directory, so per-person capacity tracking is intentionally left out of
this rather than silently assumed away.

## Status

Board view + click-to-edit + drag-and-drop + staging review (accept/reject)
+ epics UI + task-level view + search/filters + sprint planning view +
dependencies view + engineering docs view + history (milestones, lessons
learned) + analytics (velocity, cycle time, backlog/epic forecasting) +
AI agent roles (scrum-master, architect, each with explicit boundaries +
an audit log) + optimistic locking against concurrent edits + git
integration (commit ↔ task linking, plus link-only commit ↔ story
linking with a full commit trail view) + schema validation on every
read/write are built — the full roadmap through Phase 4, plus every risk
the architecture plan originally flagged as unresolved (§8.1 concurrency,
§8.2 parsing-fragiliteit, §8.4 git-koppeling) except §8.3 (multi-user git
merge, an explicit known MVP limitation, not something a single local app
can resolve on its own). Every AI action (story generation, sprint risk
analysis, ADR drafting) lives in a Claude skill rather than a paid in-app
API button, and anything that writes a file goes through `staging/` for
human review first — except the git sync, which writes directly for the
reason explained in that section above (a commit is already truth, not a
proposal).

## Note on testing

This app was written without being able to run `npm install`/`node` in the
build environment at first (its sandbox had a disk-space problem); it has
since been verified with `npm run test:engine`, which passed. Report back
anything that breaks in everyday use.
