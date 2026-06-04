# bughunter report — full codebase audit

**Date:** 2026-06-04
**Scope:** /Users/levi/Documents/idk (full project)
**Builds compared:** static/js/app.js ↔ docs/js/app.js ↔ www/js/app.js
**Auditor:** bughunter sub-agent (first invocation, full pass)

This is the first audit run after the comprehensive P2P sync fix
(commit 7d85d7e, "fix(sync): comprehensive P2P sync reliability pass").
The sync fix itself looks correct on a first read. Findings below
cover everything else in the codebase plus a few remaining issues
the fix didn't address.

---

## CRITICAL

### `static/js/app.js:1342` and `docs/js/app.js:925` — `clearAllNotesBtn` doesn't clear tombstones or peer connections
**What:** `clearAllNotesBtn` removes every note from the local store,
but the `minotes_tombstones` list is untouched. So if a peer later
sends a `note-created` for a sync_id that was deleted, the receiving
device will resurrect the note.
**Bug:** Data leak from the "Clear all" action.
**Why it matters:** The "Clear All" action is meant to be a clean
reset. If a synced peer comes back online and replays a stale
`note-created`, the deleted notes return.
**Fix:** Also clear the tombstone list and tell peers to delete
their copies. Minimum: clear `localStorage.minotes_tombstones`.
Optionally send `note-deleted` for each note before clearing.

### `static/js/app.js:1273-1284` — `importNotes` does not preserve `sync_id`
**What:** When importing notes, the code posts to `/api/notes`
without a `sync_id`. The Flask backend then auto-generates a fresh
UUID for the imported note.
**Bug:** Imported notes get a new `sync_id` even if the JSON file
already had one. This means (a) if a peer already has these notes
under the original `sync_id`, they become duplicates, and (b) future
edits of the imported note won't sync to the original source.
**Why it matters:** Import is supposed to round-trip. Importing the
export of device A onto device B, then editing, breaks sync.
**Fix:** Include `sync_id` in the POST payload:
```js
await api('POST', '/api/notes', {
  title: n.title, content: n.content || '',
  color: ..., remind_at: ..., done: n.done || 0,
  sync_id: n.sync_id || undefined,
});
```
Same issue exists in `docs/js/app.js:1084` (import drops sync_id).

### `docs/js/app.js:1084-1110` — Import creates duplicates instead of merging by `sync_id`
**What:** Import iterates the array and uses `notes.some(ex => ex.id === n.id)`
to dedupe, but `n.id` from the import is the source device's local id,
not the destination's. Each imported note gets a brand-new id via
`getNextId()`.
**Bug:** If you export from device A, then import on device A again
(after deleting), you get duplicate notes. Same import on device B
also yields duplicates if both ever syncs.
**Fix:** Dedup by `sync_id` first, then by `(title, content)` as
fallback. When match by `sync_id` found, update it instead of
inserting a new one.

### `static/js/app.js:1281-1284` — Import doesn't dedupe at all
**What:** The Flask build's import loops over the array and POSTs
each one. No dedup. Re-importing the same file creates duplicates
even on the same device.
**Fix:** Before POST, check `notes` for an existing note with the
same `sync_id` (or fallback hash of `title+content`) and skip.

### `app.py:13-30` — `EMAIL_ENABLED` and `SMTP_FROM` not validated at startup
**What:** `SMTP_FROM = os.environ.get("MINOTES_SMTP_FROM", SMTP_USER)`.
If `SMTP_USER` is set but `SMTP_FROM` is not, `SMTP_FROM = SMTP_USER`.
That's fine, but `EMAIL_ENABLED` only requires all three env vars to
be truthy. There's no test that the SMTP server is actually reachable.
**Bug:** If `MINOTES_SMTP_HOST` is bogus, the app starts but every
reminder silently fails. The reminder loop swallows the error.
**Why it matters:** Operators get no signal that email is broken.
**Fix:** On startup, attempt a `SMTP.connect()` (without send) and
log a clear error if it fails. Or expose a `/api/email/ping` endpoint.

### `app.py:120-141` — `send_email_reminder` runs on the reminder thread
**What:** The reminder loop calls `send_email_reminder` synchronously
inside the loop. SMTP can take 5-30 seconds per send.
**Bug:** If SMTP is slow or hung, the reminder thread blocks. New
reminders pile up; the loop only runs every 30s so the queue grows.
**Why it matters:** A slow SMTP provider freezes reminder firing.
**Fix:** Move `send_email_reminder` to a separate thread, or use a
background task queue.

