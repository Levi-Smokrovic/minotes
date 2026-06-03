#!/usr/bin/env python3
"""Minimalistic Notes App — Flask Backend"""

import json
import sqlite3
import os
import smtplib
from email.message import EmailMessage
from datetime import datetime, timedelta
from threading import Thread, Event
from time import sleep

from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DB_PATH = os.path.join(os.path.dirname(__file__), "notes.db")
PORT = 8080

# Optional SMTP settings for email reminders (set env vars to enable)
SMTP_HOST = os.environ.get("MINOTES_SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("MINOTES_SMTP_PORT", "587"))
SMTP_USER = os.environ.get("MINOTES_SMTP_USER", "")
SMTP_PASS = os.environ.get("MINOTES_SMTP_PASS", "")
SMTP_FROM = os.environ.get("MINOTES_SMTP_FROM", SMTP_USER)
EMAIL_ENABLED = bool(SMTP_HOST and SMTP_USER and SMTP_PASS)

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:8080", "http://127.0.0.1:8080", "https://levi-smokrovic.github.io"]}})

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_db():
    with get_db() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS notes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                title       TEXT    NOT NULL DEFAULT '',
                content     TEXT    NOT NULL DEFAULT '',
                color       TEXT    NOT NULL DEFAULT '#ffffff',
                pinned      INTEGER NOT NULL DEFAULT 0,
                done        INTEGER NOT NULL DEFAULT 0,
                remind_at   TEXT    DEFAULT NULL,
                created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
            );
        """)

init_db()

# Migration: add `done` column if missing
with get_db() as db:
    try:
        db.execute("ALTER TABLE notes ADD COLUMN done INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass  # already exists

# ---------------------------------------------------------------------------
# Reminder checker thread (fires every 30 s)
# ---------------------------------------------------------------------------
_reminder_events = []  # list of dicts kept in memory for fast lookup

def _sanitize_header(val):
    """Remove control chars to prevent header injection."""
    return ''.join(c for c in (val or '') if c not in '\r\n\t').strip()[:200]

def send_email_reminder(to_addr, title, content):
    """Send an email reminder. Returns True if sent, False if not configured."""
    if not EMAIL_ENABLED or not to_addr:
        return False
    try:
        msg = EmailMessage()
        msg["Subject"] = f"Reminder: {_sanitize_header(title)} — minotes"
        msg["From"] = SMTP_FROM
        msg["To"] = to_addr
        body = f"Reminder from minotes\n\n"
        body += f"Title: {_sanitize_header(title)}\n"
        if content:
            body += f"Note: {content[:500]}\n"
        body += f"\n— minotes"
        msg.set_content(body)

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as srv:
            srv.starttls()
            srv.login(SMTP_USER, SMTP_PASS)
            srv.send_message(msg)
        print(f"  ✓ Email reminder sent to {to_addr} for '{title}'")
        return True
    except Exception as e:
        print(f"  ✗ Email reminder failed: {e}")
        return False

def _reminder_loop():
    global _reminder_events
    while True:
        try:
            with get_db() as db:
                rows = db.execute(
                    "SELECT id, title, content, remind_at FROM notes "
                    "WHERE remind_at IS NOT NULL AND remind_at <= datetime('now')"
                ).fetchall()
            for r in rows:
                # mark as fired (clear remind_at)
                with get_db() as db:
                    db.execute("UPDATE notes SET remind_at = NULL, updated_at = datetime('now','localtime') WHERE id = ?", (r["id"],))
                _reminder_events.append({
                    "id": r["id"],
                    "title": r["title"] or "Untitled",
                    "content": r["content"][:120],
                    "fired_at": datetime.now().isoformat()
                })
                # Send email reminder if configured
                email_addr = get_email_config()
                if email_addr:
                    send_email_reminder(email_addr, r["title"], r["content"])
        except Exception:
            pass
        sleep(30)

Thread(target=_reminder_loop, daemon=True).start()

def pop_reminder_events():
    """Return and clear accumulated reminder events."""
    global _reminder_events
    events = list(_reminder_events)
    _reminder_events.clear()
    return events

# ---------------------------------------------------------------------------
# Email config (stored in a simple JSON file next to the DB)
# ---------------------------------------------------------------------------
EMAIL_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "email_config.json")

def get_email_config():
    """Return the configured email address, or empty string."""
    try:
        with open(EMAIL_CONFIG_PATH) as f:
            data = json.load(f)
            return data.get("email", "")
    except (FileNotFoundError, json.JSONDecodeError):
        return ""

def set_email_config(email_addr):
    """Save the email address for reminders."""
    with open(EMAIL_CONFIG_PATH, "w") as f:
        json.dump({"email": email_addr.strip()}, f)

# ---------------------------------------------------------------------------
# Routes — API
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/notes", methods=["GET"])
def list_notes():
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM notes ORDER BY done ASC, pinned DESC, updated_at DESC"
        ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/notes", methods=["POST"])
def create_note():
    data = request.get_json() or {}
    title = data.get("title", "").strip() or "Untitled"
    content = data.get("content", "")
    color = data.get("color", "#ffffff")
    remind_at = data.get("remind_at")
    done = data.get("done", 0)
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO notes (title, content, color, remind_at, done) VALUES (?, ?, ?, ?, ?)",
            (title, content, color, remind_at, done),
        )
        note_id = cur.lastrowid
    return jsonify({"id": note_id}), 201

@app.route("/api/notes/<int:note_id>", methods=["PUT"])
def update_note(note_id):
    data = request.get_json() or {}
    fields = []
    vals = []
    for key in ("title", "content", "color", "remind_at", "pinned", "done"):
        if key in data:
            fields.append(f"{key} = ?")
            vals.append(data[key])
    if not fields:
        return jsonify({"error": "no fields"}), 400
    fields.append("updated_at = datetime('now','localtime')")
    vals.append(note_id)
    with get_db() as db:
        db.execute(f"UPDATE notes SET {', '.join(fields)} WHERE id = ?", vals)
    return jsonify({"ok": True})

@app.route("/api/notes/<int:note_id>", methods=["DELETE"])
def delete_note(note_id):
    with get_db() as db:
        db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    return jsonify({"ok": True})

@app.route("/api/reminders/poll", methods=["GET"])
def poll_reminders():
    events = pop_reminder_events()
    return jsonify(events)

@app.route("/api/email/config", methods=["GET"])
def get_email_config_route():
    return jsonify({
        "email": get_email_config(),
        "available": EMAIL_ENABLED,
    })

@app.route("/api/email/config", methods=["PUT"])
def set_email_config_route():
    data = request.get_json() or {}
    email = data.get("email", "")
    set_email_config(email)
    return jsonify({"ok": True, "email": email})

# ---------------------------------------------------------------------------
# Static files (service worker, manifest)
# ---------------------------------------------------------------------------
@app.route("/sw.js")
def service_worker():
    return send_from_directory("static", "sw.js", mimetype="application/javascript")

@app.route("/manifest.json")
def manifest():
    return send_from_directory("static", "manifest.json", mimetype="application/json")

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print(f"  →  http://127.0.0.1:{PORT}")
    app.run(host="0.0.0.0", port=PORT, debug=True)
