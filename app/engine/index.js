'use strict';

/**
 * Engine layer for the AI-native agile project OS.
 *
 * Pure Node functions with no HTTP / Electron / UI dependency of any kind.
 * Everything here operates on a `projectRoot` path (the `.project` folder)
 * and plain JS objects. This is deliberate: the server (Express, for now)
 * is a thin wrapper that only calls these functions, so the same engine
 * could later be reused by a real remote server or an Electron main
 * process without any changes.
 *
 * Source of truth stays exactly as designed in the architecture plan:
 * one entity = one Markdown file with YAML frontmatter (parsed via
 * gray-matter). The board is always derived, never stored separately.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const matter = require('gray-matter');

/**
 * Thrown by update*() when the caller passed `expectedVersion` and the
 * file on disk no longer matches it — i.e. someone else (a human editing
 * the .md file directly, another browser tab, or an AI agent) wrote to
 * this same entity after the caller last read it. This is the "optimistic
 * locking with timestamp-check" risk flagged in the architecture plan §8:
 * a content hash is used instead of a timestamp so it isn't sensitive to
 * filesystem mtime resolution or clock skew, and two writes that happen to
 * land in the same second are still correctly told apart.
 *
 * `current` carries the entity as it actually is on disk right now, so a
 * caller can show the user what changed instead of just "conflict".
 */
class ConflictError extends Error {
  constructor(message, current) {
    super(message);
    this.name = 'ConflictError';
    this.code = 'VERSION_CONFLICT';
    this.current = current;
  }
}

/** Content-hash "version" token for optimistic locking — see ConflictError above. */
function hashContent(raw) {
  return crypto.createHash('sha1').update(raw).digest('hex');
}

/**
 * Thrown for two related but distinct problems flagged by the architecture
 * plan §8 risk #2 ("Parsing-fragiliteit... schema-validatie bij het
 * inlezen, met duidelijke foutmelding in de app in plaats van silent
 * failure"):
 *  - a file's YAML frontmatter is syntactically broken and can't be
 *    parsed at all (thrown by readEntity())
 *  - a file parses fine but is missing a required field or has a field of
 *    the wrong type (thrown by the update, create, and
 *    acceptStagingProposal functions before a write would make things
 *    worse — reads never throw for this, see validateFrontmatter() below)
 * `details` is always an array of plain-language messages, never a raw
 * parser exception, so a caller can show it directly instead of guessing
 * at what a stack trace means.
 */
class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
    this.details = details || [];
  }
}

/**
 * Deliberately small — required fields + basic type/enum/pattern checks,
 * not a full JSON-schema engine — matching the rest of this file's plain,
 * dependency-free style. Only fields listed here are checked; any other
 * frontmatter key (e.g. `origin`, `edited`, `generated_by` on a story) is
 * always allowed through untouched, matching the "unknown/future keys
 * survive" rule already documented on updateStory().
 */
const ENTITY_SCHEMAS = {
  story: {
    id: { required: true, type: 'string', pattern: /^STORY-/ },
    title: { required: true, type: 'string' },
    status: { type: 'string' },
    priority: { type: 'string', enum: ['low', 'medium', 'high'] },
    story_points: { type: 'number', nullable: true },
    epic: { type: 'string', nullable: true },
    sprint: { type: 'string', nullable: true },
    dependencies: { type: 'array' },
    commits: { type: 'array' },
    started_at: { type: 'string', nullable: true },
    done_at: { type: 'string', nullable: true },
  },
  epic: {
    id: { required: true, type: 'string', pattern: /^EPIC-/ },
    title: { required: true, type: 'string' },
    status: { type: 'string' },
  },
  task: {
    id: { required: true, type: 'string', pattern: /^TASK-/ },
    title: { required: true, type: 'string' },
    story: { required: true, type: 'string' },
    status: { type: 'string' },
    type: { type: 'string', enum: ['task', 'bug'] },
    commit: { type: 'string', nullable: true },
    started_at: { type: 'string', nullable: true },
    done_at: { type: 'string', nullable: true },
  },
  sprint: {
    id: { required: true, type: 'string', pattern: /^sprint-/ },
    start: { type: 'string', nullable: true },
    end: { type: 'string', nullable: true },
    status: { type: 'string' },
    capacity: { type: 'number' },
  },
  adr: {
    id: { required: true, type: 'string', pattern: /^ADR-/ },
    title: { required: true, type: 'string' },
    status: { type: 'string' },
  },
};

/**
 * Validate one entity's frontmatter against its kind's schema. Returns an
 * array of plain-language error strings — empty means valid. Never
 * throws: callers decide whether a validation failure should block a
 * write (the update, create, and acceptStagingProposal functions below)
 * or just be surfaced as a warning on an otherwise-readable entity (the
 * list and get functions).
 */
function validateFrontmatter(kind, frontmatter) {
  const schema = ENTITY_SCHEMAS[kind];
  if (!schema) return [];
  const data = frontmatter || {};
  const errors = [];

  for (const [field, spec] of Object.entries(schema)) {
    const value = data[field];
    const present = value !== undefined && value !== null;

    if (spec.required && !present) {
      errors.push(`Verplicht veld ontbreekt: "${field}"`);
      continue;
    }
    if (!present) continue; // optional and absent (or explicitly null) — fine

    if (spec.type === 'array') {
      if (!Array.isArray(value)) errors.push(`Veld "${field}" moet een lijst zijn, kreeg: ${typeof value}`);
    } else if (typeof value !== spec.type) {
      errors.push(`Veld "${field}" moet van type ${spec.type} zijn, kreeg: ${typeof value}`);
    }
    if (spec.enum && !spec.enum.includes(value)) {
      errors.push(`Veld "${field}" moet één van [${spec.enum.join(', ')}] zijn, kreeg: "${value}"`);
    }
    if (spec.pattern && typeof value === 'string' && !spec.pattern.test(value)) {
      errors.push(`Veld "${field}" ("${value}") volgt niet het verwachte id-formaat`);
    }
  }

  return errors;
}

/**
 * Best-effort extraction of the `id:` line from a frontmatter block
 * without fully parsing it — used only when a file's YAML is too broken
 * for gray-matter to parse at all, to tell "this broken file IS the one
 * being searched for by id" apart from "this is some other, unrelated
 * broken file" (see findEntityByIdOrThrow() below). Never throws.
 */
function peekIdFromRawFrontmatter(raw) {
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!fmMatch) return null;
  const idMatch = /(^|\n)id:\s*["']?([^"'\n]+?)["']?\s*(\n|$)/.exec(fmMatch[1]);
  return idMatch ? idMatch[2].trim() : null;
}

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(dir, f));
}

/**
 * YAML auto-parses an unquoted date-looking scalar (e.g. `start: 2026-07-28`)
 * into a native JS Date at midnight UTC. Left alone, that becomes a full
 * ISO timestamp the moment it's JSON-serialized over the API, and gets
 * written back out the same way on the next save — quietly turning a
 * clean date into a timestamp in the actual .md file. Normalizing back to
 * a plain "YYYY-MM-DD" string here means every other function in this
 * file only ever sees strings, and the file self-heals on first read.
 */
function normalizeFrontmatterDates(data) {
  const normalized = { ...data };
  for (const [key, value] of Object.entries(normalized)) {
    if (value instanceof Date) {
      normalized[key] = value.toISOString().slice(0, 10);
    }
  }
  return normalized;
}

/**
 * Read one entity file: { filePath, frontmatter, body, _version }.
 * Throws a ValidationError — not gray-matter's raw parser exception — if
 * the YAML frontmatter is syntactically broken, so every caller (routes
 * included) gets a message that actually says what's wrong instead of a
 * stack trace (architecture plan §8 risk #2).
 */
