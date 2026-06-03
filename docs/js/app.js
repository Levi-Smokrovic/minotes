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

let selectedColor = '#ffffff';

// ─── localStorage helpers ─────────────────────────────────────────────
function loadNotesFromStorage() {
  try {
    return JSON.parse(localStorage.getItem('minotes_notes') || '[]');
  } catch { return []; }
}

function saveNotesToStorage() {
  localStorage.setItem('minotes_notes', JSON.stringify(notes));
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

function createNote(title, content, color, remind_at, done) {
  const note = {
    id: getNextId(),
    title: title || 'Untitled',
    content: content || '',
    color: color || '#ffffff',
    pinned: 0,
    done: done ? 1 : 0,
    remind_at: remind_at || null,
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
    const bg = n.color && n.color !== '#ffffff' ? `style="background:${n.color}"` : '';
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
    card.addEventListener('click', () => openNote(Number(card.dataset.id)));
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
    updateNote(editingId, { title, content, color, remind_at: remindAtVal, done });
    toast('Note updated ✨');
  } else {
    createNote(title, content, color, remindAtVal, done);
    toast('Note created ✨');
  }
  closeModalFn();
  broadcastSync();
}

function deleteNoteFn() {
  if (!editingId) return;
  if (!confirm('Delete this note?')) return;
  deleteNote(editingId);
  toast('Note deleted 🗑️');
  closeModalFn();
  broadcastSync();
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
  toast(`⏰ ${note.title || 'Untitled'}`);

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('minotes — Reminder', {
      body: (note.title || 'Untitled') + (note.content ? `\n${note.content}` : ''),
      icon: './icon-192.svg',
      tag: `reminder-${note.id}`,
    });
  }

  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'show-notification',
      title: `⏰ ${note.title || 'Untitled'}`,
      body: note.content || '',
    });
  }

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
  if (!peerConnections.length) { syncPeers.innerHTML = ''; return; }
  syncPeers.innerHTML = peerConnections.map((_, i) =>
    `<div class="sync-peer-item"><span class="sync-peer-dot"></span><span>Device ${i + 1}</span></div>`
  ).join('');
}

async function initPeer() {
  if (peer) { peer.destroy(); peerConnections = []; }
  const phrase = getOrCreatePhrase();
  const peerId = 'minotes-' + phrase.replace(/[^a-z0-9-]/gi, '').toLowerCase();

  if (typeof Peer === 'undefined') {
    setSyncStatus('offline', 'PeerJS not loaded yet');
    return;
  }

  setSyncStatus('connecting', 'Connecting…');
  peer = new Peer(peerId, { debug: 0 });

  peer.on('open', () => {
    setSyncStatus('online', 'Connected — ready for sync');
  });

  peer.on('connection', (conn) => {
    conn.on('open', () => {
      peerConnections.push(conn);
      setSyncStatus('online', `Connected (${peerConnections.length} device${peerConnections.length > 1 ? 's' : ''})`);
      updatePeersList();
      toast('Device connected! 🔗');
    });
    conn.on('data', (data) => handleSyncData(data));
    conn.on('close', () => {
      peerConnections = peerConnections.filter(c => c !== conn);
      updatePeersList();
      if (!peerConnections.length) setSyncStatus('online', 'Connected — ready for sync');
    });
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      peer.destroy();
      peer = new Peer(peerId + '-' + Math.random().toString(36).slice(2, 6), { debug: 0 });
      peer.on('open', () => setSyncStatus('online', 'Connected — ready for sync'));
      peer.on('connection', handleIncomingConnection);
      return;
    }
    setSyncStatus('offline', 'Sync unavailable (offline?)');
  });
}

function handleIncomingConnection(conn) {
  conn.on('open', () => {
    peerConnections.push(conn);
    updatePeersList();
    toast('Device connected! 🔗');
  });
  conn.on('data', (data) => handleSyncData(data));
}

function connectToPeer(remotePhrase) {
  if (!peer) return;
  const remoteId = 'minotes-' + remotePhrase.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  const conn = peer.connect(remoteId, { reliable: true });

  conn.on('open', () => {
    peerConnections.push(conn);
    setSyncStatus('online', `Connected (${peerConnections.length} device${peerConnections.length > 1 ? 's' : ''})`);
    updatePeersList();
    toast('Connected! 🔗');

    conn.send({
      type: 'sync-request',
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
  if (data.type === 'sync-request' || data.type === 'sync-full') {
    toast(`Received ${data.notes?.length || 0} notes from peer 📥`);
    if (data.notes && Array.isArray(data.notes)) {
      for (const rn of data.notes) {
        const exists = notes.some(n => n.title === rn.title && n.content === rn.content);
        if (!exists) {
          createNote(rn.title, rn.content, rn.color || '#ffffff', rn.remind_at || null, rn.done || 0);
        }
      }
      loadNotes();
      toast('Sync complete ✅');
    }
  }
}

function broadcastSync() {
  if (!peerConnections.length) return;
  const data = { type: 'sync-full', notes, sender: myPhrase, timestamp: Date.now() };
  peerConnections.forEach(c => { if (c.open) c.send(data); });
}

// ─── Sync UI Events ───────────────────────────────────────────────────
copyPhraseBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(myPhraseInput.value).then(() => toast('Phrase copied 📋'));
});

regeneratePhraseBtn.addEventListener('click', () => {
  myPhrase = generatePhrase();
  localStorage.setItem('minotes_phrase', myPhrase);
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

// ─── Service Worker ───────────────────────────────────────────────────
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  } catch (e) { console.warn('SW failed', e); }
}

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
  closeModalFn();
});

// ─── Init ─────────────────────────────────────────────────────────────
async function init() {
  await registerSW();
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
