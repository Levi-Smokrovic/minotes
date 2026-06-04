/* =====================================================================
   minotes - Frontend App
   ===================================================================== */

// ─── State ────────────────────────────────────────────────────────────
let notes = [];
let editingId = null;
let reminderPollInterval = null;
let currentFilter = 'all';
let peer = null;
let peerConnections = [];
let myPhrase = localStorage.getItem('minotes_phrase') || '';
let isSyncing = false;
let lastSync = '';
let qrCodeInstance = null;

// ─── DOM refs ─────────────────────────────────────────────────────────
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];

const grid = $('#notesGrid');
const modal = $('#noteModal');
const backdrop = $('#modalBackdrop');
const modalContent = $('#modalContent');
const noteTitle = $('#noteTitle');
const noteContent = $('#noteContent');
const remindAt = $('#remindAt');
const doneToggle = $('#doneToggle');
const colorDots = $$('.color-dot');
const saveBtn = $('#saveNoteBtn');
const deleteBtn = $('#deleteNoteBtn');
const closeModal = $('#closeModal');
const newNoteBtn = $('#newNoteBtn');
const clearReminderBtn = $('#clearReminderBtn');
const presetBtns = $$('.preset-btn');
const toastContainer = $('#toastContainer');
const overlay = $('#overlay');
const reminderPanel = $('#reminderPanel');
const reminderList = $('#reminderList');
const toggleRemindersBtn = $('#toggleRemindersBtn');
const closeReminderPanel = $('#closeReminderPanel');
const reminderBadge = $('#reminderBadge');
const filterBtns = $$('.filter-btn');

// Sync panel
const syncPanel = $('#syncPanel');
const toggleSyncBtn = $('#toggleSyncBtn');
const closeSyncPanel = $('#closeSyncPanel');
const syncDot = $('#syncDot');
const myPhraseInput = $('#myPhrase');
const peerPhraseInput = $('#peerPhrase');
const copyPhraseBtn = $('#copyPhraseBtn');
const regeneratePhraseBtn = $('#regeneratePhraseBtn');
const connectBtn = $('#connectBtn');
const qrContainer = $('#qrContainer');
const syncStatus = $('#syncStatus');
const syncPeers = $('#syncPeers');
const toggleSettingsBtn = $('#toggleSettingsBtn');
const closeSettingsPanel = $('#closeSettingsPanel');
const settingsPanel = $('#settingsPanel');
const darkModeToggle = $('#darkModeToggle');
const exportNotesBtn = $('#exportNotesBtn');
const importNotesBtn = $('#importNotesBtn');
const adminSection = $('#adminSection');
const loadSampleNotesBtn = $('#loadSampleNotesBtn');
const loadDemoBoardBtn = $('#loadDemoBoardBtn');
const clearAllNotesBtn = $('#clearAllNotesBtn');
const introSlideshow = $('#introSlideshow');
const introDismiss = $('#introDismiss');
const introSkip = $('#introSkip');
const logo = $('#logo');
const scanQrBtn = $('#scanQrBtn');
const scannerOverlay = $('#scannerOverlay');
const closeScannerBtn = $('#closeScannerBtn');
const scannerViewport = $('#scannerViewport');
const scannerResult = $('#scannerResult');
const scannedPhrase = $('#scannedPhrase');
const connectScannedBtn = $('#connectScannedBtn');
const notifPrompt = $('#notifPrompt');
const notifEnableBtn = $('#notifEnableBtn');
const notifLaterBtn = $('#notifLaterBtn');
const testNotifBtn = $('#testNotifBtn');
const forgetPeersBtn = $('#forgetPeersBtn');
const emailReminderGroup = $('#emailReminderGroup');
const emailReminderInput = $('#emailReminderInput');
const saveEmailBtn = $('#saveEmailBtn');
const emailStatus = $('#emailStatus');

let selectedColor = '#ffffff';
let logoClickCount = 0;
let logoClickTimer = null;

// ─── Helpers ──────────────────────────────────────────────────────────
function formatDT(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const opts = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  return d.toLocaleDateString('en-US', opts);
}

function toLocalDatetimeValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ─── API ──────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  return r.json();
}

// ─── Filter ───────────────────────────────────────────────────────────
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderNotes();
  });
});

// ─── Render ───────────────────────────────────────────────────────────
function renderNotes() {
  let filtered = notes;
  if (currentFilter === 'active') filtered = notes.filter(n => !n.done);
  else if (currentFilter === 'done') filtered = notes.filter(n => n.done);

  if (!filtered.length) {
    const msg = currentFilter === 'done' ? 'No completed notes.' :
                currentFilter === 'active' ? 'No active notes.' :
                'No notes yet.';
    const sub = currentFilter === 'all'
      ? 'Click <strong>+ New Note</strong> to start.'
      : 'Try a different filter.';
    grid.innerHTML = `<p class="empty-state">
      <span class="empty-icon">~</span><br/>
      ${msg}<br/>
      <span class="empty-sub">${sub}</span>
    </p>`;
    return;
  }

  const html = filtered.map(n => {
    const isDone = n.done;
    const hasReminder = n.remind_at;
    const isValidHex = (c) => /^#[0-9a-fA-F]{6}$/.test(c);
    const bg = n.color && n.color !== '#ffffff' && isValidHex(n.color) ? `style="background:${n.color}"` : '';
    const doneClass = isDone ? 'done' : '';
    const contentPreview = (n.content || '').slice(0, 150);
    const reminderLabel = hasReminder
      ? `<span class="note-card-reminder">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          ${formatDT(n.remind_at)}
        </span>`
      : '';
    const doneBadge = isDone
      ? `<span class="note-card-done-badge">✓ Done</span>`
      : '';

    return `<div class="note-card ${doneClass}" data-id="${n.id}" ${bg}>
      <div class="note-card-header">
        <h3>${escapeHtml(n.title || 'Untitled')}</h3>
        ${n.pinned ? '<span class="note-card-pinned"></span>' : ''}
      </div>
      <div class="note-card-content">${escapeHtml(contentPreview)}</div>
      <div class="note-card-footer">
        <span>${reminderLabel}</span>
        <span>${doneBadge}</span>
      </div>
    </div>`;
  }).join('');

  grid.innerHTML = html;

  $$('.note-card').forEach(card => {
    card.addEventListener('click', () => {
      if (card._clickTimer) clearTimeout(card._clickTimer);
      card._clickTimer = setTimeout(() => openNote(Number(card.dataset.id)), 250);
    });
    card.addEventListener('dblclick', () => {
      if (card._clickTimer) clearTimeout(card._clickTimer);
      toggleDone(Number(card.dataset.id));
    });
  });
}

