# minotes

**Minimal, private, P2P-synced notes app. Free and open source.**

A small notes app that syncs directly between your devices over peer-to-peer WebRTC. No cloud accounts, no servers, no tracking. Just you and your notes.

Live demo: [levi-smokrovic.github.io/minotes](https://levi-smokrovic.github.io/minotes/)

---

## Features

- **Beautiful and minimal.** Clean interface, smooth animations, no clutter.
- **P2P sync.** End-to-end sync via WebRTC (PeerJS). Your notes never touch a server.
- **PWA ready.** Install as a standalone app on mobile and desktop.
- **Reminders.** Set per-note reminders with push notifications.
- **Color labels.** Categorize notes with color coding.
- **Done tracking.** Mark notes as done (double-click any note).
- **Filters.** Quickly switch between All, Active, and Done.
- **Export and import.** Full JSON backup and restore.
- **Dark mode.** System-style theme toggle, persisted across sessions.
- **No account needed.** No signup, no login, no data collection.
- **QR code sharing.** Share your sync phrase as a QR code.
- **Works offline.** Service worker caches everything for offline use.

---

## Quick Start

### Option 1: Use the web app (no install)

Visit [levi-smokrovic.github.io/minotes](https://levi-smokrovic.github.io/minotes/) in any browser. That's it.

### Option 2: Run locally (Flask backend)

```bash
# Clone the repo
git clone https://github.com/Levi-Smokrovic/minotes.git
cd minotes

# Install dependencies
pip install flask

# Run
python app.py
```

Open `http://localhost:8080` in your browser.

### Option 3: Serve the static version

```bash
cd docs
python3 -m http.server 8080
```

Open `http://localhost:8080` in your browser.

---

## P2P Sync: How It Works

1. Open minotes on two devices.
2. Tap the **Sync** icon in the header.
3. You'll see a sync phrase like `fast-dove-6410`.
4. On your other device, enter the same phrase and tap **Connect**.
5. Notes sync in real-time over a direct WebRTC connection. No data passes through any server.

You can also share your phrase as a QR code for easy scanning.

> **Privacy note:** minotes uses PeerJS for WebRTC. The PeerJS cloud server is only used for peer discovery so your devices can find each other. After discovery, all data flows directly between your devices over an encrypted peer-to-peer connection.

---

## Hidden Admin Panel

Click the **minotes logo 5 times quickly** to unlock the admin panel, where you can:

- Load sample notes for a quick demo
- Load a project management demo board
- Clear all notes at once

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend  | Vanilla JS, CSS Custom Properties, PWA |
| Backend   | Python Flask (optional, for server mode) |
| Database  | SQLite (Flask mode), localStorage (static mode) |
| P2P sync  | PeerJS (WebRTC) |
| QR codes  | QRCode.js |
| Font      | Inter (Google Fonts) |
| Hosting   | GitHub Pages |

---

## Project Structure

```
minotes/
├── app.py                  # Flask backend
├── minotes.db              # SQLite database (auto-created)
├── templates/
│   └── index.html          # Flask version HTML
├── static/
│   ├── css/style.css       # Stylesheet (design system)
│   ├── js/app.js           # Flask version frontend JS
│   ├── sw.js               # Service worker
│   ├── favicon.svg
│   ├── icon-192.svg
│   └── icon-512.svg
├── docs/                   # GitHub Pages static build
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   ├── sw.js
│   └── manifest.json
└── README.md
```

---

## Contributing

This is a passion project. Feel free to fork, open issues, or submit PRs.

Ideas welcome:
- Rich text editing
- Tags and categories
- Collaborative real-time editing
- End-to-end encryption with libsodium

---

## License

MIT. Do whatever you want.

---

<p align="center">
  <sub>built by <a href="https://github.com/Levi-Smokrovic">@Levi-Smokrovic</a></sub>
</p>