function readEntity(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  let parsed;
  try {
    // gray-matter caches its result keyed by raw content, and writes that
    // cache entry BEFORE parsing the YAML — so if parsing throws, the
    // cache is left holding a stale, half-built object with no error.
    // A second read of that same broken content then silently returns the
    // stale object with empty data instead of throwing again, which is
    // exactly the kind of silent failure the architecture plan warns
    // against (§8 risk #2). Passing an (empty) options object bypasses
    // that cache entirely, so a broken file reliably throws every time,
    // not just the first time it's read in this process.
    parsed = matter(raw, {});
  } catch (err) {
    throw new ValidationError(
      `${path.basename(filePath)} heeft kapotte YAML-frontmatter en kan niet gelezen worden: ${err.message}`,
      [err.message]
    );
  }
  return {
    filePath,
    frontmatter: normalizeFrontmatterDates(parsed.data || {}),
    body: `${parsed.content.trim()}\n`,
    _version: hashContent(raw),
  };
}

/** Write one entity file back out, frontmatter + body. Returns the new _version. */
function writeEntity(filePath, frontmatter, body) {
  const output = matter.stringify(body || '', frontmatter || {});
  fs.writeFileSync(filePath, output, 'utf-8');
  return hashContent(output);
}

/**
 * Optimistic-locking guard used by every update*() below. `expectedVersion`
 * is optional and omitted entirely by any caller that doesn't care about
 * conflicts (e.g. internal test fixtures) — only when a caller actually
 * passes one is it enforced, so this is fully backward compatible with
 * existing callers.
 */
function assertNoConflict(existing, expectedVersion, label) {
  if (expectedVersion === undefined || expectedVersion === null || expectedVersion === '') return;
  if (existing._version !== expectedVersion) {
    throw new ConflictError(
      `${label} ${existing.frontmatter.id} is intussen elders gewijzigd — herlaad om de nieuwste versie te zien.`,
      { ...existing.frontmatter, _body: existing.body, _version: existing._version }
    );
  }
}

/**
 * Auto-stamp `started_at`/`done_at` on a status change, mutating
 * `newFrontmatter` in place — the data cycle-time analytics needs
 * (roadmap Fase 4 "analytics (velocity, cycle time)") without asking
 * anyone to manage two extra fields by hand. "Started" is defined as
 * "left backlog" rather than any specific column name, since the board's
 * columns are configurable (kanban-board.md) and this needs to work
 * regardless of what someone calls their "in progress" column.
 *  - leaving backlog for the first time sets started_at (never overwritten
 *    by a later transition, so it always reflects when work truly began)
 *  - reaching done sets done_at
 *  - moving OFF done to something else clears done_at (reopened — no
 *    longer "done" until it's done again)
 *  - moving back to backlog clears both — a full reset, so a restarted
 *    item's next cycle is measured fresh rather than inheriting a stale
 *    started_at from months ago
 * A no-op status change (new value equals old) never touches either
 * field, so re-saving a story without changing its status can't
 * accidentally rewrite its history.
 */
function maybeStampLifecycleTimestamps(oldFrontmatter, newFrontmatter) {
  const oldStatus = String(oldFrontmatter.status || '').toLowerCase();
  const newStatus = String(newFrontmatter.status || '').toLowerCase();
  if (oldStatus === newStatus) return;

  if (newStatus === 'backlog') {
    newFrontmatter.started_at = null;
    newFrontmatter.done_at = null;
    return;
  }

  const now = new Date().toISOString();
  if (!newFrontmatter.started_at) {
    newFrontmatter.started_at = now;
  }
  if (newStatus === 'done') {
    newFrontmatter.done_at = now;
  } else if (oldStatus === 'done') {
    newFrontmatter.done_at = null;
  }
}

/**
 * Read every markdown file in `dir` as an entity of the given `kind`,
 * tolerating broken files instead of letting one bad file crash the whole
 * list (architecture plan §8 risk #2's "niet silent failure" cuts both
 * ways: a single broken story shouldn't take the entire board down
 * either). A file with unparseable YAML is skipped and recorded in
 * `brokenFiles` — its id is unknowable without parsing it, so it can't be
 * placed with the others. Everything else gets a `_validationErrors`
 * array attached: empty if the file is fully valid, non-empty if it
 * parses fine but is missing or mistyped fields — still included in
 * `items` either way, so a fixable problem doesn't hide the entity you'd
 * need to open in order to fix it. Nothing here throws; getValidationReport()
 * below is what turns brokenFiles + per-item errors into one clear report.
 */
function scanEntityFiles(dir, kind, { filterFile } = {}) {
  const items = [];
  const brokenFiles = [];
  const files = filterFile ? listMarkdownFiles(dir).filter(filterFile) : listMarkdownFiles(dir);

  for (const fp of files) {
    let entity;
    try {
      entity = readEntity(fp);
    } catch (err) {
      brokenFiles.push({ file: path.basename(fp), kind, errors: err.details && err.details.length ? err.details : [err.message] });
      continue;
    }
    const _validationErrors = validateFrontmatter(kind, entity.frontmatter);
    items.push({ ...entity.frontmatter, _file: path.basename(fp), _body: entity.body, _version: entity._version, _validationErrors });
  }

  return { items, brokenFiles };
}

/**
 * Find one entity by its `id` frontmatter field, scanning every file in
 * `dir`. A file that fails to parse is normally just skipped (it might be
 * some unrelated broken file, not the one being searched for) — but if a
 * cheap, best-effort peek at its raw frontmatter (peekIdFromRawFrontmatter,
 * since we can't fully parse it) shows it has THIS id, that broken file
 * IS the answer, so its real parse error is re-thrown instead of quietly
 * reporting "not found" for something that actually exists but is broken.
 * On success, the returned entity carries a `_validationErrors` array
 * (schema plan §8 risk #2) — empty if fully valid.
 */
function findEntityByIdOrThrow(dir, id, kind, { filterFile } = {}) {
  const files = filterFile ? listMarkdownFiles(dir).filter(filterFile) : listMarkdownFiles(dir);
  for (const fp of files) {
    let entity;
    try {
      entity = readEntity(fp);
    } catch (err) {
      const raw = fs.readFileSync(fp, 'utf-8');
      if (peekIdFromRawFrontmatter(raw) === id) throw err;
      continue;
    }
    if (entity.frontmatter.id === id) {
      return { ...entity, _validationErrors: validateFrontmatter(kind, entity.frontmatter) };
    }
  }
  return null;
}

function listStories(projectRoot) {
  return scanEntityFiles(path.join(projectRoot, 'product', 'stories'), 'story').items;
}

function listEpics(projectRoot) {
  return scanEntityFiles(path.join(projectRoot, 'product', 'epics'), 'epic').items;
}

/** Find a story by its `id` frontmatter field (e.g. "STORY-001"). */
function getStory(projectRoot, id) {
  return findEntityByIdOrThrow(path.join(projectRoot, 'product', 'stories'), id, 'story');
}

/** Find an epic by its `id` frontmatter field (e.g. "EPIC-001-authentication"). */
function getEpic(projectRoot, id) {
  return findEntityByIdOrThrow(path.join(projectRoot, 'product', 'epics'), id, 'epic');
}

const DIACRITICS_RE = new RegExp('[̀-ͯ]', 'g');