// ─── Load ─────────────────────────────────────────────────────────────
async function loadNotes() {
  notes = await api('GET', '/api/notes');
  renderNotes();
  updateReminderPanel();
}

// ─── Modal ────────────────────────────────────────────────────────────
function openModal() {
  modal.classList.add('open');
  overlay.classList.add('open');
  setTimeout(() => noteTitle.focus(), 100);
}

function closeModalFn() {
  modal.classList.remove('open');
  overlay.classList.remove('open');
  editingId = null;
  noteTitle.value = '';
  noteContent.value = '';
  remindAt.value = '';
  doneToggle.checked = false;
  selectedColor = '#ffffff';
  colorDots.forEach(d => d.classList.toggle('active', d.dataset.color === '#ffffff'));
  modalContent.style.background = '#ffffff';
  deleteBtn.style.display = 'none';
  presetBtns.forEach(b => b.classList.remove('active'));
}

async function openNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  editingId = id;
  noteTitle.value = note.title || '';
  noteContent.value = note.content || '';
  remindAt.value = toLocalDatetimeValue(note.remind_at);
  doneToggle.checked = !!note.done;
  selectedColor = note.color || '#ffffff';
  colorDots.forEach(d => d.classList.toggle('active', d.dataset.color === selectedColor));
  modalContent.style.background = selectedColor;
  deleteBtn.style.display = 'inline-flex';
  presetBtns.forEach(b => b.classList.remove('active'));
  openModal();
}

async function newNote() {
  editingId = null;
  noteTitle.value = '';
  noteContent.value = '';
  remindAt.value = '';
  doneToggle.checked = false;
  selectedColor = '#ffffff';
  colorDots.forEach(d => d.classList.toggle('active', d.dataset.color === '#ffffff'));
  modalContent.style.background = '#ffffff';
  deleteBtn.style.display = 'none';
  presetBtns.forEach(b => b.classList.remove('active'));
  openModal();
}

async function saveNote() {
  const title = noteTitle.value.trim() || 'Untitled';
  const content = noteContent.value;
  const remindAtVal = remindAt.value || null;
  const color = selectedColor;
  const done = doneToggle.checked ? 1 : 0;

  if (editingId) {
    const note = notes.find(n => n.id === editingId);
    await api('PUT', `/api/notes/${editingId}`, {
      title, content, color, remind_at: remindAtVal, done,
    });
    toast('Note updated');
    closeModalFn();
    await loadNotes();
    const fresh = notes.find(n => n.id === editingId);
    syncSend('note-updated', {
      sync_id: note?.sync_id || fresh?.sync_id || '',
      note: {
        sync_id: note?.sync_id || fresh?.sync_id || '',
        title, content, color, remind_at: remindAtVal, done,
        updated_at: fresh?.updated_at || new Date().toISOString(),
      },
    });
  } else {
    const sync_id = generateSyncId();
    const res = await api('POST', '/api/notes', {
      title, content, color, remind_at: remindAtVal, done, sync_id,
    });
    editingId = res.id;
    toast('Note created');
    closeModalFn();
    await loadNotes();
    const fresh = notes.find(n => n.id === editingId);
    syncSend('note-created', {
      note: {
        sync_id: res.sync_id || fresh?.sync_id || sync_id,
        title, content, color,
        remind_at: remindAtVal, done,
        updated_at: fresh?.updated_at || new Date().toISOString(),
      },
    });
  }
}

async function deleteNote() {
  if (!editingId) return;
  if (!confirm('Delete this note?')) return;
  const note = notes.find(n => n.id === editingId);
  const deletedSyncId = note?.sync_id || '';
  await api('DELETE', `/api/notes/${editingId}`);
  toast('Note deleted');
  closeModalFn();
  await loadNotes();
  syncSend('note-deleted', { sync_id: deletedSyncId });
}

// ─── Reminder Presets ─────────────────────────────────────────────────
presetBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const minutes = parseInt(btn.dataset.minutes);
    const d = new Date(Date.now() + minutes * 60 * 1000);
    const pad = n => String(n).padStart(2, '0');
    remindAt.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    presetBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ─── Reminder polling ─────────────────────────────────────────────────
async function pollReminders() {
  try {
    const events = await api('GET', '/api/reminders/poll');
    if (!events.length) return;
    events.forEach(ev => {
      const body = ev.title + (ev.content ? '\n' + ev.content : '');
      Notif.send('⏰ Reminder: ' + ev.title, body, 'reminder-' + ev.id);
      toast('⏰ ' + ev.title);
    });
    updateReminderPanel();
    await loadNotes();
  } catch (_) {}
}

function updateReminderPanel() {
  const upcoming = notes.filter(n => n.remind_at && !n.done);
  upcoming.sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at));

  if (upcoming.length) {
    reminderBadge.textContent = upcoming.length;
    reminderBadge.style.display = 'inline';
  } else {
    reminderBadge.style.display = 'none';
  }

  if (!upcoming.length) {
    reminderList.innerHTML = '<p class="empty-reminders">No upcoming reminders.</p>';
    return;
  }

  reminderList.innerHTML = upcoming.map(n => `
    <div class="reminder-item" data-id="${n.id}">
      <span class="reminder-item-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
      </span>
      <div class="reminder-item-info">
        <h4>${escapeHtml(n.title)}</h4>
        <p>${formatDT(n.remind_at)}</p>
      </div>
    </div>
  `).join('');

  $$('.reminder-item').forEach(el => {
    el.addEventListener('click', () => {
      openNote(Number(el.dataset.id));
      reminderPanel.classList.remove('open');
      overlay.classList.remove('open');
    });
  });
}

