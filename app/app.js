import { fetchIncidents, ack } from './api.js';
import { formatLocal } from './time.js';

const REFRESH_MS = 2000; // R4

const $ = (sel) => document.querySelector(sel);
const list = $('[data-testid="incident-list"]');
const loader = $('[data-testid="loader"]');
const empty = $('[data-testid="empty"]');
const errorBox = $('[data-role="error"]');
const status = $('[data-role="status"]');
const panel = $('[data-role="panel"]');
const hint = $('[data-role="panel-hint"]');
const panelAck = $('[data-testid="panel-ack"]');

const incidents = new Map(); // id -> latest incident data
const rows = new Map(); // id -> <li>. Rows are never removed or moved once shown, so nothing jumps but new rows at the top.
const acked = new Map(); // id -> ack reply
let openId = null; // the incident the panel names; Ack acks exactly this id
let loaded = false;

// R2 (product, after step 1): a row opens its incident panel; Ack lives in the panel, not the row.
function rowFor(incident) {
  let li = rows.get(incident.id);
  if (!li) {
    li = document.createElement('li');
    li.dataset.testid = 'incident-row';
    li.dataset.id = incident.id;
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.innerHTML = `<span class="id"></span><span class="sev"></span><span class="what"></span><time></time><span class="state"></span>`;
    li.addEventListener('click', () => openPanel(incident.id));
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPanel(incident.id); }
    });
    rows.set(incident.id, li);
  }
  li.className = `row ${incident.severity}${acked.has(incident.id) ? ' is-acked' : ''}${openId === incident.id ? ' is-open' : ''}`;
  li.setAttribute('aria-label', `Open ${incident.id}`);
  li.querySelector('.id').textContent = incident.id;
  li.querySelector('.sev').textContent = incident.severity;
  li.querySelector('.what').textContent = `${incident.service} · ${incident.region} · ${incident.summary}`;
  const time = li.querySelector('time');
  time.dateTime = incident.openedAt;
  time.textContent = formatLocal(incident.openedAt);
  time.title = incident.openedAt;
  renderRowState(li, incident.id);
  return li;
}

function renderRowState(li, id) {
  const state = li.querySelector('.state');
  if (!acked.has(id) || state.querySelector('[data-testid="acked"]')) return;
  const mark = document.createElement('span');
  mark.dataset.testid = 'acked';
  mark.className = 'acked';
  mark.textContent = '✓ Acked';
  mark.title = `acked ${acked.get(id).ackedAt}`;
  state.append(mark);
  li.classList.add('is-acked');
}

function openPanel(id) {
  openId = id;
  for (const [rid, li] of rows) li.classList.toggle('is-open', rid === id);
  renderPanel();
  panelAck.hidden || panelAck.focus({ preventScroll: true });
}

function closePanel() {
  const was = rows.get(openId);
  openId = null;
  for (const li of rows.values()) li.classList.remove('is-open');
  renderPanel();
  was?.focus({ preventScroll: true });
}

function renderPanel() {
  const incident = openId && incidents.get(openId);
  panel.hidden = !incident;
  hint.hidden = !!incident;
  if (!incident) return;
  panel.dataset.id = incident.id;
  panel.className = `panel ${incident.severity}`;
  $('#panel-title').textContent = incident.id;
  $('[data-role="p-sev"]').textContent = incident.severity;
  $('[data-role="p-service"]').textContent = incident.service;
  $('[data-role="p-region"]').textContent = incident.region;
  $('[data-role="p-summary"]').textContent = incident.summary;
  const time = $('[data-role="p-time"]');
  time.dateTime = incident.openedAt;
  time.textContent = formatLocal(incident.openedAt);
  const done = acked.get(incident.id);
  const pending = panelAck.dataset.pending === incident.id;
  panelAck.hidden = !!done;
  panelAck.disabled = pending;
  panelAck.textContent = pending ? `Acking ${incident.id}…` : `Ack ${incident.id}`;
  const note = $('[data-role="p-acked"]');
  note.hidden = !done;
  note.textContent = done ? `✓ ${incident.id} acked at ${formatLocal(done.ackedAt)}` : '';
}

panelAck.addEventListener('click', async () => {
  const id = openId; // bound to what the panel names at click time, never to a position
  if (!id || acked.has(id) || panelAck.dataset.pending) return;
  panelAck.dataset.pending = id;
  renderPanel();
  try {
    acked.set(id, await ack(id));
    showError('');
  } catch (err) {
    showError(`Ack failed for ${id}: ${err.message}`);
  } finally {
    delete panelAck.dataset.pending;
    const li = rows.get(id);
    if (li) renderRowState(li, id);
    renderPanel();
  }
});
$('[data-role="p-close"]').addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openId) closePanel(); });

function render(page) {
  for (const incident of page) incidents.set(incident.id, incident);
  // R1: newest first. New rows go in at their place; rows already shown keep theirs.
  const sorted = [...page].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const incident = sorted[i];
    const isNew = !rows.has(incident.id);
    const li = rowFor(incident);
    if (!isNew) continue;
    const next = sorted.slice(i + 1).map((n) => rows.get(n.id)).find((n) => n?.isConnected);
    // A new row older than the oldest one shown goes last; otherwise it goes before its next-older neighbour.
    list.insertBefore(li, next ?? null);
  }
  empty.hidden = rows.size > 0;
  renderPanel();
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
