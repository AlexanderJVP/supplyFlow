'use strict';

/**
 * Thin API wrapper around the engine. This file should never contain
 * business logic (no markdown/frontmatter parsing, no board math) —
 * only routing, request/response shaping, and error handling. That
 * logic lives in ../engine so it can be reused outside Express later.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const engine = require('../engine');

/**
 * Tiny .env loader (no dependency): if app/.env exists, read KEY=VALUE
 * lines from it and set them on process.env, without overriding anything
 * already set in the real shell environment. This is the only place that
 * reads the file — nothing else in the app knows it exists.
 */
function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

const PROJECT_ROOT = process.env.PROJECT_ROOT || path.join(__dirname, '..', '..', '.project');
const PORT = process.env.PORT || 3456;

/**
 * Shared error → HTTP status mapping for every write route: a version
 * conflict (optimistic locking) is 409, a schema validation failure is
 * 422 (the request was well-formed but the resulting data isn't valid —
 * distinct from a generic 400), and anything else falls back to 400. Both
 * typed errors carry structured detail (`current` / `details`) alongside
 * the message so the UI can do more than just print a string if it wants
 * to.
 */
function sendWriteError(res, err) {
  if (err.code === 'VERSION_CONFLICT') {
    return res.status(409).json({ error: err.message, code: err.code, current: err.current });
  }
  if (err.code === 'VALIDATION_ERROR') {
    return res.status(422).json({ error: err.message, code: err.code, details: err.details });
  }
  return res.status(400).json({ error: err.message });
}

/**
 * Single-entity GET routes normally 500 on an unexpected error, but a
 * ValidationError here means "this specific file exists but its YAML is
 * broken" (findEntityByIdOrThrow's peek-and-rethrow, see engine/index.js)
 * — that's a data problem, not a server bug, so it gets the same 422 a
 * failed write would.
 */
function sendReadError(res, err) {
  if (err.code === 'VALIDATION_ERROR') {
    return res.status(422).json({ error: err.message, code: err.code, details: err.details });
  }
  return res.status(500).json({ error: err.message });
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'web')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, projectRoot: PROJECT_ROOT });
});