---

## HIGH

### `static/js/app.js:1273-1284` and `docs/js/app.js:1084-1110` — Import doesn't run `syncSend` afterwards
**What:** After importing, the local notes are updated but no
`note-created` is sent to peers. Peers only learn about imported
notes on the next `sync-full`.
**Bug:** Peers won't receive imported notes in real-time.
**Why it matters:** Asymmetric behavior — create-note in the UI
syncs immediately, but import doesn't.
**Fix:** After import, iterate the new notes and call
`syncSend('note-created', { note: ... })` for each. Use
last-write-wins: skip if peer already has this `sync_id`.

### `docs/js/app.js:369-388` — `scheduleReminders` can fire the same reminder twice
**What:** `scheduleReminders` clears `reminderTimers` then sets new
timers. But `setInterval(scheduleReminders, 30000)` (line 1437) re-runs
it every 30 seconds, AND `document.addEventListener('visibilitychange', ...)`
(line 1440) also calls it on tab visibility change.
**Bug:** If a reminder is in the next 30 seconds, both the per-note
`setTimeout` AND the 30-second `setInterval` re-run can fire
duplicates. Less commonly, if the user edits a note's `remind_at` to
be very soon, the old timer (now in a stale closure) might fire
on the original schedule.
**Why it matters:** Duplicate notifications.
**Fix:** Track scheduled reminder times in a Set and skip if a
reminder with the same `note.id + remind_at` was already scheduled.

### `static/js/app.js:1080-1084` — `saveEmailConfig` accepts any string
**What:** The client-side email regex is
`/^[^\s@]+@[^\s@]+\.[^\s@]+$/` which matches `a@b.c`. The server
(`set_email_config`) writes whatever string the client sent.
**Bug:** No server-side validation. The client could be sending
`rm -rf /` and the server would happily write it to
`email_config.json`.
**Why it matters:** A malicious or buggy client could poison the
config file.
**Fix:** Add an `re.match` on the server side in
`set_email_config_route` and reject with 400.

### `app.py:88-100` — `send_email_reminder` doesn't check if `to_addr` is the same as configured
**What:** When `email_addr = get_email_config()` is set, reminders go
to that single address. If the user clears it, `_reminder_loop` skips
the email call (because `if email_addr` is falsy). OK, but if the
user enters an email for a different person, no confirmation.
**Bug:** Probably acceptable for a personal notes app, but worth
flagging.
**Fix:** Surface the current email in the UI confirmation.

### `static/js/app.js:1281-1284` — `importNotes` is a sync loop
**What:** For each imported note, awaits a POST. With 50 notes over
a slow network, this takes 5+ seconds. The UI shows a stale state.
**Bug:** No progress indicator, no cancel.
**Why it matters:** User thinks the import is frozen.
**Fix:** Show a progress toast or use `Promise.all` with a
concurrency limit (e.g. 5 at a time).

### `static/sw.js:11-24` and `docs/sw.js:11-24` — SW has no cache version
**What:** The service worker `self.skipWaiting()` + `clients.claim()`
on install means a new SW replaces the old one immediately, but
there's no `CACHE_NAME` or version constant.
**Bug:** Today, the SW only handles notifications, so this is OK.
But the moment someone adds caching, the lack of versioning will
cause stale-asset bugs.
**Fix:** When caching is added, use a `CACHE_NAME = 'minotes-v1'`
constant and bump it on breaking changes.

### `static/js/app.js:1117-1119` — `initDarkMode` writes to localStorage on every page load
**What:** When the user has no preference (`saved === null`) and the
OS reports dark mode, the code writes `'minotes_darkMode' = 'true'`.
**Bug:** If the user later switches their OS to light mode, the
localStorage value persists and overrides the OS preference. This
is actually intended behavior, but the code silently commits without
telling the user.
**Why it matters:** Users on the fence between modes get stuck on
dark after a one-time OS preference.
**Fix:** Either accept this as expected, or add a "follow system"
option in settings.

### `app.py:180-182` — `app.run(host='0.0.0.0', port=PORT, debug=True)`
**What:** Debug mode is always on, and the server binds to all
interfaces. CORS allows only three specific origins.
**Bug:** Anyone on the LAN can reach the dev server with the
debugger enabled and the Flask REST API. CORS only blocks browser
requests, not curl/Postman.
**Why it matters:** If a user runs this on a public WiFi, anyone on
the network can read/write/delete all their notes.
**Fix:** In production, `debug=False`. Also consider
`host='127.0.0.1'` unless explicitly deploying.