// ─── Email reminders ──────────────────────────────────────────────────
async function loadEmailConfig() {
  try {
    const data = await api('GET', '/api/email/config');
    if (!data.available) {
      if (emailReminderGroup) emailReminderGroup.style.display = 'none';
      return;
    }
    if (emailReminderGroup) emailReminderGroup.style.display = '';
    if (emailReminderInput) emailReminderInput.value = data.email || '';
    if (emailStatus) emailStatus.textContent = data.email ? 'Email reminders active' : '';
  } catch (_) {
    if (emailReminderGroup) emailReminderGroup.style.display = 'none';
  }
}

async function saveEmailConfig() {
  const email = emailReminderInput ? emailReminderInput.value.trim() : '';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    toast('Please enter a valid email address.');
    return;
  }
  try {
    const data = await api('PUT', '/api/email/config', { email });
    if (data.ok) {
      toast(email ? 'Email saved.' : 'Email removed.');
      if (emailStatus) emailStatus.textContent = email ? 'Email reminders active' : '';
    }
  } catch (_) {
    toast('Failed to save email config.');
  }
}

if (saveEmailBtn) {
  saveEmailBtn.addEventListener('click', saveEmailConfig);
}

// ─── Reminder panel toggle ────────────────────────────────────────────
toggleRemindersBtn.addEventListener('click', () => {
  reminderPanel.classList.toggle('open');
  overlay.classList.toggle('open');
});
closeReminderPanel.addEventListener('click', () => {
  reminderPanel.classList.remove('open');
  overlay.classList.remove('open');
});

// ─── Sync Panel Toggle ────────────────────────────────────────────────
toggleSyncBtn.addEventListener('click', () => {
  syncPanel.classList.toggle('open');
  overlay.classList.toggle('open');
  initSyncUI();
});
closeSyncPanel.addEventListener('click', () => {
  syncPanel.classList.remove('open');
  overlay.classList.remove('open');
});

// ─── P2P Sync Engine ──────────────────────────────────────────────────
// Per-phrase retry tracking for failed outbound connects.
const connectRetryCount = new Map();
const CONNECT_RETRY_DELAYS = [1000, 3000, 6000, 15000, 30000, 60000];

/** Send a typed message to all connected peers (and queue for not-yet-open). */
function syncSend(type, payload) {
  const msg = { type, sender: myPhrase, timestamp: Date.now(), ...payload };
  if (!peerConnections.length) {
    if (type !== 'sync-full') pendingOutbound.push(msg);
    return;
  }
  let sentAny = false;
  peerConnections.forEach(conn => {
    if (conn.open) {
      try { conn.send(msg); sentAny = true; }
      catch (e) { console.warn('[SYNC] send failed, queued', e); pendingOutbound.push(msg); }
    } else {
      pendingOutbound.push(msg);
    }
  });
}