function slugify(str) {
  const slug = String(str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(DIACRITICS_RE, '') // strip accents after NFKD decomposition
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  return slug || 'epic';
}

function nextEpicId(existingFileStems) {
  let max = 0;
  for (const stem of existingFileStems) {
    const m = /^EPIC-(\d+)/.exec(stem || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `EPIC-${String(max + 1).padStart(3, '0')}`;
}

/**
 * Create a new epic. Its `id` IS the filename stem (e.g.
 * "EPIC-004-billing") — matching how stories already reference epics via
 * their `epic` field — so there's only one identifier to keep track of,
 * not a short id plus a separate filename.
 */
function createEpic(projectRoot, { title, status, body } = {}) {
  const dir = path.join(projectRoot, 'product', 'epics');
  fs.mkdirSync(dir, { recursive: true });

  const existingStems = listMarkdownFiles(dir).map((fp) => path.basename(fp, '.md'));
  const numberPart = nextEpicId(existingStems);
  const id = `${numberPart}-${slugify(title)}`;

  const filePath = path.join(dir, `${id}.md`);
  if (fs.existsSync(filePath)) {
    throw new Error(`Epic file already exists: ${id}.md`);
  }

  const frontmatter = { id, title: title || 'Naamloze epic', status: status || 'backlog' };
  const schemaErrors = validateFrontmatter('epic', frontmatter);
  if (schemaErrors.length) {
    throw new ValidationError(`Kan epic niet aanmaken: ${schemaErrors.join('; ')}`, schemaErrors);
  }
  const bodyText = body && body.trim() ? body : '## Doel\n\n\n\n## Stories\n\n';
  writeEntity(filePath, frontmatter, bodyText);

  return { filePath, frontmatter, body: bodyText };
}

const EPIC_UPDATABLE_FIELDS = ['title', 'status'];

/** Update an epic's frontmatter/body. The id (and filename) never change. */
function updateEpic(projectRoot, id, updates = {}) {
  const existing = getEpic(projectRoot, id);
  if (!existing) {
    throw new Error(`Epic not found: ${id}`);
  }
  assertNoConflict(existing, updates.expectedVersion, 'Epic');

  const newFrontmatter = { ...existing.frontmatter };
  for (const key of EPIC_UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      newFrontmatter[key] = updates[key];
    }
  }
  const schemaErrors = validateFrontmatter('epic', newFrontmatter);
  if (schemaErrors.length) {
    throw new ValidationError(`Kan epic ${id} niet opslaan: ${schemaErrors.join('; ')}`, schemaErrors);
  }

  const newBody = typeof updates.body === 'string' ? updates.body : existing.body;
  const _version = writeEntity(existing.filePath, newFrontmatter, newBody);

  return { filePath: existing.filePath, frontmatter: newFrontmatter, body: newBody, _version };
}

const STORY_UPDATABLE_FIELDS = [
  'title',
  'status',
  'priority',
  'story_points',
  'epic',
  'sprint',
  'dependencies',
  'commits',
];

/**
 * Update a story's frontmatter (allow-listed fields only) and/or body.
 * Never touches fields it wasn't asked to change, so unknown/future
 * frontmatter keys (e.g. `origin`, `edited`, `generated_by`) survive.
 */
function updateStory(projectRoot, id, updates = {}) {
  const existing = getStory(projectRoot, id);
  if (!existing) {
    throw new Error(`Story not found: ${id}`);
  }
  assertNoConflict(existing, updates.expectedVersion, 'Story');

  const newFrontmatter = { ...existing.frontmatter };
  for (const key of STORY_UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      newFrontmatter[key] = updates[key];
    }
  }
  maybeStampLifecycleTimestamps(existing.frontmatter, newFrontmatter);
  const schemaErrors = validateFrontmatter('story', newFrontmatter);
  if (schemaErrors.length) {
    throw new ValidationError(`Kan story ${id} niet opslaan: ${schemaErrors.join('; ')}`, schemaErrors);
  }

  const newBody = typeof updates.body === 'string' ? updates.body : existing.body;
  const _version = writeEntity(existing.filePath, newFrontmatter, newBody);

  return { filePath: existing.filePath, frontmatter: newFrontmatter, body: newBody, _version };
}

function listTasks(projectRoot) {
  return scanEntityFiles(path.join(projectRoot, 'execution', 'tasks'), 'task').items;
}

/** Tasks belonging to one story, via the task's `story` frontmatter field. */
function listTasksForStory(projectRoot, storyId) {
  return listTasks(projectRoot).filter((t) => t.story === storyId);
}

/**
 * Full commit trail for a story, for traceability: its own directly-linked
 * `commits[]` (set by syncGitCommits when a commit message bare-references
 * "STORY-XXX") plus the `commit` field of every task under it (set when a
 * commit references "TASK-XXX"). A change can land in a story's history
 * either way — a commit might mention the story directly, or only one of
 * its tasks — so this rolls both up into one deduplicated, ordered list.
 * Read-only; never writes anything.
 */
function getStoryCommitTrail(projectRoot, storyId) {
  const story = getStory(projectRoot, storyId);
  if (!story) return null;

  const direct = Array.isArray(story.frontmatter.commits) ? story.frontmatter.commits : [];
  const tasks = listTasksForStory(projectRoot, storyId);

  const seen = new Set();
  const trail = [];
  for (const hash of direct) {
    if (seen.has(hash)) continue;
    seen.add(hash);
    trail.push({ commit: hash, source: 'story' });
  }
  for (const task of tasks) {
    if (!task.commit || seen.has(task.commit)) continue;
    seen.add(task.commit);
    trail.push({ commit: task.commit, source: 'task', taskId: task.id });
  }

  return { storyId, commits: trail };
}

/** Find a task by its `id` frontmatter field (e.g. "TASK-001"). */
function getTask(projectRoot, id) {
  return findEntityByIdOrThrow(path.join(projectRoot, 'execution', 'tasks'), id, 'task');
}

function nextTaskId(existingIds) {
  let max = 0;
  for (const id of existingIds) {
    const m = /^TASK-(\d+)$/.exec(id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `TASK-${String(max + 1).padStart(3, '0')}`;
}

/**
 * Create a task under a story. Tasks are the third level of the
 * Epic -> Story -> Task model — a technical sub-item that arises during
 * sprint planning and links to git commits (architecture plan §4).
 */
function createTask(projectRoot, { title, story, status, type, body } = {}) {
  if (!story) {
    throw new Error('story is verplicht (een task hoort altijd bij een story)');
  }
  if (!getStory(projectRoot, story)) {
    throw new Error(`Story not found: ${story}`);
  }

  const dir = path.join(projectRoot, 'execution', 'tasks');
  fs.mkdirSync(dir, { recursive: true });

  const existingIds = listTasks(projectRoot).map((t) => t.id);
  const id = nextTaskId(existingIds);

  const frontmatter = {
    id,
    title: title || 'Naamloze taak',
    story,
    status: status || 'backlog',
    type: type === 'bug' ? 'bug' : 'task',
    commit: null,
  };
  const schemaErrors = validateFrontmatter('task', frontmatter);
  if (schemaErrors.length) {
    throw new ValidationError(`Kan taak niet aanmaken: ${schemaErrors.join('; ')}`, schemaErrors);
  }
  const bodyText = body && body.trim() ? body : '## Beschrijving\n\n';
  const filePath = path.join(dir, `${id}.md`);
  writeEntity(filePath, frontmatter, bodyText);

  return { filePath, frontmatter, body: bodyText };
}

const TASK_UPDATABLE_FIELDS = ['title', 'status', 'type', 'commit', 'story'];

/** Update a task's frontmatter/body. */
function updateTask(projectRoot, id, updates = {}) {
  const existing = getTask(projectRoot, id);
  if (!existing) {
    throw new Error(`Task not found: ${id}`);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'story') && !getStory(projectRoot, updates.story)) {
    throw new Error(`Story not found: ${updates.story}`);
  }
  assertNoConflict(existing, updates.expectedVersion, 'Task');

  const newFrontmatter = { ...existing.frontmatter };
  for (const key of TASK_UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      newFrontmatter[key] = updates[key];
    }
  }
  maybeStampLifecycleTimestamps(existing.frontmatter, newFrontmatter);
  const schemaErrors = validateFrontmatter('task', newFrontmatter);
  if (schemaErrors.length) {
    throw new ValidationError(`Kan taak ${id} niet opslaan: ${schemaErrors.join('; ')}`, schemaErrors);
  }

  const newBody = typeof updates.body === 'string' ? updates.body : existing.body;
  const _version = writeEntity(existing.filePath, newFrontmatter, newBody);

  return { filePath: existing.filePath, frontmatter: newFrontmatter, body: newBody, _version };
}

/**
 * Walk up from `startDir` looking for a `.git` directory. Doesn't assume
 * `.project`'s parent IS the repo root — a caller might point PROJECT_ROOT
 * somewhere nested inside a larger repo — it actually finds it.
 */
function findGitRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const TASK_REF_RE = /TASK-(\d+)/gi;
const CLOSING_KEYWORD_RE = /\b(?:closes?|closed|fixes?|fixed|resolves?|resolved)\s*:?\s*TASK-(\d+)/gi;
const STORY_REF_RE = /STORY-(\d+)/gi;

/**
 * Parse one commit message (subject + body) for entity references —
 * architecture plan §8 risk #4 / roadmap Fase 3 "Git-integratie (commit ↔
 * task-koppeling)", extended to stories. Three kinds of reference:
 *  - a bare "TASK-003" anywhere in the message just links this commit to
 *    that task
 *  - "closes/fixes/resolves TASK-003" (case-insensitive, GitHub-issue
 *    style) additionally means the task should move to done
 *  - a bare "STORY-003" anywhere in the message links this commit to that
 *    story — link-only, never a closing keyword: a story only reaches
 *    "done" after a human verifies its Definition of Done, so no commit
 *    message can move it there automatically.
 * A single commit can reference more than one task and/or story.
 */
function parseEntityReferences(message) {
  const taskIds = new Set();
  TASK_REF_RE.lastIndex = 0;
  let m;
  while ((m = TASK_REF_RE.exec(message))) {
    taskIds.add(`TASK-${m[1]}`);
  }
  const taskClosingIds = new Set();
  CLOSING_KEYWORD_RE.lastIndex = 0;
  while ((m = CLOSING_KEYWORD_RE.exec(message))) {
    taskClosingIds.add(`TASK-${m[1]}`);
  }
  const storyIds = new Set();
  STORY_REF_RE.lastIndex = 0;
  while ((m = STORY_REF_RE.exec(message))) {
    storyIds.add(`STORY-${m[1]}`);
  }
  return {
    taskIds: Array.from(taskIds),
    taskClosingIds: Array.from(taskClosingIds),
    storyIds: Array.from(storyIds),
  };
}

/**
 * Read `git log` for the repo containing `projectRoot` (or an explicit
 * `repoRoot`) and, for every task a commit message references, set that
 * task's `commit` field to the most recent referencing commit's short
 * hash. A GitHub-style "closes/fixes/resolves TASK-XXX" additionally moves
 * that task to status "done" — but only forward: a task already in
 * `done` is never moved back out by a later, non-closing commit that
 * happens to mention it again, and a task is never un-done by this sync.
 *
 * Also links commits to stories: every "STORY-XXX" a commit message
 * references gets that commit's short hash appended to the story's
 * `commits[]` field — append-only, deduplicated, chronological. Unlike
 * tasks, this is link-only: no keyword ever moves a story to "done". A
 * story's Definition of Done requires human verification, so only the
 * story edit UI (a deliberate human action) can close it — see the
 * "link only, never auto-close" decision this behavior implements.
 *
 * Deliberately NOT routed through staging/ (architecture plan §6.4): that
 * mechanism exists for uncertain, AI-generated content a human should
 * review before it becomes truth. A git commit already IS truth — a
 * permanent, human-authored record of something that already happened —
 * so recording it here is the same kind of direct write a git hook would
 * make on commit, not a proposal to review. Every change is still logged
 * to audit/ai-events.jsonl (agent: 'git-sync') for traceability, same as
 * every other write this app makes on someone's behalf.
 */
function syncGitCommits(projectRoot, { repoRoot, maxCommits = 500 } = {}) {
  const root = repoRoot || findGitRepoRoot(projectRoot);
  if (!root) {
    throw new Error('Geen git-repository gevonden (geen .git map boven het projectpad).');
  }

  const FIELD_SEP = '\x1f'; // unit separator — practically never appears in a commit message
  const RECORD_SEP = '\x1e'; // record separator
  let raw;
  try {
    raw = execFileSync(
      'git',
      ['log', `--max-count=${maxCommits}`, `--pretty=format:%H${FIELD_SEP}%s${FIELD_SEP}%b${RECORD_SEP}`],
      { cwd: root, encoding: 'utf-8' }
    );
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('git is niet gevonden op het PATH.');
    }
    const stderr = (err.stderr || '').toString();
    // A repo with zero commits yet exits non-zero — treat as "nothing to sync".
    if (/does not have any commits yet/i.test(stderr) || /unknown revision/i.test(stderr)) {
      return {
        repoRoot: root,
        commitsScanned: 0,
        updatedTasks: [],
        unknownTaskRefs: [],
        updatedStories: [],
        unknownStoryRefs: [],
      };
    }
    throw new Error(`git log mislukt: ${(stderr || err.message || '').toString().trim()}`);
  }

  const commits = raw
    .split(RECORD_SEP)
    .map((chunk) => chunk.replace(/^\n/, '').trim())
    .filter(Boolean)
    .map((chunk) => {
      const [hash, subject, body] = chunk.split(FIELD_SEP);
      return { hash, message: `${subject || ''}\n${body || ''}` };
    })
    .reverse(); // oldest first, so the last write per task below is its most recent commit

  const plan = new Map(); // taskId -> { hash, closing }
  const unknownTaskRefs = new Set();
  const storyPlan = new Map(); // storyId -> ordered array of short hashes (chronological, deduped)
  const unknownStoryRefs = new Set();

  for (const commit of commits) {
    const { taskIds, taskClosingIds, storyIds } = parseEntityReferences(commit.message);
    const hash = commit.hash.slice(0, 12);

    for (const taskId of taskIds) {
      if (!getTask(projectRoot, taskId)) {
        unknownTaskRefs.add(taskId);
        continue;
      }
      const prior = plan.get(taskId);
      plan.set(taskId, {
        hash,
        closing: Boolean(prior && prior.closing) || taskClosingIds.includes(taskId),
      });
    }

    for (const storyId of storyIds) {
      if (!getStory(projectRoot, storyId)) {
        unknownStoryRefs.add(storyId);
        continue;
      }
      if (!storyPlan.has(storyId)) storyPlan.set(storyId, []);
      const hashes = storyPlan.get(storyId);
      if (!hashes.includes(hash)) hashes.push(hash);
    }
  }

  const updatedTasks = [];
  for (const [taskId, { hash, closing }] of plan) {
    const task = getTask(projectRoot, taskId);
    const updates = {};
    if (task.frontmatter.commit !== hash) updates.commit = hash;
    if (closing && task.frontmatter.status !== 'done') updates.status = 'done';
    if (Object.keys(updates).length === 0) continue; // nothing actually changed — skip the write

    const updated = updateTask(projectRoot, taskId, updates);
    logAuditEvent(projectRoot, {
      agent: 'git-sync',
      action: 'update_task_from_commit',
      id: taskId,
      approved: true,
      commit: hash,
      fields: Object.keys(updates),
    });
    updatedTasks.push({ id: taskId, commit: hash, status: updated.frontmatter.status, fields: Object.keys(updates) });
  }

  const updatedStories = [];
  for (const [storyId, hashes] of storyPlan) {
    const story = getStory(projectRoot, storyId);
    const existingCommits = Array.isArray(story.frontmatter.commits) ? story.frontmatter.commits : [];
    const merged = existingCommits.slice();
    for (const h of hashes) {
      if (!merged.includes(h)) merged.push(h);
    }
    if (merged.length === existingCommits.length) continue; // nothing new — skip the write

    const addedCommits = hashes.filter((h) => !existingCommits.includes(h));
    updateStory(projectRoot, storyId, { commits: merged });
    logAuditEvent(projectRoot, {
      agent: 'git-sync',
      action: 'link_story_commits',
      id: storyId,
      approved: true,
      commits: addedCommits,
      fields: ['commits'],
    });
    updatedStories.push({ id: storyId, addedCommits, commits: merged });
  }

  return {
    repoRoot: root,
    commitsScanned: commits.length,
    updatedTasks,
    unknownTaskRefs: Array.from(unknownTaskRefs),
    updatedStories,
    unknownStoryRefs: Array.from(unknownStoryRefs),
  };
}