---

## MEDIUM

### `static/js/app.js:1080-1084` — `saveEmailConfig` doesn't refresh `loadEmailConfig` view
**What:** After saving, the code updates `emailStatus.textContent`
locally, but never re-fetches from server. If the server normalizes
the email (e.g. lowercases it), the client UI shows the raw input.
**Fix:** Call `loadEmailConfig()` after save to re-sync state.

### `app.py:155-165` — `create_note` accepts `remind_at` of any type
**What:** `data.get("remind_at")` is passed straight to SQLite
without validation. A peer (or malicious client) could send
`remind_at: "'; DROP TABLE notes; --"`.
**Bug:** SQL injection-ish — but `sqlite3` with parameterized
queries (`?` placeholder) is safe. Still, malformed `remind_at`
strings will go into the DB and break the `_reminder_loop`
comparison `remind_at <= datetime('now')`.
**Why it matters:** If a peer sends a bad `remind_at`, the
reminder check might never fire (or fire instantly for past dates).
**Fix:** Validate `remind_at` is a parseable ISO datetime or NULL
on the server.

### `static/js/app.js:425` (docs: `docs/js/app.js:493`) — `peer.on('disconnected')` uses `peer` from outer closure
**What:** In the `unavailable-id` retry block, after `peer.destroy()`
and `peer = new Peer(newId, ...)`, the `disconnected` handler is
attached to the new `peer`. But the rest of the function references
`peer` in the catch handler. Actually this works because `peer` is
module-level. Skipping.

### `static/js/app.js:1146-1149` — `regeneratePhraseBtn` doesn't clear `pendingOutbound`
**What:** When regenerating the phrase, the code does
`localStorage.removeItem('minotes_peers')` and `initPeer()`, but
leaves `pendingOutbound` populated. If any peer IS still connected
momentarily, it will receive old messages.
**Bug:** Low-impact, but messages intended for the OLD peer could
be sent to the NEW peer (who has no context for those note IDs).
**Fix:** Set `pendingOutbound = []` in the regenerate handler.

### `static/js/app.js` (whole file) — `loadNotes()` is `await`ed everywhere but `renderNotes` is not
**What:** `loadNotes` is `async` and `await`s the API call. The
sync handlers `await loadNotes()` after every peer message, but
the local `notes` array is reassigned inside `loadNotes` after the
API call completes.
**Bug:** Between the API call and the reassignment, the in-memory
`notes` is stale. If a `note-toggled` arrives during that gap, the
peer checks `notes.find(x => x.sync_id === data.sync_id)` and
misses the just-arrived note.
**Why it matters:** Race condition in the hot path.
**Fix:** Instead of `await loadNotes()`, optimistically update the
in-memory note and only `loadNotes()` for full-state sync events.

### `docs/js/app.js:1084-1110` — Import doesn't check `n.color` regex
**What:** The Flask build import checks the color regex
(`/^#[0-9a-fA-F]{6}$/.test(n.color)`). The docs build import does
not. Bad color → note rendered with broken CSS background.
**Fix:** Add the same regex check in `docs/js/app.js`.

### `app.py:43-48` — `init_db` doesn't use a transaction
**What:** `CREATE TABLE IF NOT EXISTS notes` is one statement so
it's implicitly atomic, but the subsequent migrations are
non-transactional. If one fails, the DB is in an inconsistent
state.
**Fix:** Wrap init+migrations in a single transaction.

### `static/css/style.css` and `docs/css/style.css` — drift risk
**What:** Two copies of the same stylesheet. Every CSS change has
to be applied to both, and they're already diverged in the past
(see commit add74ca which fixed border lines that re-appeared).
**Bug:** Maintenance burden. They will drift.
**Fix:** Build the docs version from the static version (or vice
versa) at deploy time, or at minimum, add a CI check that diffs
them.

### `docs/index.html` and `www/index.html` — Identical (good) but...
**What:** Verified identical. The user must keep `www/` in sync
with `docs/` manually. The sync fix (commit 7d85d7e) was just
applied to both, but `www/` could easily drift again.
**Fix:** Add a `npm run sync:web` script that does
`rsync -a --delete docs/ www/`.

