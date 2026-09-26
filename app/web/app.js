// This file talks ONLY to the server's /api/* endpoints. It never touches
// the filesystem directly — that separation is the whole point (see
// app/README.md): UI -> server (thin) -> engine (pure logic).

const state = {
  board: null,
  currentStoryId: null,
  currentStoryVersion: null,
  currentEpicId: null,
  currentEpicVersion: null,
  currentTaskId: null,
  currentTaskVersion: null,
  currentSprintId: null,
  currentSprintVersion: null,
  filters: { search: '', epic: '', priority: '', sprint: '' },
};

/**
 * Turn a failed fetch response into an Error carrying the server's status,
 * error code, and (for a 409 version conflict) the current server-side
 * entity — so callers can tell a plain validation failure (400) apart from
 * someone else having changed the same file since it was opened here.
 */
async function parseApiError(res) {
  let body = {};
  try {
    body = await res.json();
  } catch (e) {
    // no JSON body — fall through to the generic message below
  }
  const err = new Error(body.error || `Server gaf ${res.status} terug`);
  err.status = res.status;
  err.code = body.code;
  err.current = body.current;
  return err;
}

/**
 * A save hit a 409 version conflict: someone else (another tab, a manual
 * edit, an AI agent) changed this file since it was opened here. Ask
 * whether to reload the latest version — that discards whatever's in the
 * open form, so it's a confirmation, not silent — rather than ever writing
 * over their change.
 */
function handleConflict(err, reopen) {
  const reload = confirm(`${err.message}\n\nHerladen? Je eigen wijzigingen in dit formulier gaan dan verloren.`);
  if (reload) {
    reopen();
  } else {
    setStatusLine(err.message, true);
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function setStatusLine(msg, isError) {
  const el = document.getElementById('status-line');
  el.textContent = msg || '';
  el.style.color = isError ? '#bf2600' : '#888';
}

async function fetchBoard() {
  setStatusLine('Laden...');
  try {
    const res = await fetch('/api/board');
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    state.board = await res.json();
    populateSprintFilterOptions();
    render();
    setStatusLine(`Laatst ververst: ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    setStatusLine(`Kon board niet laden: ${err.message}`, true);
  }
}

/** Rebuild the sprint filter's options from whatever sprint values actually
 * appear on the board right now, keeping the current selection if it's
 * still a valid option. */
function populateSprintFilterOptions() {
  const select = document.getElementById('sprint-filter');
  const allCards = [
    ...(state.board.columns || []).flatMap((c) => c.cards),
    ...(state.board.unassigned || []),
  ];
  const sprints = Array.from(new Set(allCards.map((c) => c.sprint).filter(Boolean))).sort();

  const previous = state.filters.sprint;
  select.innerHTML = '<option value="">Alle sprints</option>';
  sprints.forEach((sprint) => {
    const opt = document.createElement('option');
    opt.value = sprint;
    opt.textContent = sprint;
    select.appendChild(opt);
  });

  if (sprints.includes(previous)) {
    select.value = previous;
  } else {
    state.filters.sprint = '';
  }
}

/** Does this card match the currently active search/epic/priority/sprint filters? */
function cardMatchesFilters(card) {
  const f = state.filters;
  if (f.search) {
    const haystack = `${card.id} ${card.title || ''}`.toLowerCase();
    if (!haystack.includes(f.search.toLowerCase())) return false;
  }
  if (f.epic && card.epic !== f.epic) return false;
  if (f.priority && card.priority !== f.priority) return false;
  if (f.sprint && card.sprint !== f.sprint) return false;
  return true;
}

function hasActiveFilters() {
  const f = state.filters;
  return Boolean(f.search || f.epic || f.priority || f.sprint);
}

/** Build a column heading like "Backlog (2 van 5)" or "Backlog (5, WIP 5/3)". */
function columnHeadingLabel(name, visibleCount, totalCount, wip, filtering) {
  const countPart = filtering ? `${visibleCount} van ${totalCount}` : `${totalCount}`;
  const wipPart = wip !== null ? `, WIP ${totalCount}/${wip}` : '';
  return `${name} (${countPart}${wipPart})`;
}

function render() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  const statusSelect = document.getElementById('status-select');
  statusSelect.innerHTML = '';

  const filtering = hasActiveFilters();

  (state.board.columns || []).forEach((col) => {
    // WIP limits are about real work in progress, so they're always checked
    // against the true card count — never against the filtered-down view.
    const overWip = col.wip !== null && col.cards.length > col.wip;
    const visibleCards = col.cards.filter(cardMatchesFilters);

    const colEl = document.createElement('div');
    colEl.className = 'column' + (overWip ? ' over-wip' : '');
    const heading = document.createElement('h2');
    heading.textContent = columnHeadingLabel(col.name, visibleCards.length, col.cards.length, col.wip, filtering);
    colEl.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'card-list';
    list.dataset.slug = col.slug;
    visibleCards.forEach((card) => list.appendChild(renderCard(card)));
    colEl.appendChild(list);
    makeDropTarget(list, col.slug);

    boardEl.appendChild(colEl);

    const opt = document.createElement('option');
    opt.value = col.slug;
    opt.textContent = col.name;
    statusSelect.appendChild(opt);
  });

  const visibleUnassigned = (state.board.unassigned || []).filter(cardMatchesFilters);
  if (state.board.unassigned && state.board.unassigned.length) {
    const colEl = document.createElement('div');
    colEl.className = 'column';
    const heading = document.createElement('h2');
    const countLabel = filtering
      ? `${visibleUnassigned.length}/${state.board.unassigned.length}`
      : `${state.board.unassigned.length}`;
    heading.textContent = `Niet toegewezen (${countLabel})`;
    colEl.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'card-list';
    visibleUnassigned.forEach((card) => list.appendChild(renderCard(card, true)));
    colEl.appendChild(list);

    boardEl.appendChild(colEl);
  }
}

function renderCard(card, showStatus) {
  const cardEl = document.createElement('div');
  cardEl.className = 'card';
  cardEl.draggable = true;
  cardEl.dataset.id = card.id;
  cardEl.innerHTML = `
    <div class="card-title">${escapeHtml(card.title || card.id)}</div>
    <div class="card-meta">${escapeHtml(card.id)} · ${escapeHtml(card.priority || '-')} · ${card.story_points ?? '-'} pts${showStatus ? ` · status: ${escapeHtml(card.status || '-')}` : ''}</div>
  `;
  cardEl.addEventListener('click', () => openStory(card.id));
  cardEl.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', card.id);
    e.dataTransfer.effectAllowed = 'move';
    cardEl.classList.add('dragging');
  });
  cardEl.addEventListener('dragend', () => cardEl.classList.remove('dragging'));
  return cardEl;
}

/** Wire up a card-list element as a place cards can be dropped onto. */
function makeDropTarget(listEl, slug) {
  listEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    listEl.classList.add('drag-over');
  });
  listEl.addEventListener('dragleave', () => listEl.classList.remove('drag-over'));
  listEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    listEl.classList.remove('drag-over');
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    await moveStoryToStatus(id, slug);
  });
}

/** Find a card's current _version from the last-fetched board, by id. */
function findCardVersion(id) {
  const allCards = [
    ...(state.board?.columns || []).flatMap((c) => c.cards),
    ...(state.board?.unassigned || []),
  ];
  return allCards.find((c) => c.id === id)?._version;
}

async function moveStoryToStatus(id, status) {
  try {
    const res = await fetch(`/api/stories/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, expectedVersion: findCardVersion(id) }),
    });
    if (!res.ok) throw await parseApiError(res);
    fetchBoard();
  } catch (err) {
    if (err.code === 'VERSION_CONFLICT') {
      setStatusLine(`${err.message} Bord ververst.`, true);
      fetchBoard();
    } else {
      setStatusLine(`Verplaatsen mislukt: ${err.message}`, true);
    }
  }
}