/**
 * List sprints from scrum/sprints/. Retro files (e.g. "sprint-1-retro.md")
 * are a different entity — a sprint's retrospective, not the sprint
 * itself — so they're excluded here by filename.
 */
const NOT_RETRO = (fp) => !path.basename(fp).includes('retro');

function listSprints(projectRoot) {
  return scanEntityFiles(path.join(projectRoot, 'scrum', 'sprints'), 'sprint', { filterFile: NOT_RETRO }).items;
}

/** Find a sprint by its `id` frontmatter field (e.g. "sprint-1"). */
function getSprint(projectRoot, id) {
  return findEntityByIdOrThrow(path.join(projectRoot, 'scrum', 'sprints'), id, 'sprint', { filterFile: NOT_RETRO });
}

function nextSprintId(existingIds) {
  let max = 0;
  for (const id of existingIds) {
    const m = /^sprint-(\d+)$/.exec(id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `sprint-${max + 1}`;
}

/**
 * Create a new sprint. Note that "which stories are in this sprint" is
 * NOT stored here — that would be a second place tracking the same fact
 * as each story's own `sprint` field, which is exactly the kind of
 * duplicate source of truth the architecture plan rules out (§2, §5).
 * A story joins a sprint by having its `sprint` field set to this id
 * (already possible via the story edit form); this file only holds the
 * sprint's own data: dates, status, capacity, and a free-text goal.
 */
function createSprint(projectRoot, { start, end, status, capacity, goal } = {}) {
  const dir = path.join(projectRoot, 'scrum', 'sprints');
  fs.mkdirSync(dir, { recursive: true });

  const existingIds = listSprints(projectRoot).map((s) => s.id);
  const id = nextSprintId(existingIds);
  const number = id.split('-')[1];

  const filePath = path.join(dir, `${id}.md`);
  if (fs.existsSync(filePath)) {
    throw new Error(`Sprint file already exists: ${id}.md`);
  }

  const frontmatter = {
    id,
    start: start || null,
    end: end || null,
    status: status || 'planning',
    capacity: typeof capacity === 'number' ? capacity : 0,
  };
  const schemaErrors = validateFrontmatter('sprint', frontmatter);
  if (schemaErrors.length) {
    throw new ValidationError(`Kan sprint niet aanmaken: ${schemaErrors.join('; ')}`, schemaErrors);
  }
  const goalText = goal && goal.trim() ? goal.trim() : '_Nog te bepalen._';
  const bodyText = `# Sprint ${number}\n\n## Doel\n\n${goalText}\n`;
  writeEntity(filePath, frontmatter, bodyText);

  return { filePath, frontmatter, body: bodyText };
}

const SPRINT_UPDATABLE_FIELDS = ['start', 'end', 'status', 'capacity'];

/** Update a sprint's frontmatter/body. The id (and filename) never change. */
function updateSprint(projectRoot, id, updates = {}) {
  const existing = getSprint(projectRoot, id);
  if (!existing) {
    throw new Error(`Sprint not found: ${id}`);
  }
  assertNoConflict(existing, updates.expectedVersion, 'Sprint');

  const newFrontmatter = { ...existing.frontmatter };
  for (const key of SPRINT_UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      newFrontmatter[key] = updates[key];
    }
  }
  const schemaErrors = validateFrontmatter('sprint', newFrontmatter);
  if (schemaErrors.length) {
    throw new ValidationError(`Kan sprint ${id} niet opslaan: ${schemaErrors.join('; ')}`, schemaErrors);
  }

  const newBody = typeof updates.body === 'string' ? updates.body : existing.body;
  const _version = writeEntity(existing.filePath, newFrontmatter, newBody);

  return { filePath: existing.filePath, frontmatter: newFrontmatter, body: newBody, _version };
}

/**
 * Compute a sprint's live summary: which stories currently have their
 * `sprint` field set to this sprint's id, their combined story points,
 * and whether that total exceeds the sprint's capacity. A capacity of 0
 * means "not set yet" and never triggers an overcommitment flag — only a
 * deliberately set positive capacity does.
 */
function getSprintSummary(projectRoot, id) {
  const sprint = getSprint(projectRoot, id);
  if (!sprint) {
    throw new Error(`Sprint not found: ${id}`);
  }

  const stories = listStories(projectRoot)
    .filter((s) => s.sprint === id)
    .map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      priority: s.priority,
      story_points: s.story_points,
    }));

  const totalPoints = stories.reduce((sum, s) => sum + (typeof s.story_points === 'number' ? s.story_points : 0), 0);
  const capacity = typeof sprint.frontmatter.capacity === 'number' ? sprint.frontmatter.capacity : 0;
  const overCapacity = capacity > 0 && totalPoints > capacity;

  return { sprint: sprint.frontmatter, stories, totalPoints, capacity, overCapacity };
}

