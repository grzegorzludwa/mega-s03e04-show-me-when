import { fetchIncidents, ack } from './api.js';
import { formatLocal } from './time.js';

const REFRESH_MS = 2000; // R4

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const errorBox = document.querySelector('[data-role="error"]');
const status = document.querySelector('[data-role="status"]');

const rows = new Map(); // incident id -> <li>, kept across refreshes so a click is never lost to a re-render
const acked = new Map(); // incident id -> ack reply
let loaded = false;

function rowFor(incident) {
  let li = rows.get(incident.id);
  if (!li) {
    li = document.createElement('li');
    li.dataset.testid = 'incident-row';
    li.dataset.id = incident.id;
    li.innerHTML = `<span class="id"></span><span class="sev"></span><span class="what"></span><time></time><span class="act"></span>`;
    rows.set(incident.id, li);
  }
  li.className = `row ${incident.severity}`;
  li.querySelector('.id').textContent = incident.id;
  li.querySelector('.sev').textContent = incident.severity;
  li.querySelector('.what').textContent = `${incident.service} · ${incident.region} · ${incident.summary}`;
  const time = li.querySelector('time');
  time.dateTime = incident.openedAt;
  time.textContent = formatLocal(incident.openedAt);
  time.title = incident.openedAt;
  renderAction(li, incident.id);
  return li;
}

function renderAction(li, id) {
  const act = li.querySelector('.act');
  const done = acked.get(id);
  if (done) {
    if (act.querySelector('[data-testid="acked"]')) return;
    act.innerHTML = '';
    const mark = document.createElement('span');
    mark.dataset.testid = 'acked';
    mark.className = 'acked';
    mark.textContent = '✓ Acked';
    mark.title = `acked ${done.ackedAt}`;
    act.append(mark);
    li.classList.add('is-acked');
    return;
  }
  if (act.querySelector('[data-testid="ack"]')) return;
  act.innerHTML = '';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.testid = 'ack';
  btn.textContent = 'Ack';
  btn.setAttribute('aria-label', `Ack ${id}`);
  btn.addEventListener('click', () => onAck(li, id, btn));
  act.append(btn);
}

async function onAck(li, id, btn) {
  btn.disabled = true;
  btn.textContent = 'Acking…';
  try {
    acked.set(id, await ack(id)); // R2: the row's own id, never a position
    renderAction(li, id);
    showError('');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Ack';
    showError(`Ack failed for ${id}: ${err.message}`);
  }
}

function render(incidents) {
  // R1: newest first, whatever order the page came in.
  const sorted = [...incidents].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  const keep = new Set(sorted.map((i) => i.id));
  for (const [id, li] of rows) if (!keep.has(id)) { li.remove(); rows.delete(id); }
  sorted.forEach((incident, index) => {
    const li = rowFor(incident);
    if (list.children[index] !== li) list.insertBefore(li, list.children[index] ?? null);
  });
  empty.hidden = sorted.length > 0;
}

function showError(text) {
  errorBox.textContent = text;
  errorBox.hidden = !text;
}

async function refresh() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    if (!loaded) { loaded = true; loader.remove(); } // R3
    status.textContent = `updated ${formatLocal(page.updatedAt)}`;
    if (errorBox.textContent.startsWith('Refresh')) showError('');
  } catch (err) {
    showError(`Refresh failed: ${err.message}. Retrying.`);
  } finally {
    setTimeout(refresh, REFRESH_MS); // R4: one request at a time, every 2 s while open
  }
}

refresh();