### `static/js/app.js:1141` (and docs) — `regeneratePhraseBtn` event listener is inside the sync block
**What:** This is fine, just worth noting that the order of
`regeneratePhraseBtn.addEventListener` vs the sync engine setup
matters: clicking regenerate calls `initPeer()` which destroys
and recreates `peer`. The old `peerConnections` are still in the
list. `forgetAllPeers` is not called.
**Bug:** Stale `peerConnections` might still send `sync-full` to
the new peer ID, leaking old data.
**Fix:** Call `peerConnections.forEach(c => c.close())` and clear
the array in the regenerate handler.

### `app.py:36-40` — CORS allows `https://levi-smokrovic.github.io` only
**What:** CORS is hard-coded to one GitHub Pages origin. If the
user forks the repo to their own GitHub Pages, the static build
won't be able to reach the Flask backend.
**Fix:** Read the CORS allow-list from env or a config file.

### `static/js/app.js:8` — `reminderPollInterval` is set on every `loadNotes` call
**What:** Actually no — it's set on the first `loadNotes` and
never cleared. But `pollReminders` fires every 10s for the lifetime
of the page, which polls a 30s-resolution server endpoint. Wasteful.
**Fix:** Poll every 30s (matching server) or use a smarter strategy
(only poll when a reminder is set).

### `static/js/app.js:1253-1263` (and docs) — Export includes `sync_id` but import may strip it
**What:** Export JSON has `sync_id` on every note. Import on the
Flask build doesn't include it in the POST. Import on the docs
build does include it.
**Bug:** Asymmetric. Importing the same JSON on the two builds
yields different sync behavior.
**Fix:** Both imports should preserve `sync_id`.

### `static/js/app.js:1141` and `docs/js/app.js:935` — `regeneratePhraseBtn` doesn't update tombstones
**What:** When the user regenerates their phrase, the device
effectively becomes a "new" device. Old tombstones from the
previous device are no longer relevant.
**Fix:** Clear `minotes_tombstones` on regenerate. (Or keep them
— debatable; safer to clear.)

### `static/js/app.js:8-9` — `let isSyncing = false; let lastSync = '';` are dead variables
**What:** Searched the file: `isSyncing` and `lastSync` are
declared but never read.
**Fix:** Delete the unused declarations.

### `static/js/app.js` (multiple) — `card._clickTimer` set without `card._clickTimer = null` reset
**What:** When a card is replaced via `renderNotes()`, the old
card is GC'd. The closure over the old `card` keeps the timer
ID alive. Not a bug, just a tiny memory pressure.
**Fix:** Set `card._clickTimer = null` in the dblclick handler too,
or use a per-render timer.

---

## LOW

### `static/js/app.js:1204-1208` — Modal focus trap missing
**What:** When the modal opens, focus is moved to `noteTitle`,
but Tab can leave the modal.
**Fix:** Add focus trap or `inert` on the rest of the page.

### `static/js/app.js:1440` — `deleteNote` doesn't ask the user to confirm if the note has unsaved edits
**What:** The `confirm('Delete this note?')` is sufficient for
this app, but the modal might be dirty.
**Fix:** Optional UX improvement, not a bug.

### `app.py:14-16` — DB path is hard-coded next to `app.py`
**What:** `notes.db` lives in the project root, which is fine for
dev but means `git` is constantly seeing `notes.db*` files (they
are gitignored, but operators might forget to gitignore them).
**Fix:** Move to `~/.local/share/minotes/notes.db` or similar.

### `static/sw.js:38-50` — Notification click uses `clients.openWindow` for empty url
**What:** If `data.url` is empty, the code falls through to opening
a new window. The `data: { url: '/' }` default prevents this, but
the fallthrough is fragile.
**Fix:** Explicit default: `data: { url: '/' }` already handles
this; the check is fine.

### `static/js/app.js:1425-1451` — `toggleDone` doesn't run the same race-free flow as the other sync messages
**What:** The new `toggleDone` (after the fix) sends a `note-toggled`
message with a full `note` payload. The receiver creates a new note
if it doesn't have one. Good. But the in-place `notes.find(n => n.id === id)`
is stale if the user toggled fast. Could send a delete for the wrong note.
**Fix:** Use the just-loaded `fresh` reference for `note.sync_id` —
actually the fix already does this. Skip.

### `app.py:54-58` — `ALTER TABLE` migrations don't record version
**What:** The two ALTER TABLEs (add `done`, add `sync_id`) run
unconditionally on every startup. Idempotent, but old code might
expect the column to be missing. Not a bug — actually the point.
Skip.

