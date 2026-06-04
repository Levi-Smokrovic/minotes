/* =====================================================================
   minotes — Static (localStorage) App for GitHub Pages
   ===================================================================== */

// ─── State ────────────────────────────────────────────────────────────
let notes = [];
let editingId = null;
let currentFilter = 'all';
let peer = null;
let peerConnections = [];
let myPhrase = localStorage.getItem('minotes_phrase') || '';
let reminderTimers = new Map();
let qrCodeInstance = null;

// ─── DOM refs ─────────────────────────────────────────────────────────
const $ = (s, p) => (p || document).querySelector(s);
const $$ = (s, p) => [...(p || document).querySelectorAll(s)];

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
const notifPrompt = $('#notifPrompt');
const notifEnableBtn = $('#notifEnableBtn');
const notifLaterBtn = $('#notifLaterBtn');
const testNotifBtn = $('#testNotifBtn');
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
const forgetPeersBtn = $('#forgetPeersBtn');

let selectedColor = '#ffffff';
let adminClickCount = 0;

// ─── localStorage helpers ─────────────────────────────────────────────
function loadNotesFromStorage() {
  try {
    return JSON.parse(localStorage.getItem('minotes_notes') || '[]');
  } catch { return []; }
}

function saveNotesToStorage() {
  try {
    localStorage.setItem('minotes_notes', JSON.stringify(notes));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      toast('⚠️ Storage full! Export and clear old notes.');
      console.error('[STORAGE] localStorage full:', e);
    } else {
      throw e;
    }
  }
}

let nextId = parseInt(localStorage.getItem('minotes_nextId') || '1');

function getNextId() {
  const id = nextId++;
  localStorage.setItem('minotes_nextId', String(nextId));
  return id;
}