/**
 * Basic velocity analytics: for every sprint, how many story points were
 * committed (every story whose `sprint` field points at it) versus how
 * many were actually finished (`status === 'done'`). Always recomputed
 * fresh from the sprint + story files, the same way the board is — this
 * is a *view*, not a second place that stores the same facts.
 */
function computeVelocity(projectRoot) {
  const stories = listStories(projectRoot);

  return listSprints(projectRoot)
    .map((sprint) => {
      const sprintStories = stories.filter((s) => s.sprint === sprint.id);
      const doneStories = sprintStories.filter((s) => s.status === 'done');
      const points = (list) => list.reduce((sum, s) => sum + (typeof s.story_points === 'number' ? s.story_points : 0), 0);
      const committedPoints = points(sprintStories);
      const donePoints = points(doneStories);

      return {
        sprintId: sprint.id,
        status: sprint.status,
        start: sprint.start,
        end: sprint.end,
        capacity: typeof sprint.capacity === 'number' ? sprint.capacity : 0,
        storyCount: sprintStories.length,
        doneStoryCount: doneStories.length,
        committedPoints,
        donePoints,
        completionRate: committedPoints === 0 ? null : Number((donePoints / committedPoints).toFixed(2)),
      };
    })
    .sort((a, b) => a.sprintId.localeCompare(b.sprintId, undefined, { numeric: true }));
}

/**
 * Write a point-in-time snapshot of computeVelocity() to
 * `.project/analytics/velocity.json`. This file is explicitly derived
 * data, never source of truth: nothing in the app reads from it, and
 * deleting it loses nothing — computeVelocity() can regenerate the same
 * numbers from the sprint + story files at any time. It exists purely as
 * an optional, git-friendly export for anyone who wants a historical
 * record of velocity over time even if sprint/story data later changes.
 */
function writeVelocitySnapshot(projectRoot) {
  const sprints = computeVelocity(projectRoot);
  const dir = path.join(projectRoot, 'analytics');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'velocity.json');
  const snapshot = {
    generatedAt: new Date().toISOString(),
    note: 'Derived data — do not hand-edit and do not treat as source of truth. Regenerate any time from sprint + story files via computeVelocity().',
    sprints,
  };
  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');
  return { filePath, ...snapshot };
}

/**
 * Cycle time per finished story/task: calendar days between `started_at`
 * (first time it left backlog) and `done_at` (when it most recently
 * became done) — both auto-stamped by maybeStampLifecycleTimestamps() on
 * every status-changing update*() call (roadmap Fase 4 "cycle time").
 * Only entities with BOTH timestamps are measurable; anything finished
 * before this feature existed (or hand-set to done without ever being
 * saved through an update with a status change) has neither, and is
 * reported separately in `missingTimestamps` — a `0 items` view should
 * say why it's empty rather than just looking broken (the same "niet
 * silent failure" principle behind schema validation, applied to missing
 * data instead of bad data).
 */