// Generate a random phrase (3 words + 4 digits)
function generatePhrase() {
  const adj = ['cool', 'calm', 'wild', 'bold', 'keen', 'pure', 'safe', 'fast',
               'warm', 'rare', 'neat', 'nice', 'slim', 'soft', 'fair', 'glad',
               'deep', 'free', 'gold', 'high', 'just', 'kind', 'lite', 'mini'];
  const nouns = ['bird', 'fish', 'star', 'moon', 'tree', 'wave', 'rain', 'wind',
                 'lake', 'hill', 'frog', 'hawk', 'wolf', 'bear', 'deer', 'dove',
                 'rock', 'sand', 'mist', 'dawn'];
  const w1 = adj[Math.floor(Math.random() * adj.length)];
  const w2 = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${w1}-${w2}-${num}`;
}

function getOrCreatePhrase() {
  if (!myPhrase) {
    myPhrase = generatePhrase();
    localStorage.setItem('minotes_phrase', myPhrase);
  }
  return myPhrase;
}

/** Generate a UUID v4 for use as sync_id. */
function generateSyncId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function initSyncUI() {
  const phrase = getOrCreatePhrase();
  myPhraseInput.value = phrase;
  updateQR(phrase);
}

function updateQR(text) {
  qrContainer.innerHTML = '';
  if (!text || typeof QRCode === 'undefined') {
    qrContainer.innerHTML = '<div class="qr-placeholder">' + (text ? 'Loading…' : 'Generate a phrase above to show QR') + '</div>';
    return;
  }
  qrCodeInstance = new QRCode(qrContainer, {
    text: text,
    width: 140,
    height: 140,
    colorDark: '#1a1a1a',
    colorLight: '#faf9f6',
    correctLevel: QRCode.CorrectLevel.M,
  });
}

function setSyncStatus(state, msg) {
  console.log('[SYNC] Status:', state, '-', msg);
  const dot = syncStatus.querySelector('.sync-status-dot');
  dot.className = 'sync-status-dot ' + state;
  syncStatus.querySelector('span:last-child').textContent = msg;

  // Also update header dot
  syncDot.className = 'sync-dot ' + (state === 'online' ? 'online' : state === 'connecting' ? 'connecting' : '');
}

function updatePeersList() {
  const forgetBtn = $('#forgetPeersBtn');
  if (!peerConnections.length) {
    syncPeers.innerHTML = '';
    if (forgetBtn) forgetBtn.style.display = 'none';
    return;
  }
  syncPeers.innerHTML = peerConnections.map((_, i) =>
    `<div class="sync-peer-item" style="display:flex;align-items:center;justify-content:space-between;">
      <span style="display:flex;align-items:center;gap:8px;"><span class="sync-peer-dot"></span><span>Device ${i + 1}</span></span>
      <button class="disconnect-peer-btn" data-index="${i}" style="background:none;border:1px solid var(--border);border-radius:6px;color:var(--text-muted);cursor:pointer;font-size:11px;padding:2px 8px;">Disconnect</button>
    </div>`
  ).join('');
  if (forgetBtn) forgetBtn.style.display = 'block';

  $$('.disconnect-peer-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      const conn = peerConnections[idx];
      if (conn) {
        conn.close();
        peerConnections.splice(idx, 1);
        updatePeersList();
        if (!peerConnections.length) setSyncStatus('online', 'Connected, ready for sync');
      }
    });
  });
}

// ─── Stored peers (auto-reconnect after refresh) ─────────────────────
function getStoredPeers() {
  try { return JSON.parse(localStorage.getItem('minotes_peers') || '[]'); }
  catch { return []; }
}
function saveStoredPeer(phrase) {
  if (!phrase) return;
  const peers = getStoredPeers();
  if (!peers.includes(phrase)) {
    peers.push(phrase);
    localStorage.setItem('minotes_peers', JSON.stringify(peers));
  }
}
function removeStoredPeer(phrase) {
  const peers = getStoredPeers().filter(p => p !== phrase);
  localStorage.setItem('minotes_peers', JSON.stringify(peers));
}
function forgetAllPeers() {
  localStorage.removeItem('minotes_peers');
  peerConnections.forEach(c => c.close());
  peerConnections = [];
  pendingOutbound = [];
  updatePeersList();
  setSyncStatus('online', 'Connected, ready for sync');
}

// Tombstones: keep recently-deleted sync_ids so a late-arriving
// note-created for the same id is dropped instead of resurrecting.
function getTombstones() {
  try { return JSON.parse(localStorage.getItem('minotes_tombstones') || '[]'); }
  catch { return []; }
}
function addTombstone(syncId) {
  if (!syncId) return;
  const list = getTombstones().filter(t => t.sync_id !== syncId);
  list.push({ sync_id: syncId, at: Date.now() });
  // Keep last 200 tombstones; drop anything older than 7 days
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const trimmed = list.filter(t => t.at > cutoff).slice(-200);
  localStorage.setItem('minotes_tombstones', JSON.stringify(trimmed));
}
function isTombstoned(syncId) {
  if (!syncId) return false;
  return getTombstones().some(t => t.sync_id === syncId);
}

// Pending messages waiting for a connection to open.
// Prevents lost updates if the user creates/edits/deletes a note
// before the WebRTC handshake completes.
let pendingOutbound = [];

function flushPending(conn) {
  if (!conn || !conn.open || !pendingOutbound.length) return;
  const queue = pendingOutbound.slice();
  pendingOutbound = [];
  queue.forEach(msg => {
    try { conn.send(msg); } catch (e) { console.warn('[SYNC] flush failed', e); }
  });
}

// ─── PeerJS Sync ──────────────────────────────────────────────────────
async function initPeer() {
  if (peer) {
    peer.destroy();
    peerConnections = [];
  }

  const phrase = getOrCreatePhrase();
  const peerId = 'minotes-' + phrase.replace(/[^a-z0-9-]/gi, '').toLowerCase();

  setSyncStatus('connecting', 'Connecting...');

  peer = new Peer(peerId, { debug: 0 });

  peer.on('open', (id) => {
    setSyncStatus('online', 'Connected, ready for sync');
    // Auto-reconnect to previously connected peers
    const stored = getStoredPeers();
    if (stored.length) {
      stored.forEach(p => {
        if (p !== myPhrase) connectToPeer(p);
      });
    }
  });

  // Symmetric: when WE receive a connection, remember the sender's
  // phrase so we can auto-reconnect to THEM after a refresh.
  peer.on('connection', (conn) => {
    conn.on('open', () => {
      peerConnections.push(conn);
      setSyncStatus('online', `Connected (${peerConnections.length} device${peerConnections.length > 1 ? 's' : ''})`);
      updatePeersList();
      // Save peer's phrase if it announced itself
      if (conn.metadata && conn.metadata.phrase) {
        saveStoredPeer(conn.metadata.phrase);
      }

      // Immediately send all our notes to the new peer
      conn.send({
        type: 'sync-full',
        notes: notes,
        sender: myPhrase,
        timestamp: Date.now(),
      });
      flushPending(conn);
    });

    conn.on('data', (data) => {
      handleSyncData(data, conn);
    });

    conn.on('close', () => {
      peerConnections = peerConnections.filter(c => c !== conn);
      updatePeersList();
      if (!peerConnections.length) setSyncStatus('online', 'Connected, ready for sync');
    });
    conn.on('error', (err) => {
      console.warn('[SYNC] Connection error:', err);
      peerConnections = peerConnections.filter(c => c !== conn);
      updatePeersList();
      if (!peerConnections.length) setSyncStatus('online', 'Connected, ready for sync');
    });
  });

  // Server-side disconnect: try to re-establish.
  peer.on('disconnected', () => {
    setSyncStatus('connecting', 'Reconnecting to signaling server...');
    try { peer && peer.reconnect && peer.reconnect(); } catch (e) {}
  });
  peer.on('close', () => {
    setSyncStatus('offline', 'Sync unavailable (offline?)');
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      // Another device is using this exact peer ID. Append a random
      // suffix and try again. Note: this changes OUR peer ID, so any
      // peer that was reaching us at the old ID will need to re-scan.
      const oldId = peerId;
      peer.destroy();
      peer = null;
      const suffix = Math.random().toString(36).slice(2, 6);
      const newId = oldId + '-' + suffix;
      console.log('[SYNC] Peer ID collision, retrying with:', newId);
      peer = new Peer(newId, { debug: 0 });
      peer.on('open', () => setSyncStatus('online', 'Connected, ready for sync'));
      peer.on('connection', handleIncomingConnection);
      peer.on('disconnected', () => {
        try { peer && peer.reconnect && peer.reconnect(); } catch (e) {}
      });
      peer.on('error', (e) => {
        if (e.type === 'unavailable-id') {
          // Still colliding - bail and let user regenerate manually
          setSyncStatus('offline', 'Sync ID collision. Regenerate phrase.');
        } else {
          setSyncStatus('offline', 'Sync unavailable (offline?)');
        }
        console.warn('PeerJS error:', e.type);
      });
      return;
    }
    if (err.type === 'network' || err.type === 'server-error' ||
        err.type === 'socket-error' || err.type === 'socket-closed') {
      // Transient: keep peer, status will recover on reconnect.
      setSyncStatus('connecting', 'Reconnecting...');
      return;
    }
    setSyncStatus('offline', 'Sync unavailable (offline?)');
    console.warn('PeerJS error:', err.type);
  });
}

function handleIncomingConnection(conn) {
  conn.on('open', () => {
    peerConnections.push(conn);
    updatePeersList();
    if (conn.metadata && conn.metadata.phrase) {
      saveStoredPeer(conn.metadata.phrase);
    }
    // Send our notes to the new peer
    conn.send({
      type: 'sync-full',
      notes: notes,
      sender: myPhrase,
      timestamp: Date.now(),
    });
    flushPending(conn);
  });
  conn.on('data', (data) => handleSyncData(data, conn));
  conn.on('close', () => {
    peerConnections = peerConnections.filter(c => c !== conn);
    updatePeersList();
    if (!peerConnections.length) setSyncStatus('online', 'Connected, ready for sync');
  });
  conn.on('error', (err) => {
    console.warn('[SYNC] Connection error:', err);
    peerConnections = peerConnections.filter(c => c !== conn);
    updatePeersList();
    if (!peerConnections.length) setSyncStatus('online', 'Connected, ready for sync');
  });
}

function connectToPeer(remotePhrase) {
  if (!peer || !remotePhrase) return;
  const remoteId = 'minotes-' + remotePhrase.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  if (remoteId === 'minotes-' + (myPhrase || '').replace(/[^a-z0-9-]/gi, '').toLowerCase()) {
    return; // don't connect to ourselves
  }
  const conn = peer.connect(remoteId, {
    reliable: true,
    metadata: { phrase: myPhrase }, // tell the other side who we are
  });

  // Save for auto-reconnect after refresh
  saveStoredPeer(remotePhrase);

  let opened = false;
  let retried = false;

  conn.on('open', () => {
    opened = true;
    peerConnections.push(conn);
    setSyncStatus('online', `Connected (${peerConnections.length} device${peerConnections.length > 1 ? 's' : ''})`);
    updatePeersList();
    // Send all our notes on connect
    conn.send({
      type: 'sync-full',
      notes: notes,
      sender: myPhrase,
      timestamp: Date.now(),
    });
    flushPending(conn);
  });

  conn.on('data', (data) => handleSyncData(data, conn));

  conn.on('close', () => {
    peerConnections = peerConnections.filter(c => c !== conn);
    updatePeersList();
    if (!peerConnections.length) setSyncStatus('online', 'Connected, ready for sync');
  });

  conn.on('error', () => {
    // Single retry after a short delay (peer might still be registering)
    if (!opened && !retried) {
      retried = true;
      setTimeout(() => {
        if (!peer || peer.destroyed) return;
        const retry = peer.connect(remoteId, {
          reliable: true,
          metadata: { phrase: myPhrase },
        });
        retry.on('open', () => {
          peerConnections.push(retry);
          updatePeersList();
          retry.send({
            type: 'sync-full',
            notes: notes,
            sender: myPhrase,
            timestamp: Date.now(),
          });
          flushPending(retry);
        });
        retry.on('data', (data) => handleSyncData(data, retry));
        retry.on('close', () => {
          peerConnections = peerConnections.filter(c => c !== retry);
          updatePeersList();
          if (!peerConnections.length) setSyncStatus('online', 'Connected, ready for sync');
        });
        retry.on('error', () => {
          toast('Could not connect. Check the phrase');
          removeStoredPeer(remotePhrase);
        });
      }, 1500);
      return;
    }
    toast('Could not connect. Check the phrase');
    removeStoredPeer(remotePhrase);
  });
}

async function handleSyncData(data, conn) {
  if (!data || !data.type) return;
  // Skip messages from self to prevent echo loops
  if (data.sender === myPhrase) return;

  // Remember the sender so the receiver can auto-reconnect later.
  if (data.sender) saveStoredPeer(data.sender);

  try {
    if (data.type === 'note-created' && data.note) {
      const n = data.note;
      if (!n.sync_id) return;
      if (isTombstoned(n.sync_id)) return; // we deleted it after a refresh - keep it deleted
      // Check if we already have this note
      if (notes.some(local => local.sync_id === n.sync_id)) return;
      await api('POST', '/api/notes', {
        title: n.title || 'Untitled',
        content: n.content || '',
        color: /^#[0-9a-fA-F]{6}$/.test(n.color) ? n.color : '#ffffff',
        remind_at: n.remind_at || null,
        done: n.done || 0,
        sync_id: n.sync_id,
      });
      toast('Note synced from peer');
      await loadNotes();
    }

    else if (data.type === 'note-updated' && data.note) {
      const n = data.note;
      let local = notes.find(x => x.sync_id === data.sync_id);
      if (!local) {
        // Don't have it yet (e.g. note-created was missed). Create it
        // from the payload so updates aren't lost.
        if (!n.sync_id || isTombstoned(n.sync_id)) return;
        await api('POST', '/api/notes', {
          title: n.title || 'Untitled',
          content: n.content || '',
          color: /^#[0-9a-fA-F]{6}$/.test(n.color) ? n.color : '#ffffff',
          remind_at: n.remind_at || null,
          done: n.done || 0,
          sync_id: n.sync_id,
        });
        await loadNotes();
        toast('Note synced from peer');
        return;
      }
      // Last-write-wins: only overwrite if the remote change is newer
      const remoteTs = n.updated_at ? new Date(n.updated_at).getTime() : Date.now();
      const localTs = local.updated_at ? new Date(local.updated_at).getTime() : 0;
      if (remoteTs < localTs) return;
      await api('PUT', `/api/notes/${local.id}`, {
        title: n.title, content: n.content,
        color: n.color, remind_at: n.remind_at,
        done: n.done,
      });
      await loadNotes();
    }

    else if (data.type === 'note-deleted') {
      const syncId = data.sync_id;
      addTombstone(syncId); // remember so a late note-created can't resurrect it
      const local = notes.find(x => x.sync_id === syncId);
      if (!local) return;
      await api('DELETE', `/api/notes/${local.id}`);
      toast('Peer deleted a note');
      await loadNotes();
    }

    else if (data.type === 'note-toggled') {
      const n = data.note || {};
      let local = notes.find(x => x.sync_id === data.sync_id);
      if (!local) {
        // Don't have the note yet - create it as already-toggled so the
        // done state is preserved. Use the payload fields if we have them.
        if (!data.sync_id || isTombstoned(data.sync_id)) return;
        await api('POST', '/api/notes', {
          title: n.title || 'Untitled',
          content: n.content || '',
          color: /^#[0-9a-fA-F]{6}$/.test(n.color) ? n.color : '#ffffff',
          remind_at: n.remind_at || null,
          done: data.done,
          sync_id: data.sync_id,
        });
        await loadNotes();
        return;
      }
      await api('PUT', `/api/notes/${local.id}`, { done: data.done });
      await loadNotes();
    }

    else if (data.type === 'sync-full' && data.notes) {
      // Full-sync: merge all notes from peer (used on initial connect)
      for (const remoteNote of data.notes) {
        if (!remoteNote.sync_id) continue;
        if (isTombstoned(remoteNote.sync_id)) continue;
        const match = notes.find(n => n.sync_id === remoteNote.sync_id);
        if (match) {
          // Last-write-wins: only overwrite if remote is newer
          const remoteTs = remoteNote.updated_at ? new Date(remoteNote.updated_at).getTime() : Date.now();
          const localTs = match.updated_at ? new Date(match.updated_at).getTime() : 0;
          if (remoteTs < localTs) continue;
          if (match.title !== remoteNote.title ||
              match.content !== remoteNote.content ||
              match.done !== remoteNote.done ||
              match.color !== remoteNote.color ||
              match.remind_at !== remoteNote.remind_at) {
            await api('PUT', `/api/notes/${match.id}`, {
              title: remoteNote.title || 'Untitled',
              content: remoteNote.content || '',
              color: /^#[0-9a-fA-F]{6}$/.test(remoteNote.color) ? remoteNote.color : '#ffffff',
              remind_at: remoteNote.remind_at || null,
              done: remoteNote.done || 0,
            });
          }
        } else {
          await api('POST', '/api/notes', {
            title: remoteNote.title || 'Untitled',
            content: remoteNote.content || '',
            color: /^#[0-9a-fA-F]{6}$/.test(remoteNote.color) ? remoteNote.color : '#ffffff',
            remind_at: remoteNote.remind_at || null,
            done: remoteNote.done || 0,
            sync_id: remoteNote.sync_id,
          });
        }
      }
      toast('Full sync from peer');
      await loadNotes();
    }
  } catch (e) {
    console.warn('[SYNC] Error handling peer data:', e);
  }
}

/** Periodic full-sync broadcast (kept as fallback). */
function broadcastSync() {
  if (!peerConnections.length) return;
  const data = {
    type: 'sync-full',
    notes: notes,
    sender: myPhrase,
    timestamp: Date.now(),
  };
  peerConnections.forEach(conn => {
    if (conn.open) conn.send(data);
  });
}

// ─── Sync UI Events ───────────────────────────────────────────────────
forgetPeersBtn.addEventListener('click', () => {
  if (!peerConnections.length) return;
  if (!confirm('Disconnect all synced devices?')) return;
  forgetAllPeers();
});

copyPhraseBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(myPhraseInput.value).then(() => {
    toast('Phrase copied');
  });
});

regeneratePhraseBtn.addEventListener('click', () => {
  const newPhrase = generatePhrase();
  myPhrase = newPhrase;
  localStorage.setItem('minotes_phrase', myPhrase);
  localStorage.removeItem('minotes_peers');
  myPhraseInput.value = myPhrase;
  updateQR(myPhrase);
  initPeer();
  toast('New phrase generated. Other devices will need this');
});

connectBtn.addEventListener('click', () => {
  const phrase = peerPhraseInput.value.trim();
  if (!phrase) {
    toast('Enter a sync phrase first');
    return;
  }
  connectToPeer(phrase);
  peerPhraseInput.value = '';
});

// Allow Enter to connect
peerPhraseInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') connectBtn.click();
});

// ─── QR Scanner ──────────────────────────────────────────────────────
let html5QrCode = null;
let scannerRunning = false;

scanQrBtn.addEventListener('click', () => {
  scannerOverlay.classList.add('open');
  scannerResult.style.display = 'none';
  startScanner();
});

closeScannerBtn.addEventListener('click', () => {
  stopScanner();
  scannerOverlay.classList.remove('open');
});

function startScanner() {
  if (scannerRunning) return;
  if (typeof Html5Qrcode === 'undefined') {
    toast('QR scanner library not loaded yet');
    return;
  }
  try {
    html5QrCode = new Html5Qrcode('scannerViewport');
    html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      onScanSuccess,
      () => {}
    );
    scannerRunning = true;
  } catch (e) {
    toast('Camera access denied or unavailable');
    scannerOverlay.classList.remove('open');
  }
}

function stopScanner() {
  if (html5QrCode) {
    try {
      html5QrCode.stop();
    } catch (_) {}
    html5QrCode = null;
  }
  scannerRunning = false;
}

function onScanSuccess(decodedText) {
  const phrase = decodedText.trim().toLowerCase();
  if (!phrase) return;
  // Validate phrase format (should match word-word-####)
  if (!/^[a-z]+-[a-z]+-\d{4}$/.test(phrase)) {
    toast('Invalid sync phrase. Scan a valid minotes QR code');
    stopScanner();
    return;
  }
  stopScanner();
  scannedPhrase.textContent = phrase;
  scannerResult.style.display = 'flex';
  setTimeout(() => {
    connectToPeer(phrase);
    scannerOverlay.classList.remove('open');
    scannerResult.style.display = 'none';
    toast('Connecting via QR scan…');
  }, 800);
}

connectScannedBtn.addEventListener('click', () => {
  const phrase = scannedPhrase.textContent.trim();
  if (phrase) connectToPeer(phrase);
  scannerOverlay.classList.remove('open');
  scannerResult.style.display = 'none';
});

// ─── Service Worker ───────────────────────────────────────────────────
/** Register the SW (only handles notifications, no caching). */
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    console.log('[SW] Registered, scope:', reg.scope);
    // On update, reload so the new SW takes over immediately
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'activated') window.location.reload();
      });
    });
    return reg;
  } catch (e) {
    console.warn('[SW] Registration failed:', e);
  }
}

// ─── Notification Manager ────────────────────────────────────────────
// Unified system: postMessage to SW → reg.showNotification → new Notification()
const Notif = {
  get permission() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  },

  /** Request permission (call from user gesture). */
  async request() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    const result = await Notification.requestPermission();
    if (result === 'granted') toast('Notifications enabled');
    return result;
  },

  /** Show a notification. Returns true if shown. */
  async send(title, body, tag) {
    if (this.permission !== 'granted') return false;
    tag = tag || 'notif-' + Date.now();
    const icon = '/static/icon-192.svg';

    // Path 1: postMessage to active SW
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg?.active) {
        reg.active.postMessage({ type: 'NOTIFY', title, body, tag, icon, url: '/' });
        console.log('[NOTIF] Sent via SW:', title);
        return true;
      }
    } catch (e) {
      console.warn('[NOTIF] postMessage failed:', e);
    }

    // Path 2: reg.showNotification
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, { body, icon, tag, data: { url: '/' } });
      console.log('[NOTIF] Shown via reg:', title);
      return true;
    } catch (e) {
      console.warn('[NOTIF] reg.showNotification failed:', e);
    }

    // Path 3: Direct Notification constructor
    try {
      new Notification(title, { body, icon });
      console.log('[NOTIF] Shown via direct API:', title);
      return true;
    } catch (e) {
      console.warn('[NOTIF] All notification paths failed:', e);
      return false;
    }
  },

  /** Test notification. Requests permission if needed. */
  async test() {
    if (this.permission === 'unsupported') { toast('Notifications not supported'); return; }
    if (this.permission === 'denied') { toast('Notifications are blocked. Enable in browser settings'); return; }
    if (this.permission === 'default') {
      const result = await this.request();
      if (result !== 'granted') { toast('Permission denied'); return; }
    }
    toast('Test notification incoming...');
    await this.send(
      'minotes - Test',
      'This is a test notification from minotes',
      'test-' + Date.now()
    );
  },

  /** Show the in-app permission prompt if not yet decided. */
  showPromptIfNeeded() {
    if (this.permission !== 'default') return;
    if (localStorage.getItem('minotes_notif_dismissed')) return;
    notifPrompt.classList.add('visible');
  },
};

// Notification prompt - Enable/Later
notifEnableBtn.addEventListener('click', async () => {
  notifPrompt.classList.remove('visible');
  const result = await Notif.request();
  if (result === 'granted') {
    localStorage.removeItem('minotes_notif_dismissed');
    Notif.send('minotes', 'Notifications are enabled!');
  } else {
    localStorage.setItem('minotes_notif_dismissed', 'true');
  }
});
notifLaterBtn.addEventListener('click', () => {
  notifPrompt.classList.remove('visible');
  localStorage.setItem('minotes_notif_dismissed', 'true');
});

// Test notification button in settings
testNotifBtn.addEventListener('click', () => Notif.test());

// ─── Settings Panel ───────────────────────────────────────────────────
toggleSettingsBtn.addEventListener('click', () => {
  settingsPanel.classList.toggle('open');
  overlay.classList.toggle('open');
});
closeSettingsPanel.addEventListener('click', () => {
  settingsPanel.classList.remove('open');
  overlay.classList.remove('open');
});

// ─── Dark Mode ────────────────────────────────────────────────────────
function initDarkMode() {
  const saved = localStorage.getItem('minotes_darkMode');
  if (saved === 'true') {
    document.documentElement.setAttribute('data-theme', 'dark');
    darkModeToggle.checked = true;
  } else if (saved === null && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
    darkModeToggle.checked = true;
    localStorage.setItem('minotes_darkMode', 'true');
  }
}

darkModeToggle.addEventListener('change', () => {
  if (darkModeToggle.checked) {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('minotes_darkMode', 'true');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('minotes_darkMode', 'false');
  }
});

// ─── Export / Import ──────────────────────────────────────────────────
exportNotesBtn.addEventListener('click', () => {
  const data = JSON.stringify(notes, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `minotes-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Notes exported');
});