app.get('/api/board', (req, res) => {
  try {
    res.json(engine.computeBoard(PROJECT_ROOT));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stories', (req, res) => {
  try {
    res.json(engine.listStories(PROJECT_ROOT));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stories/:id', (req, res) => {
  try {
    const story = engine.getStory(PROJECT_ROOT, req.params.id);
    if (!story) return res.status(404).json({ error: 'not found' });
    res.json({ ...story.frontmatter, _body: story.body, _version: story._version, _validationErrors: story._validationErrors });
  } catch (err) {
    sendReadError(res, err);
  }
});

app.put('/api/stories/:id', (req, res) => {
  try {
    const updated = engine.updateStory(PROJECT_ROOT, req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    sendWriteError(res, err);
  }
});

app.get('/api/stories/:id/commits', (req, res) => {
  try {
    const trail = engine.getStoryCommitTrail(PROJECT_ROOT, req.params.id);
    if (!trail) return res.status(404).json({ error: 'not found' });
    res.json(trail);
  } catch (err) {
    sendReadError(res, err);
  }
});

app.get('/api/epics', (req, res) => {
  try {
    res.json(engine.listEpics(PROJECT_ROOT));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/epics/:id', (req, res) => {
  try {
    const epic = engine.getEpic(PROJECT_ROOT, req.params.id);
    if (!epic) return res.status(404).json({ error: 'not found' });
    res.json({ ...epic.frontmatter, _body: epic.body, _version: epic._version, _validationErrors: epic._validationErrors });
  } catch (err) {
    sendReadError(res, err);
  }
});

app.post('/api/epics', (req, res) => {
  try {
    res.json(engine.createEpic(PROJECT_ROOT, req.body));
  } catch (err) {
    sendWriteError(res, err);
  }
});

app.put('/api/epics/:id', (req, res) => {
  try {
    res.json(engine.updateEpic(PROJECT_ROOT, req.params.id, req.body));
  } catch (err) {
    sendWriteError(res, err);
  }
});

app.get('/api/tasks', (req, res) => {
  try {
    const { story } = req.query;
    res.json(story ? engine.listTasksForStory(PROJECT_ROOT, story) : engine.listTasks(PROJECT_ROOT));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tasks/:id', (req, res) => {
  try {
    const task = engine.getTask(PROJECT_ROOT, req.params.id);
    if (!task) return res.status(404).json({ error: 'not found' });
    res.json({ ...task.frontmatter, _body: task.body, _version: task._version, _validationErrors: task._validationErrors });
  } catch (err) {
    sendReadError(res, err);
  }
});

app.post('/api/tasks', (req, res) => {
  try {
    res.json(engine.createTask(PROJECT_ROOT, req.body));
  } catch (err) {
    sendWriteError(res, err);
  }
});

app.put('/api/tasks/:id', (req, res) => {
  try {
    res.json(engine.updateTask(PROJECT_ROOT, req.params.id, req.body));
  } catch (err) {
    sendWriteError(res, err);
  }
});

app.get('/api/sprints', (req, res) => {
  try {
    res.json(engine.listSprints(PROJECT_ROOT));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sprints/:id', (req, res) => {
  try {
    const sprint = engine.getSprint(PROJECT_ROOT, req.params.id);
    if (!sprint) return res.status(404).json({ error: 'not found' });
    res.json({ ...sprint.frontmatter, _body: sprint.body, _version: sprint._version, _validationErrors: sprint._validationErrors });
  } catch (err) {
    sendReadError(res, err);
  }
});

app.get('/api/sprints/:id/summary', (req, res) => {
  try {
    res.json(engine.getSprintSummary(PROJECT_ROOT, req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.post('/api/sprints', (req, res) => {
  try {
    res.json(engine.createSprint(PROJECT_ROOT, req.body));
  } catch (err) {
    sendWriteError(res, err);
  }
});

app.put('/api/sprints/:id', (req, res) => {
  try {
    res.json(engine.updateSprint(PROJECT_ROOT, req.params.id, req.body));
  } catch (err) {
    sendWriteError(res, err);
  }
});

app.get('/api/analytics/velocity', (req, res) => {
  try {
    res.json(engine.computeVelocity(PROJECT_ROOT));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/analytics/velocity/snapshot', (req, res) => {
  try {
    res.json(engine.writeVelocitySnapshot(PROJECT_ROOT));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/cycle-time', (req, res) => {
  try {
    res.json(engine.computeCycleTime(PROJECT_ROOT));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/forecast/backlog', (req, res) => {
  try {
    res.json(engine.forecastBacklog(PROJECT_ROOT));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/analytics/forecast/epics/:id', (req, res) => {
  try {
    res.json(engine.forecastEpic(PROJECT_ROOT, req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get('/api/dependencies', (req, res) => {
  try {
    res.json(engine.getDependencyOverview(PROJECT_ROOT));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/architecture', (req, res) => {
  try {
    const doc = engine.getArchitectureDoc(PROJECT_ROOT);
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json({ body: doc.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/decisions', (req, res) => {
  try {
    res.json(engine.listADRs(PROJECT_ROOT));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/decisions/:id', (req, res) => {
  try {
    const adr = engine.getADR(PROJECT_ROOT, req.params.id);
    if (!adr) return res.status(404).json({ error: 'not found' });
    res.json({ ...adr.frontmatter, _body: adr.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/milestones', (req, res) => {
  try {
    res.json(engine.getMilestones(PROJECT_ROOT));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/milestones', (req, res) => {
  try {
    res.json(engine.addMilestone(PROJECT_ROOT, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/lessons-learned', (req, res) => {
  try {
    res.json(engine.getLessonsLearned(PROJECT_ROOT));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/lessons-learned', (req, res) => {
  try {
    res.json(engine.addLesson(PROJECT_ROOT, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/audit', (req, res) => {
  try {
    res.json(engine.listAuditEvents(PROJECT_ROOT));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/git/sync', (req, res) => {
  try {
    res.json(engine.syncGitCommits(PROJECT_ROOT));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/staging', (req, res) => {
  try {
    res.json(engine.listStagingProposals(PROJECT_ROOT));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/staging/:file/accept', (req, res) => {
  try {
    res.json(engine.acceptStagingProposal(PROJECT_ROOT, req.params.file));
  } catch (err) {
    sendWriteError(res, err);
  }
});

app.get('/api/validation', (req, res) => {
  try {
    res.json(engine.getValidationReport(PROJECT_ROOT));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/staging/:file/reject', (req, res) => {
  try {
    res.json(engine.rejectStagingProposal(PROJECT_ROOT, req.params.file));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/staging/:file/request-change', (req, res) => {
  try {
    res.json(engine.requestStagingChange(PROJECT_ROOT, req.params.file, req.body.note));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Scrum app running at http://localhost:${PORT}`);
  console.log(`Project root: ${PROJECT_ROOT}`);
});