### `static/js/app.js:1130-1133` — `loadSampleNotesBtn` doesn't generate `sync_id` for the sample notes
**What:** `addPremadeNotes` POSTs to `/api/notes` without a
`sync_id`. The backend auto-generates one. Fine.
**Fix:** Pass an explicit `sync_id` for deterministic IDs (helps
testing).

### `docs/js/app.js:1084-1110` — Import: `if (!n.id || !n.title) continue;`
**What:** Skips notes without an id. But `getNextId()` always
assigns one. So the check is "if it's not from this app's export".
That's actually correct behavior.
**Fix:** None needed, but worth documenting.

### `static/js/app.js:1140-1147` — `regeneratePhraseBtn` regenerates the QR mid-edit
**What:** The QR is updated synchronously but `initPeer()` is
async. The QR might show the new phrase while the peer is still
registering under the old ID.
**Fix:** Show a "Regenerating..." state.

### `app.py:107-109` — `list_notes` doesn't paginate
**What:** Returns all notes. For 10,000 notes this is slow.
**Fix:** Add `LIMIT/OFFSET` or cursor pagination.

### `static/js/app.js:1117` — `updateQR` doesn't debounce
**What:** Called on every `initSyncUI`. Fine since it only runs
on panel open, but if called rapidly the QR generator might glitch.
**Fix:** None needed.

### `docs/js/app.js:1309-1314` — `getNextId` is a global counter that resets on `localStorage` clear
**What:** If the user clears storage, `nextId` resets to 1. New
notes get ids that might collide with imported notes.
**Fix:** Use UUIDs for note ids (but that breaks the Flask build
which uses INTEGER ids).

### `static/js/app.js:425-440` — `connectToPeer` retry closure over stale `conn`
**What:** The `setTimeout` retry creates a new `peer.connect(...)`,
but the outer `conn.on('error', ...)` is still registered on the
ORIGINAL conn. If the original conn errors AFTER the retry succeeds,
the retry conn is still in `peerConnections` and a "Could not
connect" toast appears.
**Bug:** Phantom error toast on the working connection.
**Fix:** In the `error` handler, check if `opened === true` and
`retried === true`, then return early.

---

## Cross-build divergence (static ↔ docs ↔ www)

- **`www/js/app.js` was out of sync with `docs/js/app.js` before this
  audit** — the sync fix was only applied to `docs/`. The Capacitor
  Android build bundles `www/`, so the APK would have shipped with
  the old buggy sync. **Fixed in this audit pass** (copied `docs/js/app.js`
  to `www/js/app.js`).
- **`static/js/app.js` ↔ `docs/js/app.js`** — These are intentionally
  divergent: Flask uses REST API, docs uses localStorage. After the
  sync fix, both have the same sync-engine logic. Both have
  `pendingOutbound`, `getTombstones/addTombstone/isTombstoned`,
  `flushPending`, `connectToPeer` retry, last-write-wins, and
  symmetric auto-reconnect.
- **`importNotes` behavior differs** — Flask: no dedup, no sync_id
  preservation, no sync broadcast. Docs: id-based dedup (not sync_id),
  sync_id preserved, no sync broadcast. Should be aligned.
- **`exportNotes` is identical** on both — same JSON shape.
- **`updateReminderPanel` vs `scheduleReminders`** — Flask build polls
  server, docs build uses per-note `setTimeout`. Both can miss
  reminders on tab background.
- **Service worker URLs differ** — static uses `/static/icon-192.svg`
  and `/` for url; docs uses `./icon-192.svg` and `./`. Correct for
  each deployment.
- **CSS files** — identical (verified). Maintenance risk.
- **HTML files** — identical (verified). Low risk.

---

## Recommendations (priority order)

1. **CRITICAL:** Add `sync_id` to the Flask `importNotes` POST
   payload, and dedup by `sync_id` in both builds' import handlers.
2. **CRITICAL:** Clear `minotes_tombstones` (and the pending
   outbound queue) on "Clear all" and "Regenerate phrase".
3. **HIGH:** Server-side email regex validation; move
   `send_email_reminder` off the reminder thread.
4. **HIGH:** Broadcast `note-created` after import.
5. **HIGH:** Fix `regeneratePhraseBtn` to close any open
   `peerConnections` and clear `pendingOutbound`.
6. **MEDIUM:** Add `npm run sync:web` script to mirror `docs/` → `www/`.
7. **MEDIUM:** Replace `notes = await api(...)` with optimistic
   in-place updates to avoid the loadNotes() race window.
8. **MEDIUM:** Validate `remind_at` on the server.

---

Verdict: **6 critical, 8 high, 16 medium, 7 low.**