importNotesBtn.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!Array.isArray(imported)) throw new Error('Invalid');
        for (const n of imported) {
          if (!n.title) continue;
          await api('POST', '/api/notes', {
            title: n.title, content: n.content || '',
            color: /^#[0-9a-fA-F]{6}$/.test(n.color) ? n.color : '#ffffff',
            remind_at: n.remind_at || null,
            done: n.done || 0,
          });
        }
        await loadNotes();
        toast(`Imported ${imported.length} notes`);
      } catch (err) {
        toast('Failed to import. Invalid file');
      }
    };
    reader.readAsText(file);
  });
  input.click();
});

// ─── Hidden Admin Panel ──────────────────────────────────────────────
logo.addEventListener('click', () => {
  logoClickCount++;
  if (logoClickTimer) clearTimeout(logoClickTimer);
  logoClickTimer = setTimeout(() => { logoClickCount = 0; }, 2000);
  if (logoClickCount >= 5) {
    logoClickCount = 0;
    adminSection.style.display = 'block';
    toast('Admin panel unlocked');
    settingsPanel.classList.add('open');
    overlay.classList.add('open');
  }
});

const SAMPLE_NOTES = [
  { title: 'Welcome to minotes!', content: 'This is a sample note. Start typing to replace it, or tap and create a new one.\n\n• Click + New Note to create\n• Double-click a note to toggle Done\n• Use reminders via the reminder button', color: '#fef3c7', done: 0 },
  { title: 'Meeting Notes', content: 'Q2 Planning:\n- Review roadmap\n- Assign sprint goals\n- Set OKRs for next quarter\n- Schedule follow-up', color: '#dbeafe', done: 0 },
  { title: 'Shopping List', content: '• Avocados\n• Bread\n• Almond milk\n• Broccoli\n• Dark chocolate', color: '#dcfce7', done: 0 },
  { title: 'Idea: Color Picker', content: 'Would be nice to have a quick color palette picker for notes. Could use it for categorizing projects and personal stuff.', color: '#fce7f3', done: 0, pinned: 1 },
  { title: 'Done Example', content: 'This note is already done. Double-click any note to toggle its done status.', color: '#f5f5f4', done: 1 },
];

