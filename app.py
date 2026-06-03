#!/usr/bin/env python3
"""Minimalistic Notes App — Flask Backend"""

import json
import sqlite3
import os
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

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

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

def _reminder_loop():
    global _reminder_events
    while True:
        try:
            with get_db() as db:
                rows = db.execute(
                    "SELECT id, title, content, remind_at FROM notes "
                    "WHERE remind_at IS NOT NULL AND remind_at <= datetime('now','localtime')"
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