async function openStory(id) {
  try {
    const res = await fetch(`/api/stories/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    const story = await res.json();

    state.currentStoryId = id;
    state.currentStoryVersion = story._version;
    document.getElementById('modal-title').textContent = `${story.id} — ${story.title || ''}`;

    const form = document.getElementById('story-form');
    form.title.value = story.title || '';
    form.status.value = story.status || '';
    form.priority.value = story.priority || 'medium';
    form.story_points.value = story.story_points ?? '';
    form.epic.value = story.epic || '';
    form.sprint.value = story.sprint || '';
    form.dependencies.value = Array.isArray(story.dependencies) ? story.dependencies.join(', ') : '';
    form.body.value = story._body || '';

    document.getElementById('modal-overlay').classList.remove('hidden');
    fetchTasksForStory(id);
    fetchStoryCommitTrail(id);
  } catch (err) {
    setStatusLine(`Kon story niet openen: ${err.message}`, true);
  }
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  state.currentStoryId = null;
  state.currentStoryVersion = null;
}

document.getElementById('cancel-btn').addEventListener('click', closeModal);
document.getElementById('refresh-btn').addEventListener('click', fetchBoard);

/**
 * Scan git log for TASK-XXX references (architecture plan §8 risk #4):
 * a bare "TASK-003" links that commit to the task, "closes/fixes/resolves
 * TASK-003" additionally moves it to done. Writes go straight to the task
 * files (no staging — see the comment on syncGitCommits() in the engine),
 * so this refreshes the audit log and, if a story's task list happens to
 * be open right now, that list too.
 */
document.getElementById('git-sync-btn').addEventListener('click', async () => {
  const btn = document.getElementById('git-sync-btn');
  btn.disabled = true;
  setStatusLine('Git log wordt gescand...');
  try {
    const res = await fetch('/api/git/sync', { method: 'POST' });
    if (!res.ok) throw await parseApiError(res);
    const result = await res.json();

    const parts = [`${result.commitsScanned} commit(s) gescand`];
    parts.push(
      result.updatedTasks.length
        ? `${result.updatedTasks.length} taak/taken bijgewerkt (${result.updatedTasks.map((t) => t.id).join(', ')})`
        : 'geen taken bijgewerkt'
    );
    parts.push(
      result.updatedStories.length
        ? `${result.updatedStories.length} story/stories gekoppeld (${result.updatedStories.map((s) => s.id).join(', ')})`
        : 'geen stories gekoppeld'
    );
    if (result.unknownTaskRefs.length) {
      parts.push(`onbekende taakreferenties: ${result.unknownTaskRefs.join(', ')}`);
    }
    if (result.unknownStoryRefs.length) {
      parts.push(`onbekende storyreferenties: ${result.unknownStoryRefs.join(', ')}`);
    }
    setStatusLine(`Git sync: ${parts.join(' · ')}`);

    fetchAudit();
    if (state.currentStoryId) {
      fetchTasksForStory(state.currentStoryId);
      fetchStoryCommitTrail(state.currentStoryId);
    }
  } catch (err) {
    setStatusLine(`Git sync mislukt: ${err.message}`, true);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('story-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const updates = {
    title: form.title.value,
    status: form.status.value,
    priority: form.priority.value,
    story_points: form.story_points.value === '' ? null : Number(form.story_points.value),
    epic: form.epic.value,
    sprint: form.sprint.value,
    dependencies: form.dependencies.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    body: form.body.value,
    expectedVersion: state.currentStoryVersion,
  };

  const storyId = state.currentStoryId;
  try {
    const res = await fetch(`/api/stories/${encodeURIComponent(storyId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw await parseApiError(res);
    closeModal();
    fetchBoard();
    fetchDependencies();
  } catch (err) {
    if (err.code === 'VERSION_CONFLICT') {
      handleConflict(err, () => openStory(storyId));
    } else {
      setStatusLine(`Opslaan mislukt: ${err.message}`, true);
    }
  }
});

function renderStagingList(proposals) {
  const container = document.getElementById('staging-list');
  container.innerHTML = '';

  if (!proposals.length) {
    container.innerHTML = '<p class="empty">Geen openstaande AI-voorstellen.</p>';
    return;
  }

  proposals.forEach((p) => {
    const type = p.proposal_type || 'story';
    let metaLine;
    if (type === 'adr') {
      metaLine = `${escapeHtml(p.status || '-')} · ${escapeHtml(p.date || '-')}`;
    } else if (type === 'epic') {
      metaLine = `status: ${escapeHtml(p.status || '-')}`;
    } else {
      metaLine = `status: ${escapeHtml(p.status || '-')} · ${escapeHtml(p.priority || '-')} · ${p.story_points ?? '-'} pts · epic: ${escapeHtml(p.epic || '-')}`;
    }
    // A story proposal landing in the "done" column the moment it's
    // accepted (the reverse-engineering skill marks already-built stories
    // this way, deliberately) should be obvious *before* Accept is
    // clicked, not just afterward on the board — otherwise Accept looks
    // identical for a backlog item and an already-shipped one.
    const doneBadge = String(p.status || '').toLowerCase() === 'done'
      ? '<span class="proposal-done-badge" title="Wordt direct als done geaccepteerd">✓ al gebouwd — gaat naar Done</span>'
      : '';
    // review_note (see requestStagingChange in the engine) is the human's
    // requested change or open question on this specific proposal — shown
    // as a badge + the note itself so it's visible without opening the
    // textarea, and so an agent asked to "process all flagged proposals"
    // can be pointed at this list without a live back-and-forth per item.
    const reviewNoteBlock = p.review_note
      ? `<div class="review-note-flag"><span class="review-note-badge">✏️ wijziging gevraagd</span> ${escapeHtml(p.review_note)}</div>`
      : '';
    const card = document.createElement('div');
    card.className = 'staging-card';
    card.innerHTML = `
      <div class="staging-card-header">
        <span class="proposal-type-badge">${escapeHtml(type)}</span>
        <strong>${escapeHtml(p.id)}</strong> — ${escapeHtml(p.title || '')}
        <span class="card-meta">${metaLine}</span>
        ${doneBadge}
      </div>
      <pre class="staging-body">${escapeHtml(p._body || '')}</pre>
      ${reviewNoteBlock}
      <div class="review-note-form">
        <textarea class="review-note-input" rows="2" placeholder="Aanpassing voorstellen of vraag stellen...">${escapeHtml(p.review_note || '')}</textarea>
        <div class="review-note-form-actions">
          ${p.review_note ? '<button type="button" class="review-note-clear-btn">Wis verzoek</button>' : ''}
          <button type="button" class="review-note-save-btn" data-file="${encodeURIComponent(p._file)}">Aanpassing voorstellen</button>
        </div>
      </div>
      <div class="staging-actions">
        <button type="button" class="reject-btn" data-file="${encodeURIComponent(p._file)}">Verwerpen</button>
        <button type="button" class="accept-btn" data-file="${encodeURIComponent(p._file)}">Accepteren</button>
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll('.accept-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleStagingAction(btn.dataset.file, 'accept'));
  });
  container.querySelectorAll('.reject-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleStagingAction(btn.dataset.file, 'reject'));
  });
  container.querySelectorAll('.review-note-save-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const textarea = btn.closest('.staging-card').querySelector('.review-note-input');
      handleRequestChange(btn.dataset.file, textarea.value);
    });
  });
  container.querySelectorAll('.review-note-clear-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const saveBtn = btn.closest('.staging-card').querySelector('.review-note-save-btn');
      handleRequestChange(saveBtn.dataset.file, '');
    });
  });
}

async function handleStagingAction(encodedFile, action) {
  try {
    const res = await fetch(`/api/staging/${encodedFile}/${action}`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `Server gaf ${res.status} terug`);
    }
    await Promise.all([fetchStaging(), fetchBoard(), fetchDependencies(), fetchAudit()]);
  } catch (err) {
    setStatusLine(`Actie mislukt: ${err.message}`, true);
  }
}

async function handleRequestChange(encodedFile, note) {
  try {
    const res = await fetch(`/api/staging/${encodedFile}/request-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `Server gaf ${res.status} terug`);
    }
    await Promise.all([fetchStaging(), fetchAudit()]);
  } catch (err) {
    setStatusLine(`Actie mislukt: ${err.message}`, true);
  }
}

async function fetchStaging() {
  try {
    const res = await fetch('/api/staging');
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    const proposals = await res.json();
    renderStagingList(proposals);
  } catch (err) {
    setStatusLine(`Kon staging niet laden: ${err.message}`, true);
  }
}

function renderAuditList(events) {
  const container = document.getElementById('audit-list');
  container.innerHTML = '';

  if (!events.length) {
    container.innerHTML = '<p class="empty">Nog geen audit-events.</p>';
    return;
  }

  [...events].reverse().slice(0, 20).forEach((ev) => {
    const row = document.createElement('div');
    row.className = `audit-row${ev.approved ? ' approved' : ' rejected'}`;
    row.innerHTML = `
      <span class="audit-timestamp">${escapeHtml(ev.timestamp || '-')}</span>
      <span class="audit-agent">${escapeHtml(ev.agent || '-')}</span>
      <span class="audit-action">${escapeHtml(ev.action || '-')}</span>
      <span class="audit-id">${escapeHtml(ev.id || '-')}</span>
      <span class="audit-approved">${ev.approved ? 'goedgekeurd' : 'afgewezen'}</span>
    `;
    container.appendChild(row);
  });
}

async function fetchAudit() {
  try {
    const res = await fetch('/api/audit');
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    renderAuditList(await res.json());
  } catch (err) {
    setStatusLine(`Kon audit log niet laden: ${err.message}`, true);
  }
}

document.getElementById('refresh-audit-btn').addEventListener('click', fetchAudit);

function renderEpicsList(epics, storyCounts) {
  const container = document.getElementById('epics-list');
  container.innerHTML = '';

  if (!epics.length) {
    container.innerHTML = '<p class="empty">Nog geen epics. Klik op "+ Nieuwe epic" om er een aan te maken.</p>';
    return;
  }

  epics.forEach((epic) => {
    const count = storyCounts[epic.id] || 0;
    const card = document.createElement('div');
    card.className = 'epic-card';
    card.innerHTML = `
      <span class="epic-card-title">${escapeHtml(epic.id)} — ${escapeHtml(epic.title || '')}</span>
      <span class="card-meta">${escapeHtml(epic.status || '-')} · ${count} ${count === 1 ? 'story' : 'stories'}</span>
    `;
    card.addEventListener('click', () => openEpic(epic.id));
    container.appendChild(card);
  });
}

async function fetchEpics() {
  try {
    const [epicsRes, storiesRes] = await Promise.all([fetch('/api/epics'), fetch('/api/stories')]);
    if (!epicsRes.ok) throw new Error(`Server gaf ${epicsRes.status} terug`);
    if (!storiesRes.ok) throw new Error(`Server gaf ${storiesRes.status} terug`);
    const epics = await epicsRes.json();
    const stories = await storiesRes.json();

    const storyCounts = {};
    stories.forEach((s) => {
      if (s.epic) storyCounts[s.epic] = (storyCounts[s.epic] || 0) + 1;
    });

    renderEpicsList(epics, storyCounts);
    populateEpicFilterOptions(epics);
  } catch (err) {
    setStatusLine(`Kon epics niet laden: ${err.message}`, true);
  }
}

/** Rebuild the epic filter's options, keeping the current selection if it's still valid. */
function populateEpicFilterOptions(epics) {
  const select = document.getElementById('epic-filter');
  const previous = state.filters.epic;

  select.innerHTML = '<option value="">Alle epics</option>';
  epics.forEach((epic) => {
    const opt = document.createElement('option');
    opt.value = epic.id;
    opt.textContent = `${epic.id} — ${epic.title || ''}`;
    select.appendChild(opt);
  });

  if (epics.some((e) => e.id === previous)) {
    select.value = previous;
  } else {
    state.filters.epic = '';
  }
}

function openEpicModal() {
  document.getElementById('epic-modal-overlay').classList.remove('hidden');
}

function closeEpicModal() {
  document.getElementById('epic-modal-overlay').classList.add('hidden');
  state.currentEpicId = null;
  state.currentEpicVersion = null;
}

function openNewEpicForm() {
  state.currentEpicId = null;
  state.currentEpicVersion = null;
  document.getElementById('epic-modal-title').textContent = 'Nieuwe epic';
  const form = document.getElementById('epic-form');
  form.reset();
  openEpicModal();
}

async function openEpic(id) {
  try {
    const res = await fetch(`/api/epics/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    const epic = await res.json();

    state.currentEpicId = id;
    state.currentEpicVersion = epic._version;
    document.getElementById('epic-modal-title').textContent = `${epic.id} — ${epic.title || ''}`;

    const form = document.getElementById('epic-form');
    form.title.value = epic.title || '';
    form.status.value = epic.status || '';
    form.body.value = epic._body || '';

    openEpicModal();
  } catch (err) {
    setStatusLine(`Kon epic niet openen: ${err.message}`, true);
  }
}

document.getElementById('new-epic-btn').addEventListener('click', openNewEpicForm);
document.getElementById('epic-cancel-btn').addEventListener('click', closeEpicModal);

document.getElementById('epic-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const isNew = !state.currentEpicId;
  const epicId = state.currentEpicId;
  const payload = {
    title: form.title.value,
    status: form.status.value,
    body: form.body.value,
    ...(isNew ? {} : { expectedVersion: state.currentEpicVersion }),
  };

  try {
    const res = await fetch(
      isNew ? '/api/epics' : `/api/epics/${encodeURIComponent(epicId)}`,
      {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) throw await parseApiError(res);
    closeEpicModal();
    fetchEpics();
  } catch (err) {
    if (err.code === 'VERSION_CONFLICT') {
      handleConflict(err, () => openEpic(epicId));
    } else {
      setStatusLine(`Opslaan mislukt: ${err.message}`, true);
    }
  }
});

function renderTasksList(tasks) {
  const container = document.getElementById('story-tasks-list');
  container.innerHTML = '';

  if (!tasks.length) {
    container.innerHTML = '<p class="empty">Nog geen taken voor deze story.</p>';
    return;
  }

  tasks.forEach((task) => {
    const item = document.createElement('div');
    item.className = 'task-item';
    item.innerHTML = `
      <span class="task-title">${escapeHtml(task.id)} — ${escapeHtml(task.title || '')}</span>
      <span class="task-meta">${escapeHtml(task.type || 'task')} · ${escapeHtml(task.status || '-')}</span>
    `;
    item.addEventListener('click', () => openTask(task.id));
    container.appendChild(item);
  });
}

async function fetchTasksForStory(storyId) {
  try {
    const res = await fetch(`/api/tasks?story=${encodeURIComponent(storyId)}`);
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    renderTasksList(await res.json());
  } catch (err) {
    setStatusLine(`Kon taken niet laden: ${err.message}`, true);
  }
}

/**
 * Read-only rollup of every commit linked to this story, either directly
 * (a commit message bare-referenced "STORY-XXX") or via one of its tasks
 * (a commit referenced "TASK-XXX"). See getStoryCommitTrail() in the
 * engine. Nothing here is ever editable from the UI — commits only get
 * linked by running Git sync.
 */
async function fetchStoryCommitTrail(storyId) {
  const container = document.getElementById('story-commits-list');
  try {
    const res = await fetch(`/api/stories/${encodeURIComponent(storyId)}/commits`);
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    const trail = await res.json();
    renderCommitTrail(trail.commits || []);
  } catch (err) {
    container.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = `Kon commits niet laden: ${err.message}`;
    container.appendChild(p);
  }
}

function renderCommitTrail(commits) {
  const container = document.getElementById('story-commits-list');
  container.innerHTML = '';

  if (!commits.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Nog geen commits gekoppeld.';
    container.appendChild(p);
    return;
  }

  commits.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'commit-trail-item';
    const sourceLabel = entry.source === 'task' ? `via ${entry.taskId}` : 'direct';
    item.innerHTML = `
      <span class="commit-hash">${entry.commit}</span>
      <span class="commit-source">${sourceLabel}</span>
    `;
    container.appendChild(item);
  });
}

function openTaskModal() {
  document.getElementById('task-modal-overlay').classList.remove('hidden');
}

function closeTaskModal() {
  document.getElementById('task-modal-overlay').classList.add('hidden');
  state.currentTaskId = null;
  state.currentTaskVersion = null;
}

function openNewTaskForm() {
  if (!state.currentStoryId) return;
  state.currentTaskId = null;
  state.currentTaskVersion = null;
  document.getElementById('task-modal-title').textContent = 'Nieuwe taak';
  const form = document.getElementById('task-form');
  form.reset();
  form.type.value = 'task';
  openTaskModal();
}

async function openTask(id) {
  try {
    const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    const task = await res.json();

    state.currentTaskId = id;
    state.currentTaskVersion = task._version;
    document.getElementById('task-modal-title').textContent = `${task.id} — ${task.title || ''}`;

    const form = document.getElementById('task-form');
    form.title.value = task.title || '';
    form.status.value = task.status || '';
    form.type.value = task.type || 'task';
    form.commit.value = task.commit || '';
    form.body.value = task._body || '';

    openTaskModal();
  } catch (err) {
    setStatusLine(`Kon taak niet openen: ${err.message}`, true);
  }
}

document.getElementById('add-task-btn').addEventListener('click', openNewTaskForm);
document.getElementById('task-cancel-btn').addEventListener('click', closeTaskModal);

document.getElementById('task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const isNew = !state.currentTaskId;
  const taskId = state.currentTaskId;
  const payload = {
    title: form.title.value,
    status: form.status.value,
    type: form.type.value,
    commit: form.commit.value || null,
    body: form.body.value,
    ...(isNew ? { story: state.currentStoryId } : { expectedVersion: state.currentTaskVersion }),
  };

  try {
    const res = await fetch(
      isNew ? '/api/tasks' : `/api/tasks/${encodeURIComponent(taskId)}`,
      {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) throw await parseApiError(res);
    closeTaskModal();
    fetchTasksForStory(state.currentStoryId);
  } catch (err) {
    if (err.code === 'VERSION_CONFLICT') {
      handleConflict(err, () => openTask(taskId));
    } else {
      setStatusLine(`Opslaan mislukt: ${err.message}`, true);
    }
  }
});

document.getElementById('search-input').addEventListener('input', (e) => {
  state.filters.search = e.target.value;
  render();
});
document.getElementById('epic-filter').addEventListener('change', (e) => {
  state.filters.epic = e.target.value;
  render();
});
document.getElementById('priority-filter').addEventListener('change', (e) => {
  state.filters.priority = e.target.value;
  render();
});
document.getElementById('sprint-filter').addEventListener('change', (e) => {
  state.filters.sprint = e.target.value;
  render();
});
document.getElementById('clear-filters-btn').addEventListener('click', () => {
  state.filters = { search: '', epic: '', priority: '', sprint: '' };
  document.getElementById('search-input').value = '';
  document.getElementById('epic-filter').value = '';
  document.getElementById('priority-filter').value = '';
  document.getElementById('sprint-filter').value = '';
  render();
});

function renderSprintsList(sprints, summariesById) {
  const container = document.getElementById('sprints-list');
  container.innerHTML = '';

  if (!sprints.length) {
    container.innerHTML = '<p class="empty">Nog geen sprints. Klik op "+ Nieuwe sprint" om er een aan te maken.</p>';
    return;
  }

  sprints.forEach((sprint) => {
    const summary = summariesById[sprint.id];
    const pointsLabel = summary
      ? `${summary.totalPoints}${summary.capacity > 0 ? `/${summary.capacity}` : ''} pts`
      : '-';

    const card = document.createElement('div');
    card.className = 'sprint-card' + (summary && summary.overCapacity ? ' over-capacity' : '');
    card.innerHTML = `
      <span class="sprint-card-title">${escapeHtml(sprint.id)}</span>
      <span class="card-meta">${escapeHtml(sprint.status || '-')} · ${escapeHtml(sprint.start || '?')} — ${escapeHtml(sprint.end || '?')} · ${pointsLabel}${summary && summary.overCapacity ? ' · overcommitted' : ''}</span>
    `;
    card.addEventListener('click', () => openSprint(sprint.id));
    container.appendChild(card);
  });
}

async function fetchSprints() {
  try {
    const res = await fetch('/api/sprints');
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    const sprints = await res.json();

    const summaries = await Promise.all(
      sprints.map((s) => fetch(`/api/sprints/${encodeURIComponent(s.id)}/summary`).then((r) => r.json()))
    );
    const summariesById = {};
    sprints.forEach((s, i) => { summariesById[s.id] = summaries[i]; });

    renderSprintsList(sprints, summariesById);
  } catch (err) {
    setStatusLine(`Kon sprints niet laden: ${err.message}`, true);
  }
}

function renderSprintStoriesSummary(summary) {
  const container = document.getElementById('sprint-stories-summary');
  container.innerHTML = '';

  if (!summary.stories.length) {
    container.innerHTML = '<p class="empty">Nog geen stories in deze sprint.</p>';
    return;
  }

  summary.stories.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'sprint-story-row';
    row.innerHTML = `
      <span>${escapeHtml(s.id)} — ${escapeHtml(s.title || '')}</span>
      <span>${s.story_points ?? '-'} pts · ${escapeHtml(s.status || '-')}</span>
    `;
    container.appendChild(row);
  });

  const totalRow = document.createElement('div');
  totalRow.className = 'sprint-story-row';
  totalRow.style.fontWeight = '600';
  totalRow.innerHTML = `
    <span>Totaal</span>
    <span>${summary.totalPoints}${summary.capacity > 0 ? ` / ${summary.capacity}` : ''} pts${summary.overCapacity ? ' (overcommitted)' : ''}</span>
  `;
  container.appendChild(totalRow);
}

function openSprintModal() {
  document.getElementById('sprint-modal-overlay').classList.remove('hidden');
}

function closeSprintModal() {
  document.getElementById('sprint-modal-overlay').classList.add('hidden');
  state.currentSprintId = null;
  state.currentSprintVersion = null;
}

function openNewSprintForm() {
  state.currentSprintId = null;
  state.currentSprintVersion = null;
  document.getElementById('sprint-modal-title').textContent = 'Nieuwe sprint';
  const form = document.getElementById('sprint-form');
  form.reset();
  document.getElementById('sprint-stories-summary').innerHTML = '<p class="empty">Wordt zichtbaar na aanmaken.</p>';
  openSprintModal();
}

async function openSprint(id) {
  try {
    const [sprintRes, summaryRes] = await Promise.all([
      fetch(`/api/sprints/${encodeURIComponent(id)}`),
      fetch(`/api/sprints/${encodeURIComponent(id)}/summary`),
    ]);
    if (!sprintRes.ok) throw new Error(`Server gaf ${sprintRes.status} terug`);
    const sprint = await sprintRes.json();
    const summary = await summaryRes.json();

    state.currentSprintId = id;
    state.currentSprintVersion = sprint._version;
    document.getElementById('sprint-modal-title').textContent = sprint.id;

    const form = document.getElementById('sprint-form');
    form.start.value = sprint.start || '';
    form.end.value = sprint.end || '';
    form.status.value = sprint.status || '';
    form.capacity.value = sprint.capacity ?? 0;

    renderSprintStoriesSummary(summary);
    openSprintModal();
  } catch (err) {
    setStatusLine(`Kon sprint niet openen: ${err.message}`, true);
  }
}

document.getElementById('new-sprint-btn').addEventListener('click', openNewSprintForm);
document.getElementById('sprint-cancel-btn').addEventListener('click', closeSprintModal);

document.getElementById('sprint-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const isNew = !state.currentSprintId;
  const sprintId = state.currentSprintId;
  const payload = {
    start: form.start.value || null,
    end: form.end.value || null,
    status: form.status.value,
    capacity: form.capacity.value === '' ? 0 : Number(form.capacity.value),
    ...(isNew ? {} : { expectedVersion: state.currentSprintVersion }),
  };

  try {
    const res = await fetch(
      isNew ? '/api/sprints' : `/api/sprints/${encodeURIComponent(sprintId)}`,
      {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) throw await parseApiError(res);
    closeSprintModal();
    fetchSprints();
  } catch (err) {
    if (err.code === 'VERSION_CONFLICT') {
      handleConflict(err, () => openSprint(sprintId));
    } else {
      setStatusLine(`Opslaan mislukt: ${err.message}`, true);
    }
  }
});

function titleFor(overview, id) {
  const node = overview.nodes.find((n) => n.id === id);
  return node ? node.title || '' : '';
}

function renderDependenciesView(overview) {
  const container = document.getElementById('dependencies-content');
  container.innerHTML = '';

  if (overview.cycles.length) {
    const box = document.createElement('div');
    box.className = 'dependency-warning-box';
    box.innerHTML = `<h3>Circulaire afhankelijkheden</h3><ul>${overview.cycles
      .map((cycle) => `<li>${cycle.map((id) => escapeHtml(id)).join(' → ')} → ${escapeHtml(cycle[0])}</li>`)
      .join('')}</ul>`;
    container.appendChild(box);
  }

  if (overview.unknownReferences.length) {
    const box = document.createElement('div');
    box.className = 'dependency-warning-box';
    box.innerHTML = `<h3>Onbekende verwijzingen</h3><ul>${overview.unknownReferences
      .map((r) => `<li>${escapeHtml(r.from)} verwijst naar "${escapeHtml(r.to)}", maar die story bestaat niet</li>`)
      .join('')}</ul>`;
    container.appendChild(box);
  }

  if (overview.blocked.length) {
    const box = document.createElement('div');
    box.className = 'dependency-warning-box';
    box.innerHTML = `<h3>Geblokkeerde stories</h3><ul>${overview.blocked
      .map((b) => `<li>${escapeHtml(b.id)} (${escapeHtml(b.title || '')}) wordt geblokkeerd door: ${b.blockedBy.map((id) => escapeHtml(id)).join(', ')}</li>`)
      .join('')}</ul>`;
    container.appendChild(box);
  }

  const edgeSection = document.createElement('div');
  edgeSection.className = 'dependency-edge-list';
  if (!overview.edges.length) {
    edgeSection.innerHTML = '<p class="empty">Geen afhankelijkheden ingesteld.</p>';
  } else {
    overview.edges.forEach((edge) => {
      const depNode = overview.nodes.find((n) => n.id === edge.to);
      const notDone = depNode && String(depNode.status || '').toLowerCase() !== 'done';
      const row = document.createElement('div');
      row.className = 'dependency-edge-row' + (notDone ? ' not-done' : '');
      row.innerHTML = `
        <span>${escapeHtml(edge.from)} (${escapeHtml(titleFor(overview, edge.from))})</span>
        <span>→ ${escapeHtml(edge.to)} (${escapeHtml(depNode ? depNode.status || '-' : '?')})</span>
      `;
      edgeSection.appendChild(row);
    });
  }
  container.appendChild(edgeSection);
}

async function fetchDependencies() {
  try {
    const res = await fetch('/api/dependencies');
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    renderDependenciesView(await res.json());
  } catch (err) {
    setStatusLine(`Kon afhankelijkheden niet laden: ${err.message}`, true);
  }
}

document.getElementById('refresh-dependencies-btn').addEventListener('click', fetchDependencies);

/**
 * Render the "what's broken" report from GET /api/validation (architecture
 * plan §8 risk #2): a file with unparseable YAML (no id known) or a file
 * that parses fine but is missing/mistyped a required field. Nothing here
 * is fixed automatically — the point is just to make sure a problem shows
 * up somewhere instead of a story silently not appearing on the board.
 */
function renderValidationList(issues) {
  const container = document.getElementById('validation-content');
  container.innerHTML = '';

  if (!issues.length) {
    container.innerHTML = '<p class="empty">Geen validatieproblemen gevonden.</p>';
    return;
  }

  issues.forEach((issue) => {
    const box = document.createElement('div');
    box.className = 'dependency-warning-box';
    box.innerHTML = `
      <h3>${escapeHtml(issue.kind)}${issue.id ? ` — ${escapeHtml(issue.id)}` : ''} (${escapeHtml(issue.file)})</h3>
      <ul>${issue.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
    `;
    container.appendChild(box);
  });
}

async function fetchValidation() {
  try {
    const res = await fetch('/api/validation');
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    renderValidationList(await res.json());
  } catch (err) {
    setStatusLine(`Kon validatierapport niet laden: ${err.message}`, true);
  }
}

document.getElementById('refresh-validation-btn').addEventListener('click', fetchValidation);

async function fetchArchitectureDoc() {
  const el = document.getElementById('architecture-content');
  try {
    const res = await fetch('/api/architecture');
    if (res.status === 404) {
      el.textContent = 'Nog geen engineering/architecture.md aangemaakt.';
      return;
    }
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    const doc = await res.json();
    el.textContent = doc.body || '';
  } catch (err) {
    el.textContent = '';
    setStatusLine(`Kon architecture.md niet laden: ${err.message}`, true);
  }
}

function renderADRList(adrs) {
  const container = document.getElementById('adr-list');
  container.innerHTML = '';

  if (!adrs.length) {
    container.innerHTML = '<p class="empty">Nog geen decision records.</p>';
    return;
  }

  adrs.forEach((adr) => {
    const item = document.createElement('div');
    item.className = 'adr-item';
    item.innerHTML = `
      <div class="adr-item-header">
        <span><strong>${escapeHtml(adr.id)}</strong> — ${escapeHtml(adr.title || '')}</span>
        <span class="card-meta">${escapeHtml(adr.status || '-')}${adr.date ? ` · ${escapeHtml(adr.date)}` : ''}</span>
      </div>
      <pre class="adr-item-body"></pre>
    `;
    const bodyEl = item.querySelector('.adr-item-body');

    item.addEventListener('click', async () => {
      const isOpen = bodyEl.classList.contains('open');
      if (isOpen) {
        bodyEl.classList.remove('open');
        return;
      }
      if (!bodyEl.textContent) {
        try {
          const res = await fetch(`/api/decisions/${encodeURIComponent(adr.id)}`);
          if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
          const full = await res.json();
          bodyEl.textContent = full._body || '';
        } catch (err) {
          setStatusLine(`Kon ${adr.id} niet laden: ${err.message}`, true);
          return;
        }
      }
      bodyEl.classList.add('open');
    });

    container.appendChild(item);
  });
}

async function fetchDecisions() {
  try {
    const res = await fetch('/api/decisions');
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    renderADRList(await res.json());
  } catch (err) {
    setStatusLine(`Kon decision records niet laden: ${err.message}`, true);
  }
}

function fetchEngineering() {
  fetchArchitectureDoc();
  fetchDecisions();
}

document.getElementById('refresh-engineering-btn').addEventListener('click', fetchEngineering);

function renderVelocityView(sprints) {
  const container = document.getElementById('velocity-content');
  container.innerHTML = '';

  if (!sprints.length) {
    container.innerHTML = '<p class="empty">Nog geen sprints om velocity uit te berekenen.</p>';
    return;
  }

  const completedSprints = sprints.filter((s) => s.status === 'done');
  if (completedSprints.length >= 2) {
    const avg = completedSprints.reduce((sum, s) => sum + s.donePoints, 0) / completedSprints.length;
    const p = document.createElement('p');
    p.className = 'velocity-avg';
    p.textContent = `Gemiddelde velocity over ${completedSprints.length} afgeronde sprints: ${avg.toFixed(1)} punten/sprint.`;
    container.appendChild(p);
  } else {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Nog niet genoeg afgeronde sprints voor een gemiddelde velocity (minimaal 2 nodig) — onderstaand per-sprint overzicht werkt al wel.';
    container.appendChild(p);
  }

  sprints.forEach((s) => {
    const pct = s.committedPoints > 0 ? Math.min(100, Math.round((s.donePoints / s.committedPoints) * 100)) : 0;
    const row = document.createElement('div');
    row.className = `velocity-row${s.committedPoints === 0 ? ' no-committed' : ''}`;
    row.innerHTML = `
      <div class="velocity-label">${escapeHtml(s.sprintId)}</div>
      <div class="velocity-bar-track"><div class="velocity-bar-fill" style="width: ${pct}%"></div></div>
      <div class="velocity-numbers">${s.donePoints} / ${s.committedPoints} pt</div>
    `;
    container.appendChild(row);
  });
}

async function fetchVelocity() {
  try {
    const res = await fetch('/api/analytics/velocity');
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    renderVelocityView(await res.json());
  } catch (err) {
    setStatusLine(`Kon velocity niet laden: ${err.message}`, true);
  }
}

/**
 * Cycle time per finished story/task (started_at -> done_at, both
 * auto-stamped by the engine on a status change — see
 * maybeStampLifecycleTimestamps() in engine/index.js). `missingTimestamps`
 * covers items that were already done before this feature existed, or
 * were hand-edited straight to done outside a normal save, so an empty or
 * partial view explains itself instead of just looking broken.
 */
function renderCycleTimeView(data) {
  const container = document.getElementById('cycle-time-content');
  container.innerHTML = '';

  if (!data.items.length) {
    container.innerHTML = '<p class="empty">Nog geen meetbare cycle times (er is nog niets met zowel een start- als een done-tijdstip).</p>';
  } else {
    const avg = document.createElement('p');
    avg.className = 'velocity-avg';
    avg.textContent = `Gemiddelde cycle time over ${data.items.length} afgeronde item(s): ${data.avgDays} dag(en).`;
    container.appendChild(avg);

    data.items.slice(0, 15).forEach((item) => {
      const row = document.createElement('div');
      row.className = 'sprint-story-row';
      row.innerHTML = `
        <span>${escapeHtml(item.kind)} ${escapeHtml(item.id)} — ${escapeHtml(item.title || '')}</span>
        <span>${item.days} dag(en)</span>
      `;
      container.appendChild(row);
    });
  }

  if (data.missingTimestamps.length) {
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = `${data.missingTimestamps.length} afgeronde item(s) zonder meetbare cycle time (al done vóór deze functie bestond, of rechtstreeks op done gezet): ${data.missingTimestamps.map((i) => i.id).join(', ')}.`;
    container.appendChild(note);
  }
}

async function fetchCycleTime() {
  try {
    const res = await fetch('/api/analytics/cycle-time');
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    renderCycleTimeView(await res.json());
  } catch (err) {
    setStatusLine(`Kon cycle time niet laden: ${err.message}`, true);
  }
}

function renderBacklogForecast(f) {
  const container = document.getElementById('backlog-forecast-content');
  container.innerHTML = '';

  const p = document.createElement('p');
  if (f.insufficientHistory) {
    p.className = 'empty';
    p.textContent = `Hele backlog: ${f.remainingPoints} punten te gaan. Nog niet genoeg afgeronde sprints voor een forecast (minimaal 2 nodig).`;
  } else {
    p.className = 'velocity-avg';
    p.textContent = `Hele backlog: ${f.remainingPoints} punten te gaan, gemiddelde velocity ${f.avgVelocity} pt/sprint → nog ongeveer ${f.sprintsRemaining} sprint(s).`;
  }
  container.appendChild(p);
}

async function fetchBacklogForecast() {
  try {
    const res = await fetch('/api/analytics/forecast/backlog');
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    renderBacklogForecast(await res.json());
  } catch (err) {
    setStatusLine(`Kon backlog-forecast niet laden: ${err.message}`, true);
  }
}

function renderEpicForecasts(forecasts) {
  const container = document.getElementById('epic-forecast-content');
  container.innerHTML = '';

  if (!forecasts.length) {
    container.innerHTML = '<p class="empty">Nog geen epics om te forecasten.</p>';
    return;
  }

  forecasts.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'sprint-story-row';
    const label = f.insufficientHistory
      ? `${f.remainingPoints} pt te gaan (onvoldoende sprintgeschiedenis voor datum)`
      : `${f.remainingPoints} pt te gaan · ~${f.sprintsRemaining} sprint(s)${f.projectedDoneDate ? ` · verwacht rond ${f.projectedDoneDate}` : ''}`;
    row.innerHTML = `
      <span>${escapeHtml(f.epicId)}</span>
      <span>${escapeHtml(label)}</span>
    `;
    container.appendChild(row);
  });
}

/** Fetch every epic, then forecast each one — epics are few enough in practice that N+1 requests here stay simple and fast. */
async function fetchEpicForecasts() {
  try {
    const epicsRes = await fetch('/api/epics');
    if (!epicsRes.ok) throw new Error(`Server gaf ${epicsRes.status} terug`);
    const epics = await epicsRes.json();
    const forecasts = await Promise.all(
      epics.map((e) => fetch(`/api/analytics/forecast/epics/${encodeURIComponent(e.id)}`).then((r) => r.json()))
    );
    renderEpicForecasts(forecasts);
  } catch (err) {
    setStatusLine(`Kon epic-forecasts niet laden: ${err.message}`, true);
  }
}

function fetchForecast() {
  fetchBacklogForecast();
  fetchEpicForecasts();
}

function fetchAnalytics() {
  fetchVelocity();
  fetchCycleTime();
  fetchForecast();
}

document.getElementById('refresh-velocity-btn').addEventListener('click', fetchAnalytics);

document.getElementById('save-velocity-snapshot-btn').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/analytics/velocity/snapshot', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `Server gaf ${res.status} terug`);
    }
    setStatusLine('Velocity-momentopname opgeslagen in .project/analytics/velocity.json.');
  } catch (err) {
    setStatusLine(`Opslaan momentopname mislukt: ${err.message}`, true);
  }
});

function renderHistoryEntries(containerId, entries) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (!entries.length) {
    container.innerHTML = '<p class="empty">Nog geen entries.</p>';
    return;
  }

  // Newest first: entries are appended to the end of the file over time.
  [...entries].reverse().forEach((entry) => {
    const el = document.createElement('div');
    el.className = 'history-entry';
    el.innerHTML = `
      <div class="history-entry-heading">${escapeHtml(entry.heading)}</div>
      ${entry.body ? `<div class="history-entry-body">${escapeHtml(entry.body)}</div>` : ''}
    `;
    container.appendChild(el);
  });
}

async function fetchMilestones() {
  try {
    const res = await fetch('/api/milestones');
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    renderHistoryEntries('milestones-list', (await res.json()).entries);
  } catch (err) {
    setStatusLine(`Kon milestones niet laden: ${err.message}`, true);
  }
}

async function fetchLessons() {
  try {
    const res = await fetch('/api/lessons-learned');
    if (!res.ok) throw new Error(`Server gaf ${res.status} terug`);
    renderHistoryEntries('lessons-list', (await res.json()).entries);
  } catch (err) {
    setStatusLine(`Kon lessons learned niet laden: ${err.message}`, true);
  }
}

function fetchHistory() {
  fetchMilestones();
  fetchLessons();
}

document.getElementById('refresh-history-btn').addEventListener('click', fetchHistory);

document.getElementById('milestone-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    const res = await fetch('/api/milestones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: form.title.value, body: form.body.value }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `Server gaf ${res.status} terug`);
    }
    form.reset();
    fetchMilestones();
  } catch (err) {
    setStatusLine(`Opslaan mislukt: ${err.message}`, true);
  }
});

document.getElementById('lesson-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    const res = await fetch('/api/lessons-learned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: form.title.value, body: form.body.value }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `Server gaf ${res.status} terug`);
    }
    form.reset();
    fetchLessons();
  } catch (err) {
    setStatusLine(`Opslaan mislukt: ${err.message}`, true);
  }
});

fetchSprints();
fetchEpics();
fetchDependencies();
fetchValidation();
fetchEngineering();
fetchAnalytics();
fetchHistory();
fetchStaging();
fetchAudit();
fetchBoard();