const DEMO_NOTES = [
  { title: 'Project Alpha', content: 'Status: In Progress\n\nFrontend: 80% complete\nBackend: 45% complete\nDesign: Review pending', color: '#dbeafe', done: 0, pinned: 1 },
  { title: 'Homepage redesign', content: 'New hero section, updated color palette, responsive navigation', color: '#dcfce7', done: 1 },
  { title: 'API integration', content: 'REST endpoints for user auth and data sync', color: '#dcfce7', done: 1 },
  { title: 'Database migration', content: 'Moving from SQLite to PostgreSQL. Migration script ready for review.', color: '#fef3c7', done: 0 },
  { title: 'Bug: Login redirect', content: 'After OAuth login, users are redirected to /404 instead of /dashboard.', color: '#fce7f3', done: 0, pinned: 1 },
  { title: 'Sprint Review', content: 'Team: 8/10 stories completed\nVelocity: 42 points\nBlockers: None', color: '#fef3c7', done: 0 },
  { title: 'Unit tests for auth', content: 'Coverage at 92%. All critical paths tested', color: '#dcfce7', done: 1 },
  { title: 'Dark mode support', content: 'Implemented CSS custom properties, toggle in settings', color: '#dcfce7', done: 1 },
  { title: 'Deployment v2.1', content: 'Target: Next Tuesday\nIncludes: Bug fixes + performance', color: '#f5f5f4', done: 0 },
];

