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

let selectedColor = '#ffffff';
let adminClickCount = 0;

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
  const title = note.title || 'Untitled';
  toast('Reminder: ' + title);

  // Show notification via SW registration (most reliable)
  if ('Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification('minotes — Reminder', {
        body: title + (note.content ? '\n' + note.content : ''),
        icon: './icon-192.svg',
        tag: 'reminder-' + note.id,
      });
    }).catch(e => console.warn('SW notif failed', e));
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

    // Send our notes to the new peer
    conn.send({
      type: 'sync-full',
      notes: notes,
      sender: myPhrase,
      timestamp: Date.now(),
    });
  });
  conn.on('data', (data) => handleSyncData(data));
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
  if (data.type === 'sync-full') {
    if (data.notes && Array.isArray(data.notes)) {
      for (const rn of data.notes) {
        const match = notes.findIndex(n => n.title === rn.title && n.content === rn.content);
        if (match === -1) {
          createNote(rn.title, rn.content, rn.color || '#ffffff', rn.remind_at || null, rn.done || 0);
        } else if (rn.done && !notes[match].done) {
          // Update done status if peer has it marked done
          notes[match].done = 1;
          saveNotes();
        }
      }
      loadNotes();
    }
  }
}

function broadcastSync() {
  if (!peerConnections.length) return;
  const data = { type: 'sync-full', notes, sender: myPhrase, timestamp: Date.now() };
  peerConnections.forEach(c => { if (c.open) c.send(data); });
}

// ─── Sync UI Events ───────────────────────────────────────────────────

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
      html5QrCode.clear();
    } catch (_) {}
    html5QrCode = null;
  }
  scannerRunning = false;
}

function onScanSuccess(decodedText) {
  // Decoded text should be a sync phrase like "fast-dove-6410"
  const phrase = decodedText.trim();
  if (!phrase) return;

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

// ─── Test Notification ───────────────────────────────────────────────
testNotifBtn.addEventListener('click', async () => {
  // Ensure permission
  if (!('Notification' in window)) { toast('Notifications not supported'); return; }
  if (Notification.permission === 'denied') { toast('Notifications are blocked — enable in browser settings'); return; }
  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') { toast('Permission denied'); return; }
  }
  toast('Test notification in 10 seconds…');

  setTimeout(async () => {
    try {
      // Use SW registration for most reliable notification
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('minotes — Test', {
        body: 'This is a test notification from minotes',
        icon: './icon-192.svg',
        tag: 'minotes-test',
      });
    } catch (e) { console.warn('SW notif failed', e); }
  }, 10000);
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
    toast('🔐 Admin panel unlocked');
    // Open settings to show it
    settingsPanel.classList.add('open');
    overlay.classList.add('open');
  }
});

// Premade sample notes
const SAMPLE_NOTES = [
  { title: 'Welcome to minotes! 👋', content: 'This is a sample note. Start typing to replace it, or tap and create a new one.\n\n• Click + New Note to create\n• Double-click a note to toggle Done\n• Use reminders via the ⏰ button', color: '#fef3c7', done: 0 },
  { title: 'Meeting Notes', content: 'Q2 Planning:\n- Review roadmap\n- Assign sprint goals\n- Set OKRs for next quarter\n- Schedule follow-up', color: '#dbeafe', done: 0 },
  { title: 'Shopping List', content: '• 🥑 Avocados\n• 🍞 Bread\n• 🥛 Almond milk\n• 🥦 Broccoli\n• 🍫 Dark chocolate', color: '#dcfce7', done: 0 },
  { title: 'Idea: Color Picker', content: 'Would be nice to have a quick color palette picker for notes. Could use it for categorizing projects and personal stuff.', color: '#fce7f3', done: 0, pinned: 1 },
  { title: 'Done Example', content: 'This note is already done. Double-click any note to toggle its done status.', color: '#f5f5f4', done: 1 },
];

const DEMO_NOTES = [
  { title: '🚀 Project Alpha', content: 'Status: In Progress\n\nFrontend: 80% complete\nBackend: 45% complete\nDesign: Review pending', color: '#dbeafe', done: 0, pinned: 1 },
  { title: '✅ Homepage redesign', content: 'New hero section, updated color palette, responsive navigation', color: '#dcfce7', done: 1 },
  { title: '✅ API integration', content: 'REST endpoints for user auth and data sync', color: '#dcfce7', done: 1 },
  { title: '🔄 Database migration', content: 'Moving from SQLite to PostgreSQL. Migration script ready for review.', color: '#fef3c7', done: 0 },
  { title: '🐛 Bug: Login redirect', content: 'After OAuth login, users are redirected to /404 instead of /dashboard. Need to fix the callback handler.', color: '#fce7f3', done: 0, pinned: 1 },
  { title: '📝 Sprint Review', content: 'Team: 8/10 stories completed\nVelocity: 42 points\nBlockers: None\nNext: Retrospective Friday', color: '#fef3c7', done: 0 },
  { title: '✅ Unit tests for auth', content: 'Coverage at 92% — all critical paths tested', color: '#dcfce7', done: 1 },
  { title: '✅ Dark mode support', content: 'Implemented CSS custom properties, toggle in settings', color: '#dcfce7', done: 1 },
  { title: '📅 Deployment v2.1', content: 'Target: Next Tuesday\nIncludes: Bug fixes + performance improvements\nRollback plan: Tagged in CI', color: '#f5f5f4', done: 0 },
];

function addPremadeNotes(list) {
  for (const n of list) {
    createNote(n.title, n.content, n.color, n.remind_at || null, n.done || 0);
  }
  toast(`Loaded ${list.length} notes ✅`);
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
  toast('All notes cleared 🗑️');
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
  toast(newDone ? 'Marked as done ✅' : 'Reopened ↩️');
  broadcastSync();
}

// ─── Service Worker ───────────────────────────────────────────────────
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (e) { console.warn('SW failed', e); }
}

async function requestNotifPermission() {
  if (!('Notification' in window)) return;
  const result = await Notification.requestPermission();
  notifPrompt.classList.remove('visible');
  if (result === 'granted') {
    toast('Notifications enabled');
  }
  return result;
}

function showNotifPromptIfNeeded() {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'default') return;
  notifPrompt.classList.add('visible');
}

notifEnableBtn.addEventListener('click', () => {
  requestNotifPermission();
  notifPrompt.classList.remove('visible');
});
notifLaterBtn.addEventListener('click', () => {
  notifPrompt.classList.remove('visible');
});

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
  showNotifPromptIfNeeded();
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