function computeCycleTime(projectRoot) {
  const isDone = (item) => String(item.status || '').toLowerCase() === 'done';
  const all = [
    ...listStories(projectRoot).map((s) => ({ ...s, _kind: 'story' })),
    ...listTasks(projectRoot).map((t) => ({ ...t, _kind: 'task' })),
  ];

  const items = [];
  const missingTimestamps = [];
  for (const item of all) {
    if (item.started_at && item.done_at) {
      const days = (new Date(item.done_at) - new Date(item.started_at)) / (1000 * 60 * 60 * 24);
      items.push({ id: item.id, kind: item._kind, title: item.title, days: Number(days.toFixed(2)), started_at: item.started_at, done_at: item.done_at });
    } else if (isDone(item)) {
      missingTimestamps.push({ id: item.id, kind: item._kind, title: item.title });
    }
  }

  items.sort((a, b) => new Date(b.done_at) - new Date(a.done_at));
  const avgDays = items.length ? Number((items.reduce((sum, i) => sum + i.days, 0) / items.length).toFixed(2)) : null;

  return { items, avgDays, missingTimestamps };
}

/**
 * The team's recent average velocity, shared by both forecast functions
 * below — same threshold and same number the Analytics view's velocity
 * average already uses (computeVelocity()'s completed sprints, at least
 * 2 of them), so a forecast and the velocity chart it's built from can
 * never quietly disagree about what "average velocity" means.
 */
function averageCompletedVelocity(projectRoot) {
  const completedSprints = computeVelocity(projectRoot).filter((s) => s.status === 'done');
  if (completedSprints.length < 2) return null;
  return completedSprints.reduce((sum, s) => sum + s.donePoints, 0) / completedSprints.length;
}

/** Average sprint length in days, from completed sprints that have both start and end dates set. */
function averageSprintLengthDays(projectRoot) {
  const lengths = computeVelocity(projectRoot)
    .filter((s) => s.status === 'done' && s.start && s.end)
    .map((s) => (new Date(s.end) - new Date(s.start)) / (1000 * 60 * 60 * 24))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!lengths.length) return null;
  return lengths.reduce((a, b) => a + b, 0) / lengths.length;
}

/**
 * Forecast when a single epic will be done: remaining (not-done) story
 * points divided by average velocity, turned into a rough calendar date
 * using the team's average sprint length (roadmap Fase 4 "release
 * forecasting"). This is explicitly a projection from limited history,
 * never a promise — `insufficientHistory` is true (and both projections
 * are null) until there are at least 2 completed sprints to average,
 * exactly like the existing velocity-average view.
 */
function forecastEpic(projectRoot, epicId) {
  const epic = getEpic(projectRoot, epicId);
  if (!epic) {
    throw new Error(`Epic not found: ${epicId}`);
  }

  const stories = listStories(projectRoot).filter((s) => s.epic === epicId);
  const isDone = (s) => String(s.status || '').toLowerCase() === 'done';
  const points = (list) => list.reduce((sum, s) => sum + (typeof s.story_points === 'number' ? s.story_points : 0), 0);
  const totalPoints = points(stories);
  const donePoints = points(stories.filter(isDone));
  const remainingPoints = totalPoints - donePoints;
  const unestimatedCount = stories.filter((s) => typeof s.story_points !== 'number').length;

  const avgVelocity = averageCompletedVelocity(projectRoot);
  const avgSprintLength = averageSprintLengthDays(projectRoot);

  let sprintsRemaining = null;
  let projectedDoneDate = null;
  if (avgVelocity && avgVelocity > 0) {
    sprintsRemaining = remainingPoints > 0 ? Math.ceil(remainingPoints / avgVelocity) : 0;
    if (avgSprintLength) {
      const d = new Date();
      d.setDate(d.getDate() + sprintsRemaining * avgSprintLength);
      projectedDoneDate = d.toISOString().slice(0, 10);
    }
  }

  return {
    epicId,
    storyCount: stories.length,
    totalPoints,
    donePoints,
    remainingPoints,
    unestimatedCount,
    avgVelocity: avgVelocity !== null ? Number(avgVelocity.toFixed(2)) : null,
    sprintsRemaining,
    projectedDoneDate,
    insufficientHistory: avgVelocity === null,
  };
}

/**
 * Portfolio-level counterpart to forecastEpic(): the whole not-done
 * backlog's remaining points against average velocity, for "at this rate,
 * how many more sprints to clear everything" — a coarser, epic-agnostic
 * view (roadmap Fase 4 "capacity planning"). Deliberately doesn't attempt
 * per-person capacity: the architecture plan (§7) treats team-member
 * availability as sensitive data that belongs in the optional,
 * git-ignored `people/` directory, not something this function should
 * assume exists.
 */
function forecastBacklog(projectRoot) {
  const isDone = (s) => String(s.status || '').toLowerCase() === 'done';
  const remainingPoints = listStories(projectRoot)
    .filter((s) => !isDone(s))
    .reduce((sum, s) => sum + (typeof s.story_points === 'number' ? s.story_points : 0), 0);

  const avgVelocity = averageCompletedVelocity(projectRoot);
  const sprintsRemaining = avgVelocity && avgVelocity > 0 ? Math.ceil(remainingPoints / avgVelocity) : null;

  return {
    remainingPoints,
    avgVelocity: avgVelocity !== null ? Number(avgVelocity.toFixed(2)) : null,
    sprintsRemaining,
    insufficientHistory: avgVelocity === null,
  };
}

/**
 * Two cycles are "the same" if they visit the same set of stories,
 * regardless of which one the search happened to start from.
 */
function sameCycle(a, b) {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

/**
 * Derive a dependency overview from every story's `dependencies` field —
 * this is itself a derived view (architecture plan §5's "board is always
 * derived" principle applied one level down): nothing here is stored,
 * it's recomputed from the story files every time.
 *
 * Surfaces three things a person can't easily see just by reading story
 * files one at a time: a reference to a story id that doesn't exist, a
 * circular dependency (A needs B needs A — which can never be resolved by
 * finishing one at a time), and a story that's blocked because something
 * it depends on isn't done yet.
 */
function getDependencyOverview(projectRoot) {
  const stories = listStories(projectRoot);
  const byId = new Map(stories.map((s) => [s.id, s]));

  const edges = [];
  const unknownReferences = [];
  stories.forEach((s) => {
    (s.dependencies || []).forEach((depId) => {
      if (!byId.has(depId)) {
        unknownReferences.push({ from: s.id, to: depId });
      } else {
        edges.push({ from: s.id, to: depId });
      }
    });
  });

  const graph = new Map(stories.map((s) => [s.id, []]));
  edges.forEach((e) => graph.get(e.from).push(e.to));

  const cycles = [];
  const visited = new Set();
  const stack = [];
  const onStack = new Set();

  function dfs(node) {
    visited.add(node);
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) || []) {
      if (!visited.has(next)) {
        dfs(next);
      } else if (onStack.has(next)) {
        const idx = stack.indexOf(next);
        const cyclePath = stack.slice(idx);
        if (!cycles.some((c) => sameCycle(c, cyclePath))) {
          cycles.push(cyclePath);
        }
      }
    }
    stack.pop();
    onStack.delete(node);
  }

  stories.forEach((s) => {
    if (!visited.has(s.id)) dfs(s.id);
  });

  const isDone = (s) => String(s?.status || '').toLowerCase() === 'done';

  const blocked = stories
    .filter((s) => !isDone(s))
    .map((s) => ({
      id: s.id,
      title: s.title,
      blockedBy: (s.dependencies || []).filter((depId) => byId.has(depId) && !isDone(byId.get(depId))),
    }))
    .filter((entry) => entry.blockedBy.length > 0);

  return {
    nodes: stories.map((s) => ({ id: s.id, title: s.title, status: s.status })),
    edges,
    unknownReferences,
    cycles,
    blocked,
  };
}

/**
 * Read engineering/architecture.md — a single free-text doc, not a
 * per-entity file, so there's no id/list to manage. Read-only for now:
 * it's meant to be a considered write-up, not something to edit through
 * quick form fields.
 */
function getArchitectureDoc(projectRoot) {
  const fp = path.join(projectRoot, 'engineering', 'architecture.md');
  if (!fs.existsSync(fp)) {
    return null;
  }
  return readEntity(fp);
}

/** List Architecture Decision Records from engineering/decisions/. */
function listADRs(projectRoot) {
  return scanEntityFiles(path.join(projectRoot, 'engineering', 'decisions'), 'adr').items;
}