// ─── Helpers ──────────────────────────────────────────────────────────
function formatDT(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
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

function nowISO() { return new Date().toISOString(); }

// ─── CRUD ─────────────────────────────────────────────────────────────
function loadNotes() {
  notes = loadNotesFromStorage();
  renderNotes();
  updateReminderPanel();
  scheduleReminders();
}

function createNote(title, content, color, remind_at, done, sync_id) {
  const note = {
    id: getNextId(),
    title: title || 'Untitled',
    content: content || '',
    color: color || '#ffffff',
    pinned: 0,
    done: done ? 1 : 0,
    remind_at: remind_at || null,
    sync_id: sync_id || generateSyncId(),
    created_at: nowISO(),
    updated_at: nowISO(),
  };
  notes.unshift(note);
  saveNotesToStorage();
  loadNotes();
  return note;
}

function updateNote(id, fields) {
  const idx = notes.findIndex(n => n.id === id);
  if (idx === -1) return;
  Object.assign(notes[idx], fields, { updated_at: nowISO() });
  saveNotesToStorage();
  loadNotes();
}

function deleteNote(id) {
  notes = notes.filter(n => n.id !== id);
  saveNotesToStorage();
  loadNotes();
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
      <span class="empty-icon">~</span><br/>${msg}<br/>
      <span class="empty-sub">${sub}</span>
    </p>`;
    return;
  }

  grid.innerHTML = filtered.map(n => {
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
    const doneBadge = isDone ? '<span class="note-card-done-badge">✓ Done</span>' : '';

    return `<div class="note-card ${doneClass}" data-id="${n.id}" ${bg}>
      <div class="note-card-header">
        <h3>${escapeHtml(n.title || 'Untitled')}</h3>
        ${n.pinned ? '<span class="note-card-pinned">📌</span>' : ''}
      </div>
      <div class="note-card-content">${escapeHtml(contentPreview)}</div>
      <div class="note-card-footer">
        <span>${reminderLabel}</span>
        <span>${doneBadge}</span>
      </div>
    </div>`;
  }).join('');

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

function saveNote() {
  const title = noteTitle.value.trim() || 'Untitled';
  const content = noteContent.value;
  const remindAtVal = remindAt.value || null;
  const color = selectedColor;
  const done = doneToggle.checked ? 1 : 0;

  if (editingId) {
    const note = notes.find(n => n.id === editingId);
    updateNote(editingId, { title, content, color, remind_at: remindAtVal, done });
    toast('Note updated ✨');
    closeModalFn();
    syncSend('note-updated', {
      sync_id: note?.sync_id || '',
      note: { title, content, color, remind_at: remindAtVal, done },
    });
  } else {
    const note = createNote(title, content, color, remindAtVal, done);
    toast('Note created ✨');
    closeModalFn();
    syncSend('note-created', {
      note: {
        sync_id: note.sync_id,
        title: note.title, content: note.content,
        color: note.color, remind_at: note.remind_at,
        done: note.done,
      },
    });
  }
}

function deleteNoteFn() {
  if (!editingId) return;
  if (!confirm('Delete this note?')) return;
  const note = notes.find(n => n.id === editingId);
  const deletedSyncId = note?.sync_id || '';
  deleteNote(editingId);
  toast('Note deleted');
  closeModalFn();
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

// ─── Reminder Scheduling ──────────────────────────────────────────────
function scheduleReminders() {
  // Clear all existing timers
  reminderTimers.forEach(t => clearTimeout(t));
  reminderTimers.clear();

  const now = Date.now();
  notes.forEach(n => {
    if (!n.remind_at || n.done) return;
    const t = new Date(n.remind_at).getTime();
    const delay = t - now;
    if (delay > 0) {
      const timer = setTimeout(() => fireReminder(n), delay);
      reminderTimers.set(n.id, timer);
    }
  });
}

function fireReminder(note) {
  const title = note.title || 'Untitled';
  toast('⏰ ' + title);
  const body = note.content ? title + '\n' + note.content : title;
  Notif.send('⏰ Reminder: ' + title, body, 'reminder-' + note.id);

  // Clear the reminder
  updateNote(note.id, { remind_at: null });
}

// ─── Reminder Panel ───────────────────────────────────────────────────
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
      <span class="reminder-item-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg></span>
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

toggleRemindersBtn.addEventListener('click', () => {
  reminderPanel.classList.toggle('open');
  overlay.classList.toggle('open');
});
closeReminderPanel.addEventListener('click', () => {
  reminderPanel.classList.remove('open');
  overlay.classList.remove('open');
});

// ─── Sync Panel ───────────────────────────────────────────────────────
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

/** Send a typed message to all connected peers. */
function syncSend(type, payload) {
  if (!peerConnections.length) return;
  const msg = { type, sender: myPhrase, timestamp: Date.now(), ...payload };
  peerConnections.forEach(conn => {
    if (conn.open) conn.send(msg);
  });
}

/** Generate a UUID v4 for use as sync_id. */
function generateSyncId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function generatePhrase() {
  const adj = ['cool','calm','wild','bold','keen','pure','safe','fast',
               'warm','rare','neat','nice','slim','soft','fair','glad',
               'deep','free','gold','high','just','kind','lite','mini'];
  const nouns = ['bird','fish','star','moon','tree','wave','rain','wind',
                 'lake','hill','frog','hawk','wolf','bear','deer','dove',
                 'rock','sand','mist','dawn'];
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

function initSyncUI() {
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
    text, width: 140, height: 140,
    colorDark: '#1a1a1a', colorLight: '#faf9f6',
    correctLevel: QRCode.CorrectLevel.M,
  });
}

function setSyncStatus(state, msg) {
  const dot = syncStatus.querySelector('.sync-status-dot');
  dot.className = 'sync-status-dot ' + state;
  syncStatus.querySelector('span:last-child').textContent = msg;
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

  // Individual disconnect buttons
  $$('.disconnect-peer-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      const conn = peerConnections[idx];
      if (conn) {
        conn.close();
        peerConnections.splice(idx, 1);
        updatePeersList();
        if (!peerConnections.length) setSyncStatus('online', 'Connected — ready for sync');
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
  updatePeersList();
  setSyncStatus('online', 'Connected — ready for sync');
  toast('Forgot all peers');
}

// ─── PeerJS Sync ──────────────────────────────────────────────────────
async function initPeer() {
  if (peer) { peer.destroy(); peerConnections = []; }
  const phrase = getOrCreatePhrase();
  const peerId = 'minotes-' + phrase.replace(/[^a-z0-9-]/gi, '').toLowerCase();

  if (typeof Peer === 'undefined') {
    setSyncStatus('offline', 'PeerJS not loaded yet');
    return;
  }

  setSyncStatus('connecting', 'Connecting...');
  peer = new Peer(peerId, { debug: 0 });

  peer.on('open', () => {
    setSyncStatus('online', 'Connected — ready for sync');
    // Auto-reconnect to previously connected peers
    const stored = getStoredPeers();
    if (stored.length) {
      stored.forEach(p => {
        if (p !== myPhrase) connectToPeer(p);
      });
    }
  });

  peer.on('connection', (conn) => {
    conn.on('open', () => {
      peerConnections.push(conn);
      setSyncStatus('online', `Connected (${peerConnections.length} device${peerConnections.length > 1 ? 's' : ''})`);
      updatePeersList();

      // Immediately send all our notes to the new peer
      conn.send({
        type: 'sync-full',
        notes: notes,
        sender: myPhrase,
        timestamp: Date.now(),
      });
    });
    conn.on('data', (data) => handleSyncData(data));
    conn.on('close', () => {
      peerConnections = peerConnections.filter(c => c !== conn);
      updatePeersList();
      if (!peerConnections.length) setSyncStatus('online', 'Connected — ready for sync');
    });
    conn.on('error', (err) => {
      console.warn('[SYNC] Connection error:', err);
      peerConnections = peerConnections.filter(c => c !== conn);
      updatePeersList();
      if (!peerConnections.length) setSyncStatus('online', 'Connected — ready for sync');
    });
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      peer.destroy();
      peer = null;
      // Retry with random suffix — all handlers will be re-attached
      const suffix = Math.random().toString(36).slice(2, 6);
      const newId = peerId + '-' + suffix;
      console.log('[SYNC] Peer ID collision, retrying with:', newId);
      peer = new Peer(newId, { debug: 0 });
      peer.on('open', () => setSyncStatus('online', 'Connected — ready for sync'));
      peer.on('connection', handleIncomingConnection);
      peer.on('error', (e) => {
        setSyncStatus('offline', 'Sync unavailable (offline?)');
      });
      return;
    }
    setSyncStatus('offline', 'Sync unavailable (offline?)');
  });
}

function handleIncomingConnection(conn) {
  conn.on('open', () => {
    peerConnections.push(conn);
    updatePeersList();

    // Send our notes to the new peer
    conn.send({
      type: 'sync-full',
      notes: notes,
      sender: myPhrase,
      timestamp: Date.now(),
    });
  });
  conn.on('data', (data) => handleSyncData(data));
  conn.on('close', () => {
    peerConnections = peerConnections.filter(c => c !== conn);
    updatePeersList();
    if (!peerConnections.length) setSyncStatus('online', 'Connected — ready for sync');
  });
  conn.on('error', (err) => {
    console.warn('[SYNC] Connection error:', err);
    peerConnections = peerConnections.filter(c => c !== conn);
    updatePeersList();
    if (!peerConnections.length) setSyncStatus('online', 'Connected — ready for sync');
  });
}

function connectToPeer(remotePhrase) {
  if (!peer) return;
  const remoteId = 'minotes-' + remotePhrase.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  const conn = peer.connect(remoteId, { reliable: true });

  // Save for auto-reconnect after refresh
  saveStoredPeer(remotePhrase);

  conn.on('open', () => {
    peerConnections.push(conn);
    setSyncStatus('online', `Connected (${peerConnections.length} device${peerConnections.length > 1 ? 's' : ''})`);
    updatePeersList();

    // Send all our notes AND request theirs
    conn.send({
      type: 'sync-full',
      notes: notes,
      sender: myPhrase,
      timestamp: Date.now(),
    });
  });

  conn.on('data', (data) => handleSyncData(data));
  conn.on('close', () => {
    peerConnections = peerConnections.filter(c => c !== conn);
    updatePeersList();
    if (!peerConnections.length) setSyncStatus('online', 'Connected — ready for sync');
  });
  conn.on('error', () => toast('Could not connect — check the phrase'));
}

function handleSyncData(data) {
  if (!data || !data.type) return;
  // Skip messages from self to prevent echo loops
  if (data.sender === myPhrase) return;

  try {
    if (data.type === 'note-created' && data.note) {
      const n = data.note;
      if (!n.sync_id) return;
      if (notes.some(local => local.sync_id === n.sync_id)) return;
      createNote(n.title, n.content, /^#[0-9a-fA-F]{6}$/.test(n.color) ? n.color : '#ffffff', n.remind_at || null, n.done || 0, n.sync_id);
      toast('📥 Note synced from peer');
    }

    else if (data.type === 'note-updated' && data.note) {
      const local = notes.find(x => x.sync_id === data.sync_id);
      if (!local) return;
      const n = data.note;
      updateNote(local.id, { title: n.title, content: n.content, color: n.color, remind_at: n.remind_at, done: n.done });
    }

    else if (data.type === 'note-deleted') {
      const local = notes.find(x => x.sync_id === data.sync_id);
      if (!local) return;
      deleteNote(local.id);
      toast('📥 Peer deleted a note');
    }

    else if (data.type === 'note-toggled') {
      const local = notes.find(x => x.sync_id === data.sync_id);
      if (!local) return;
      updateNote(local.id, { done: data.done });
    }

    else if (data.type === 'sync-full' && data.notes) {
      for (const rn of data.notes) {
        if (!rn.sync_id) continue;
        const match = notes.find(n => n.sync_id === rn.sync_id);
        if (match) {
          if (match.title !== rn.title || match.content !== rn.content ||
              match.done !== rn.done || match.color !== rn.color) {
            updateNote(match.id, {
              title: rn.title, content: rn.content,
              color: /^#[0-9a-fA-F]{6}$/.test(rn.color) ? rn.color : '#ffffff',
              remind_at: rn.remind_at || null, done: rn.done || 0,
            });
          }
        } else {
          createNote(rn.title, rn.content, /^#[0-9a-fA-F]{6}$/.test(rn.color) ? rn.color : '#ffffff', rn.remind_at || null, rn.done || 0, rn.sync_id);
        }
      }
      toast('📥 Full sync from peer');
    }
  } catch (e) {
    console.warn('[SYNC] Error handling peer data:', e);
  }
}

/** Periodic full-sync broadcast (kept as fallback). */
function broadcastSync() {
  if (!peerConnections.length) return;
  const data = { type: 'sync-full', notes, sender: myPhrase, timestamp: Date.now() };
  peerConnections.forEach(c => { if (c.open) c.send(data); });
}

// ─── Sync UI Events ───────────────────────────────────────────────────
forgetPeersBtn.addEventListener('click', () => {
  if (!peerConnections.length) return;
  if (!confirm('Disconnect all synced devices?')) return;
  forgetAllPeers();
});

copyPhraseBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(myPhraseInput.value).then(() => toast('Phrase copied'));
});

regeneratePhraseBtn.addEventListener('click', () => {
  myPhrase = generatePhrase();
  localStorage.setItem('minotes_phrase', myPhrase);
  localStorage.removeItem('minotes_peers');
  myPhraseInput.value = myPhrase;
  updateQR(myPhrase);
  initPeer();
  toast('New phrase generated');
});

connectBtn.addEventListener('click', () => {
  const phrase = peerPhraseInput.value.trim();
  if (!phrase) { toast('Enter a sync phrase first'); return; }
  connectToPeer(phrase);
  peerPhraseInput.value = '';
});
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
  // Decoded text should be a sync phrase like "fast-dove-6410"
  const phrase = decodedText.trim().toLowerCase();
  if (!phrase) return;
  // Validate phrase format (should match word-word-####)
  if (!/^[a-z]+-[a-z]+-\d{4}$/.test(phrase)) {
    toast('Invalid sync phrase — scan a valid minotes QR code');
    stopScanner();
    return;
  }

  // Auto-stop scanner
  stopScanner();

  // Show result
  scannedPhrase.textContent = phrase;
  scannerResult.style.display = 'flex';

  // Auto-connect after a short delay
  setTimeout(() => {
    connectToPeer(phrase);
    scannerOverlay.classList.remove('open');
    scannerResult.style.display = 'none';
    toast('Connecting via QR scan…');
  }, 800);
}

// Also connect via the manual button
connectScannedBtn.addEventListener('click', () => {
  const phrase = scannedPhrase.textContent.trim();
  if (phrase) {
    connectToPeer(phrase);
  }
  scannerOverlay.classList.remove('open');
  scannerResult.style.display = 'none';
});

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
  toast('Notes exported 📦');
});

importNotesBtn.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!Array.isArray(imported)) throw new Error('Invalid format');
        // Merge imported notes (avoid duplicates by id)
        for (const n of imported) {
          if (!n.id || !n.title) continue;
          const exists = notes.some(ex => ex.id === n.id);
          if (!exists) {
            n.id = getNextId();
            notes.push(n);
          }
        }
        saveNotesToStorage();
        loadNotes();
        toast(`Imported ${imported.length} notes 📥`);
      } catch (err) {
        toast('Failed to import — invalid file');
      }
    };
    reader.readAsText(file);
  });
  input.click();
});

// ─── Hidden Admin Panel ──────────────────────────────────────────────
let logoClickCount = 0;
let logoClickTimer = null;

logo.addEventListener('click', () => {
  logoClickCount++;
  if (logoClickTimer) clearTimeout(logoClickTimer);
  logoClickTimer = setTimeout(() => { logoClickCount = 0; }, 2000);

  if (logoClickCount >= 5) {
    logoClickCount = 0;
    adminSection.style.display = 'block';
    toast('Admin panel unlocked');
    // Open settings to show it
    settingsPanel.classList.add('open');
    overlay.classList.add('open');
  }
});

// Premade sample notes
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
  { title: 'Bug: Login redirect', content: 'After OAuth login, users are redirected to /404 instead of /dashboard. Need to fix the callback handler.', color: '#fce7f3', done: 0, pinned: 1 },
  { title: 'Sprint Review', content: 'Team: 8/10 stories completed\nVelocity: 42 points\nBlockers: None\nNext: Retrospective Friday', color: '#fef3c7', done: 0 },
  { title: 'Unit tests for auth', content: 'Coverage at 92% — all critical paths tested', color: '#dcfce7', done: 1 },
  { title: 'Dark mode support', content: 'Implemented CSS custom properties, toggle in settings', color: '#dcfce7', done: 1 },
  { title: 'Deployment v2.1', content: 'Target: Next Tuesday\nIncludes: Bug fixes + performance improvements\nRollback plan: Tagged in CI', color: '#f5f5f4', done: 0 },
];

function addPremadeNotes(list) {
  for (const n of list) {
    createNote(n.title, n.content, n.color, n.remind_at || null, n.done || 0);
  }
  toast(`Loaded ${list.length} notes`);
  if (settingsPanel.classList.contains('open')) {
    settingsPanel.classList.remove('open');
    overlay.classList.remove('open');
  }
}

loadSampleNotesBtn.addEventListener('click', () => addPremadeNotes(SAMPLE_NOTES));
loadDemoBoardBtn.addEventListener('click', () => addPremadeNotes(DEMO_NOTES));

clearAllNotesBtn.addEventListener('click', () => {
  if (!confirm('Delete ALL notes? This cannot be undone.')) return;
  if (!confirm('Are you sure? All notes will be permanently deleted.')) return;
  notes = [];
  saveNotesToStorage();
  loadNotes();
  toast('All notes cleared');
  if (settingsPanel.classList.contains('open')) {
    settingsPanel.classList.remove('open');
    overlay.classList.remove('open');
  }
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
function toggleDone(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  const newDone = note.done ? 0 : 1;
  updateNote(id, { done: newDone });
  toast(newDone ? 'Marked as done' : 'Reopened');
  syncSend('note-toggled', { sync_id: note.sync_id || '', done: newDone });
}

// ─── Service Worker ───────────────────────────────────────────────────
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'activated') window.location.reload();
      });
    });
    return reg;
  } catch (e) { console.warn('[SW] Registration failed:', e); }
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
    if (result === 'granted') toast('Notifications enabled ✅');
    return result;
  },

  /** Show a notification. Returns true if shown. */
  async send(title, body, tag) {
    if (this.permission !== 'granted') return false;
    tag = tag || 'notif-' + Date.now();
    const icon = './icon-192.svg';

    // Path 1: postMessage to active SW
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg?.active) {
        reg.active.postMessage({ type: 'NOTIFY', title, body, tag, icon, url: './' });
        console.log('[NOTIF] Sent via SW:', title);
        return true;
      }
    } catch (e) {
      console.warn('[NOTIF] postMessage failed:', e);
    }

    // Path 2: reg.showNotification
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, { body, icon, tag, data: { url: './' } });
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
    if (this.permission === 'denied') { toast('Notifications are blocked — enable in browser settings'); return; }
    if (this.permission === 'default') {
      const result = await this.request();
      if (result !== 'granted') { toast('Permission denied'); return; }
    }
    toast('🔔 Test notification incoming…');
    await this.send(
      'minotes — Test',
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

// Notification prompt — Enable/Later
notifEnableBtn.addEventListener('click', async () => {
  notifPrompt.classList.remove('visible');
  const result = await Notif.request();
  if (result === 'granted') {
    localStorage.removeItem('minotes_notif_dismissed');
    Notif.send('minotes', 'Notifications are enabled! 🔔');
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

// ─── Event listeners ──────────────────────────────────────────────────
newNoteBtn.addEventListener('click', newNote);
closeModal.addEventListener('click', closeModalFn);
backdrop.addEventListener('click', closeModalFn);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal.classList.contains('open')) closeModalFn();
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && modal.classList.contains('open')) {
    e.preventDefault();
    saveNote();
  }
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
deleteBtn.addEventListener('click', deleteNoteFn);
clearReminderBtn.addEventListener('click', () => { remindAt.value = ''; presetBtns.forEach(b => b.classList.remove('active')); });

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
  getOrCreatePhrase();
  loadNotes();

  // Init PeerJS (with retry if library not loaded yet)
  const tryPeer = () => {
    if (typeof Peer !== 'undefined') initPeer();
    else setTimeout(tryPeer, 1000);
  };
  tryPeer();

  // Re-schedule reminders every 30s
  setInterval(scheduleReminders, 30000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { loadNotes(); scheduleReminders(); }
  });

  // Periodic sync check
  setInterval(() => {
    if (peerConnections.length) broadcastSync();
  }, 60000);
}

init();