async function addPremadeNotes(list) {
  for (const n of list) {
    await api('POST', '/api/notes', {
      title: n.title, content: n.content,
      color: n.color, remind_at: n.remind_at || null, done: n.done || 0,
    });
  }
  await loadNotes();
  toast(`Loaded ${list.length} notes`);
  settingsPanel.classList.remove('open');
  overlay.classList.remove('open');
}

loadSampleNotesBtn.addEventListener('click', () => addPremadeNotes(SAMPLE_NOTES));
loadDemoBoardBtn.addEventListener('click', () => addPremadeNotes(DEMO_NOTES));

clearAllNotesBtn.addEventListener('click', async () => {
  if (!confirm('Delete ALL notes? This cannot be undone.')) return;
  if (!confirm('Are you sure? All notes will be permanently deleted.')) return;
  const allNotes = [...notes];
  for (const n of allNotes) {
    await api('DELETE', `/api/notes/${n.id}`);
  }
  await loadNotes();
  toast('All notes cleared');
  settingsPanel.classList.remove('open');
  overlay.classList.remove('open');
});

// ─── Intro Slideshow ─────────────────────────────────────────────────
let slideIndex = 0;
let slideInterval = null;
const TOTAL_SLIDES = 5;
const SLIDE_DELAY = 4000;