/** Find an ADR by its `id` frontmatter field (e.g. "ADR-001"). */
function getADR(projectRoot, id) {
  return findEntityByIdOrThrow(path.join(projectRoot, 'engineering', 'decisions'), id, 'adr');
}

/**
 * Split a history log (milestones.md / lessons-learned.md) into entries.
 * These files are plain append-only logs, not per-entity files with
 * frontmatter — each entry is just a "## <date> — <title>" heading
 * followed by free text, so parsing means splitting on those headings.
 */
function parseHistoryEntries(raw) {
  const lines = raw.split('\n');
  const entries = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) entries.push(current);
      current = { heading: line.slice(3).trim(), bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) entries.push(current);

  return entries.map((e) => ({ heading: e.heading, body: e.bodyLines.join('\n').trim() }));
}

function readHistoryFile(projectRoot, filename) {
  const fp = path.join(projectRoot, 'history', filename);
  if (!fs.existsSync(fp)) {
    return { filePath: fp, raw: '', entries: [] };
  }
  const raw = fs.readFileSync(fp, 'utf-8');
  return { filePath: fp, raw, entries: parseHistoryEntries(raw) };
}

/**
 * Append a new dated entry to a history log, creating the file (with a
 * top-level heading) if it doesn't exist yet. The date is today's date —
 * these are logs of when something was recorded, not editable metadata,
 * so there's no separate date field to fill in.
 */
function appendHistoryEntry(projectRoot, filename, { title, body } = {}, defaultHeader) {
  if (!title || !title.trim()) {
    throw new Error('title is verplicht');
  }

  const dir = path.join(projectRoot, 'history');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, filename);

  const existing = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf-8') : defaultHeader;
  const date = new Date().toISOString().slice(0, 10);
  const section = `## ${date} — ${title.trim()}\n\n${body && body.trim() ? `${body.trim()}\n` : ''}`;
  const combined = `${existing.replace(/\n+$/, '')}\n\n${section}`;
  fs.writeFileSync(fp, `${combined.trimEnd()}\n`, 'utf-8');

  return readHistoryFile(projectRoot, filename);
}

function getMilestones(projectRoot) {
  return readHistoryFile(projectRoot, 'milestones.md');
}

function getLessonsLearned(projectRoot) {
  return readHistoryFile(projectRoot, 'lessons-learned.md');
}

function addMilestone(projectRoot, data) {
  return appendHistoryEntry(projectRoot, 'milestones.md', data, '# Milestones\n');
}

function addLesson(projectRoot, data) {
  return appendHistoryEntry(projectRoot, 'lessons-learned.md', data, '# Lessons Learned\n');
}

/**
 * Parse a board config file (e.g. scrum/views/kanban-board.md).
 * Only reads the "## Columns" bullet list — this file is config only,
 * never card data (per architecture plan §5).
 */
function parseBoardConfig(projectRoot, configFile = 'kanban-board.md') {
  const fp = path.join(projectRoot, 'scrum', 'views', configFile);
  if (!fs.existsSync(fp)) {
    return { columns: [] };
  }

  const raw = fs.readFileSync(fp, 'utf-8');
  const lines = raw.split('\n');
  const columns = [];
  let inColumns = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^##\s+columns/i.test(line)) {
      inColumns = true;
      continue;
    }
    if (inColumns && line.startsWith('##')) {
      inColumns = false;
      continue;
    }
    if (inColumns && line.startsWith('-')) {
      const label = line.replace(/^-+\s*/, '');
      const wipMatch = label.match(/\(WIP:\s*(\d+)\)/i);
      const name = label.replace(/\s*\(WIP:\s*\d+\)/i, '').trim();
      const slug = name.toLowerCase().trim().replace(/\s+/g, '-');
      columns.push({ name, slug, wip: wipMatch ? parseInt(wipMatch[1], 10) : null });
    }
  }

  return { columns };
}

/**
 * Compute the board: columns come from config, cards are derived from
 * every story's `status` field. Nothing about card position is ever
 * stored — it's recalculated on every call, so the board can never go
 * out of sync with the story files.
 */
function computeBoard(projectRoot, configFile = 'kanban-board.md') {
  const { columns } = parseBoardConfig(projectRoot, configFile);
  const stories = listStories(projectRoot);

  const board = columns.map((col) => ({ ...col, cards: [] }));
  const unassigned = [];

  for (const story of stories) {
    const slug = String(story.status || '').toLowerCase();
    const card = {
      id: story.id,
      title: story.title,
      status: story.status,
      priority: story.priority,
      story_points: story.story_points,
      epic: story.epic,
      sprint: story.sprint,
      type: story.type || 'story',
      _version: story._version,
    };
    const col = board.find((c) => c.slug === slug);
    if (col) {
      col.cards.push(card);
    } else {
      unassigned.push(card);
    }
  }

  return { columns: board, unassigned };
}

/**
 * Consolidated "what's broken" report across every schema-validated
 * entity kind (stories, epics, tasks, sprints, ADRs) — the single place
 * that turns scanEntityFiles()'s per-directory results into one list, so
 * the app can show a dedicated "Validatie" view instead of a broken file
 * just quietly not appearing on the board (architecture plan §8 risk #2).
 * Covers both kinds of problem: a file whose YAML couldn't be parsed at
 * all, and a file that parsed fine but is missing/mistyped a required
 * field. Read-only — this never writes anything, it only reports.
 */
function getValidationReport(projectRoot) {
  const targets = [
    { dir: path.join(projectRoot, 'product', 'stories'), kind: 'story' },
    { dir: path.join(projectRoot, 'product', 'epics'), kind: 'epic' },
    { dir: path.join(projectRoot, 'execution', 'tasks'), kind: 'task' },
    { dir: path.join(projectRoot, 'scrum', 'sprints'), kind: 'sprint', filterFile: NOT_RETRO },
    { dir: path.join(projectRoot, 'engineering', 'decisions'), kind: 'adr' },
  ];

  const issues = [];
  for (const { dir, kind, filterFile } of targets) {
    const { items, brokenFiles } = scanEntityFiles(dir, kind, { filterFile });
    brokenFiles.forEach((b) => issues.push({ ...b, id: null }));
    items.forEach((item) => {
      if (item._validationErrors && item._validationErrors.length) {
        issues.push({ file: item._file, kind, id: item.id || null, errors: item._validationErrors });
      }
    });
  }
  return issues;
}

/**
 * List pending AI proposals sitting in staging/ (everything except the
 * README that explains the folder). Same shape as listStories() so the
 * UI can render them with the same card component. A proposal can be of
 * any kind (`proposal_type`), so unlike scanEntityFiles() above there's no
 * single schema to validate against here — but a proposal with broken
 * YAML still needs to show up so a human can reject it, rather than
 * silently vanishing from the review list (architecture plan §6.4: every
 * proposal needs an explicit human decision, and you can't decide on
 * something you can't see).
 */
function listStagingProposals(projectRoot) {
  const dir = path.join(projectRoot, 'staging');
  return listMarkdownFiles(dir)
    .filter((fp) => path.basename(fp).toLowerCase() !== 'readme.md')
    .map((fp) => {
      try {
        const { frontmatter, body, _version } = readEntity(fp);
        return { ...frontmatter, _file: path.basename(fp), _body: body, _version };
      } catch (err) {
        return {
          id: path.basename(fp, '.md'),
          title: '(kapotte YAML-frontmatter — kan niet gelezen worden)',
          _file: path.basename(fp),
          _body: '',
          _broken: true,
          _error: err.message,
        };
      }
    });
}

/**
 * Every kind of proposal a staging file can become once accepted, keyed
 * by its `proposal_type` frontmatter field. Defaults to 'story' so every
 * proposal written before this field existed keeps working unchanged.
 * Adding a new agent role that stages a new kind of entity (e.g. an
 * architect drafting ADRs) means adding one line here — the accept/reject
 * review flow itself never has to change.
 */