function initIntroSlideshow() {
  if (localStorage.getItem('minotes_introDismissed')) {
    introSlideshow.classList.add('hidden');
    return;
  }
  // Dot clicks
  document.querySelectorAll('.slide-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      clearInterval(slideInterval);
      goToSlide(parseInt(dot.dataset.index));
      startSlideTimer();
    });
  });
  // Nav arrows
  $('#slideNext').addEventListener('click', () => {
    clearInterval(slideInterval);
    nextSlide();
    startSlideTimer();
  });
  $('#slidePrev').addEventListener('click', () => {
    clearInterval(slideInterval);
    prevSlide();
    startSlideTimer();
  });
  startSlideTimer();
}

function goToSlide(index) {
  slideIndex = index;
  document.querySelectorAll('.slide').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.slide-dot').forEach(d => d.classList.remove('active'));
  document.querySelector(`.slide[data-index="${index}"]`).classList.add('active');
  document.querySelector(`.slide-dot[data-index="${index}"]`).classList.add('active');
}

function nextSlide() {
  goToSlide((slideIndex + 1) % TOTAL_SLIDES);
}

function prevSlide() {
  goToSlide((slideIndex - 1 + TOTAL_SLIDES) % TOTAL_SLIDES);
}

function startSlideTimer() {
  if (slideInterval) clearInterval(slideInterval);
  slideInterval = setInterval(nextSlide, SLIDE_DELAY);
}



introDismiss.addEventListener('click', () => {
  introSlideshow.classList.add('hidden');
  localStorage.setItem('minotes_introDismissed', 'true');
  if (slideInterval) clearInterval(slideInterval);
});

introSkip.addEventListener('click', () => {
  introSlideshow.classList.add('hidden');
  localStorage.setItem('minotes_introDismissed', 'true');
  if (slideInterval) clearInterval(slideInterval);
});

// ─── Done toggle helper ───────────────────────────────────────────────
async function toggleDone(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  const newDone = note.done ? 0 : 1;
  await api('PUT', `/api/notes/${id}`, { done: newDone });
  await loadNotes();
  const fresh = notes.find(n => n.id === id);
  const msg = newDone ? 'Marked as done' : 'Reopened';
  toast(msg);
  syncSend('note-toggled', {
    sync_id: note.sync_id || fresh?.sync_id || '',
    done: newDone,
    note: {
      sync_id: note.sync_id || fresh?.sync_id || '',
      title: note.title,
      content: note.content,
      color: note.color,
      remind_at: note.remind_at,
      done: newDone,
      updated_at: fresh?.updated_at || new Date().toISOString(),
    },
  });
}

// ─── Event listeners ──────────────────────────────────────────────────

newNoteBtn.addEventListener('click', newNote);
closeModal.addEventListener('click', closeModalFn);
backdrop.addEventListener('click', closeModalFn);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal.classList.contains('open')) closeModalFn();
});

colorDots.forEach(dot => {
  dot.addEventListener('click', () => {
    colorDots.forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    selectedColor = dot.dataset.color;
    modalContent.style.background = selectedColor;
  });
});

saveBtn.addEventListener('click', saveNote);
deleteBtn.addEventListener('click', deleteNote);
clearReminderBtn.addEventListener('click', () => { remindAt.value = ''; presetBtns.forEach(b => b.classList.remove('active')); });

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && modal.classList.contains('open')) {
    e.preventDefault();
    saveNote();
  }
});

overlay.addEventListener('click', () => {
  reminderPanel.classList.remove('open');
  syncPanel.classList.remove('open');
  settingsPanel.classList.remove('open');
  closeModalFn();
});

// ─── Init ─────────────────────────────────────────────────────────────
async function init() {
  await registerSW();
  initDarkMode();
  initIntroSlideshow();
  Notif.showPromptIfNeeded();
  await loadNotes();
  updateReminderPanel();
  loadEmailConfig();

  // Init P2P sync
  getOrCreatePhrase();
  try {
    const tryPeer = () => {
      if (typeof Peer !== 'undefined') initPeer();
      else setTimeout(tryPeer, 1000);
    };
    tryPeer();
  } catch (e) {
    console.warn('PeerJS init deferred', e);
  }

  // Poll for reminders every 10 seconds (SW is ready at this point)
  reminderPollInterval = setInterval(pollReminders, 10000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pollReminders();
  });

  // Periodic sync - broadcast notes every 30s when connected
  setInterval(() => {
    if (peerConnections.length) broadcastSync();
  }, 30000);
}

init();