const STAGING_DESTINATIONS = {
  story: (projectRoot) => path.join(projectRoot, 'product', 'stories'),
  epic: (projectRoot) => path.join(projectRoot, 'product', 'epics'),
  adr: (projectRoot) => path.join(projectRoot, 'engineering', 'decisions'),
};

/**
 * Best-effort fallback for staging files written before `proposal_type`
 * was set explicitly (e.g. epic proposals from the backlog-bootstrapping
 * skill) or that simply omitted it: infer from the `id` prefix rather
 * than silently defaulting to 'story', which previously misclassified
 * `EPIC-XXX-...` proposals as stories and made them fail story-schema
 * validation (id pattern `/^STORY-/`) instead of epic-schema validation.
 * Only ever a fallback — an explicit `proposal_type` field always wins.
 */
function inferProposalTypeFromId(id) {
  if (typeof id !== 'string') return null;
  if (/^EPIC-/.test(id)) return 'epic';
  if (/^ADR-/.test(id)) return 'adr';
  if (/^STORY-/.test(id)) return 'story';
  return null;
}

/**
 * Append one line to `audit/ai-events.jsonl` (architecture plan §7): a
 * log, never a source of truth, purely for traceability of what AI
 * agents proposed and whether a human approved it. Logged here, at
 * accept/reject time, rather than trusting each skill to remember to —
 * every staging decision goes through these two functions no matter
 * which role or skill created the proposal, so the log can't be skipped.
 */
function logAuditEvent(projectRoot, event) {
  const dir = path.join(projectRoot, 'audit');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, 'ai-events.jsonl');
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...event });
  fs.appendFileSync(fp, `${line}\n`, 'utf-8');
}

/** Read and parse every line of audit/ai-events.jsonl (empty array if the file doesn't exist yet). */
function listAuditEvents(projectRoot) {
  const fp = path.join(projectRoot, 'audit', 'ai-events.jsonl');
  if (!fs.existsSync(fp)) return [];
  return fs
    .readFileSync(fp, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/**
 * Accept a staging proposal: move the file into its destination (by
 * default product/stories/, or wherever STAGING_DESTINATIONS says for
 * this proposal's `proposal_type`) — the only moment it becomes source
 * of truth (architecture plan §6.4). Never edits the content — accept is
 * a pure move, nothing else.
 */
function acceptStagingProposal(projectRoot, file) {
  const src = path.join(projectRoot, 'staging', file);
  if (!fs.existsSync(src)) {
    throw new Error(`Staging file not found: ${file}`);
  }
  const { frontmatter } = readEntity(src);
  if (!frontmatter.id) {
    throw new Error(`Staging file has no id: ${file}`);
  }
  const proposalType = frontmatter.proposal_type || inferProposalTypeFromId(frontmatter.id) || 'story';
  const destDirFn = STAGING_DESTINATIONS[proposalType];
  if (!destDirFn) {
    throw new Error(`Unknown proposal_type: ${proposalType}`);
  }
  const schemaErrors = validateFrontmatter(proposalType, frontmatter);
  if (schemaErrors.length) {
    throw new ValidationError(
      `Kan voorstel ${file} niet accepteren, het voldoet niet aan het ${proposalType}-schema: ${schemaErrors.join('; ')}`,
      schemaErrors
    );
  }
  const destDir = destDirFn(projectRoot);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, `${frontmatter.id}.md`);
  if (fs.existsSync(dest)) {
    throw new Error(`A ${proposalType} with id ${frontmatter.id} already exists in ${path.relative(projectRoot, destDir)}`);
  }
  // review_status/review_note (see requestStagingChange below) are review
  // bookkeeping for the human ↔ AI conversation while a proposal sits in
  // staging/ — once accepted they're no longer relevant, and leaving them
  // in would put unknown fields into the entity that's now source of
  // truth. Rewrite the file without them rather than a plain rename
  // whenever either is present; otherwise keep the pure-rename behavior.
  let finalFrontmatter = frontmatter;
  if ('review_status' in frontmatter || 'review_note' in frontmatter) {
    const { review_status, review_note, ...cleanFrontmatter } = frontmatter;
    const { body } = readEntity(src);
    writeEntity(src, cleanFrontmatter, body);
    fs.renameSync(src, dest);
    finalFrontmatter = cleanFrontmatter;
  } else {
    fs.renameSync(src, dest);
  }
  logAuditEvent(projectRoot, {
    agent: frontmatter.generated_by || 'unknown',
    action: `accept_${proposalType}_proposal`,
    id: frontmatter.id,
    approved: true,
  });
  return { filePath: dest, frontmatter: finalFrontmatter };
}

/** Reject a staging proposal: just delete the file, nothing else touched. */
function rejectStagingProposal(projectRoot, file) {
  const src = path.join(projectRoot, 'staging', file);
  if (!fs.existsSync(src)) {
    throw new Error(`Staging file not found: ${file}`);
  }
  let frontmatter = {};
  try {
    frontmatter = readEntity(src).frontmatter;
  } catch (e) {
    // malformed frontmatter shouldn't block a reject — still logged below with what we know
  }
  fs.unlinkSync(src);
  logAuditEvent(projectRoot, {
    agent: frontmatter.generated_by || 'unknown',
    action: `reject_${frontmatter.proposal_type || 'story'}_proposal`,
    id: frontmatter.id || null,
    approved: false,
  });
  return { removed: file };
}

/**
 * Record a human-requested change on a staging proposal without accepting
 * or rejecting it — the third outcome alongside accept/reject (architecture
 * plan §6.4 only ever anticipated those two). The proposal stays in
 * `staging/`; `review_note` carries the human's requested change or
 * question, and `review_status: changes_requested` makes it discoverable —
 * both by the UI (badge on the card) and by an agent reading `staging/`
 * directly to build an action plan across every flagged proposal at once,
 * instead of resolving each one through a live back-and-forth. Passing an
 * empty/blank note clears the flag again (e.g. after the proposal was
 * revised and the note no longer applies) rather than requiring a separate
 * "clear" action.
 */
function requestStagingChange(projectRoot, file, note) {
  const src = path.join(projectRoot, 'staging', file);
  if (!fs.existsSync(src)) {
    throw new Error(`Staging file not found: ${file}`);
  }
  const { frontmatter, body } = readEntity(src);
  const trimmed = typeof note === 'string' ? note.trim() : '';
  const { review_status, review_note, ...rest } = frontmatter;
  const newFrontmatter = trimmed
    ? { ...rest, review_status: 'changes_requested', review_note: trimmed }
    : rest;
  writeEntity(src, newFrontmatter, body);
  logAuditEvent(projectRoot, {
    agent: 'human',
    action: `request_change_${frontmatter.proposal_type || 'story'}_proposal`,
    id: frontmatter.id || null,
    approved: null,
    note: trimmed || null,
  });
  return { ...newFrontmatter, _file: file, _body: body };
}

module.exports = {
  ConflictError,
  ValidationError,
  validateFrontmatter,
  getValidationReport,
  readEntity,
  writeEntity,
  findGitRepoRoot,
  parseEntityReferences,
  syncGitCommits,
  listStories,
  listEpics,
  listTasks,
  listTasksForStory,
  getStoryCommitTrail,
  listSprints,
  getStory,
  getEpic,
  getTask,
  getSprint,
  updateStory,
  createEpic,
  updateEpic,
  createTask,
  updateTask,
  createSprint,
  updateSprint,
  getSprintSummary,
  computeVelocity,
  writeVelocitySnapshot,
  computeCycleTime,
  forecastEpic,
  forecastBacklog,
  getDependencyOverview,
  getArchitectureDoc,
  listADRs,
  getADR,
  getMilestones,
  getLessonsLearned,
  addMilestone,
  addLesson,
  parseBoardConfig,
  computeBoard,
  listStagingProposals,
  acceptStagingProposal,
  rejectStagingProposal,
  requestStagingChange,
  logAuditEvent,
  listAuditEvents,
  STORY_UPDATABLE_FIELDS,
  EPIC_UPDATABLE_FIELDS,
  TASK_UPDATABLE_FIELDS,
  SPRINT_UPDATABLE_FIELDS,
};
