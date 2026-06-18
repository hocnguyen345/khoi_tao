#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SEB Remote Support — Backend Server (Cloud Deploy Version)
Flask + SocketIO hub. Relay giữa client ↔ support.
"""

import os
import sys
import json
import base64
from datetime import datetime
from flask import Flask, request, jsonify, send_file
from flask_socketio import SocketIO, emit, join_room

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# ─── Config ───────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
ANSWERS_FILE = os.path.join(BASE_DIR, "answers.json")
PORT = int(os.environ.get("PORT", 5000))

os.makedirs(UPLOAD_DIR, exist_ok=True)

# ─── Flask App ────────────────────────────────────────────────
app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "seb-remote-2024")

try:
    import eventlet
    eventlet.monkey_patch()
    ASYNC_MODE = "eventlet"
except ImportError:
    ASYNC_MODE = "threading"

socketio = SocketIO(app, cors_allowed_origins="*", async_mode=ASYNC_MODE)
rooms = {}


# ─── CORS ─────────────────────────────────────────────────────
@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
    return response


# ─── Health check ─────────────────────────────────────────────
@app.route("/")
def index():
    return jsonify({
        "status": "online",
        "service": "SEB Remote Support Server",
        "rooms": len(rooms)
    })


# ═══════════════════════════════════════════════════════════════
#  ANSWERS
# ═══════════════════════════════════════════════════════════════

def _load_answers():
    if os.path.exists(ANSWERS_FILE):
        with open(ANSWERS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def _save_answers(data):
    with open(ANSWERS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

answers = _load_answers()

@app.route("/list_answers")
def list_answers():
    return jsonify(answers)

@app.route("/get_answer", methods=["POST"])
def get_answer():
    q = request.get_json().get("question", "")
    a = answers.get(q)
    if not a:
        for key, val in answers.items():
            if key.lower() in q.lower() or q.lower() in key.lower():
                a = val
                break
    return jsonify({"answer": a or ""}), 200 if a else 404

@app.route("/add_answer", methods=["POST"])
def add_answer():
    d = request.get_json()
    q, a = d.get("question"), d.get("answer")
    if not q or not a:
        return jsonify({"error": "Missing data"}), 400
    answers[q] = a
    _save_answers(answers)
    return jsonify({"status": "ok"})

@app.route("/update_answer", methods=["POST"])
def update_answer():
    d = request.get_json()
    old_q, new_q, new_a = d.get("old_question"), d.get("new_question"), d.get("new_answer")
    if old_q in answers:
        del answers[old_q]
        answers[new_q] = new_a
        _save_answers(answers)
        return jsonify({"status": "ok"})
    return jsonify({"error": "Not found"}), 404

@app.route("/delete_answer", methods=["POST"])
def delete_answer():
    q = request.get_json().get("question")
    if q in answers:
        del answers[q]
        _save_answers(answers)
        return jsonify({"status": "ok"})
    return jsonify({"error": "Not found"}), 404


# ═══════════════════════════════════════════════════════════════
#  FILES
# ═══════════════════════════════════════════════════════════════

@app.route("/download/<filename>")
def download_file(filename):
    return send_file(os.path.join(UPLOAD_DIR, filename))

@app.route("/delete_upload/<filename>", methods=["DELETE"])
def delete_upload(filename):
    path = os.path.join(UPLOAD_DIR, filename)
    if os.path.exists(path):
        os.remove(path)
        return jsonify({"status": "ok"})
    return jsonify({"error": "Not found"}), 404

@app.route("/upload", methods=["POST"])
def upload_file():
    f = request.files.get("file")
    room = request.form.get("room", "web")
    if not f:
        return jsonify({"error": "No file"}), 400
    safe = f"{room}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{f.filename}"
    path = os.path.join(UPLOAD_DIR, safe)
    f.save(path)
    url = f"/download/{safe}"
    socketio.emit("receive_file", {
        "filename": f.filename,
        "server_filename": safe,
        "url": url
    }, room=room)
    return jsonify({"status": "ok", "url": url})


# ═══════════════════════════════════════════════════════════════
#  SOCKETIO
# ═══════════════════════════════════════════════════════════════

@socketio.on("connect")
def on_connect():
    print(f"[+] {request.sid}")

@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    for rid, info in list(rooms.items()):
        if info.get("client_sid") == sid:
            emit("client_disconnected", {"room": rid}, room=rid)
        if info.get("support_sid") == sid:
            pass

@socketio.on("join_client")
def on_join_client(data):
    room = data["room"]
    join_room(room)
    rooms.setdefault(room, {})["client_sid"] = request.sid
    emit("connected", {"room": room, "role": "client"}, room=request.sid)
    emit("client_joined", {"room": room}, room=room)
    print(f"[+] Client → {room}")

@socketio.on("join_support")
def on_join_support(data):
    room = data["room"]
    join_room(room)
    rooms.setdefault(room, {})["support_sid"] = request.sid
    emit("connected", {"room": room, "role": "support"}, room=request.sid)
    has_client = "client_sid" in rooms.get(room, {})
    emit("room_status", {"room": room, "client_online": has_client}, room=request.sid)
    print(f"[+] Support → {room}")

@socketio.on("client_message")
def on_client_msg(data):
    emit("chat_message", {"from": "client", "text": data["text"]}, room=data["room"])

@socketio.on("support_message")
def on_support_msg(data):
    emit("chat_message", {"from": "support", "text": data["text"]}, room=data["room"])

@socketio.on("send_answer")
def on_send_answer(data):
    emit("receive_answer", {"answer": data["answer"]}, room=data["room"])
    print(f"[>] Answer → {data['room']}")

@socketio.on("send_file")
def on_send_file(data):
    room, filename, b64 = data["room"], data["filename"], data["data"]
    safe = f"{room}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}"
    path = os.path.join(UPLOAD_DIR, safe)
    with open(path, "wb") as f:
        f.write(base64.b64decode(b64))
    emit("receive_file", {
        "filename": filename, "server_filename": safe,
        "url": f"/download/{safe}"
    }, room=room)

@socketio.on("web_send_file")
def on_web_send_file(data):
    room, filename, b64 = data["room"], data["filename"], data["data"]
    safe = f"web_{room}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}"
    path = os.path.join(UPLOAD_DIR, safe)
    with open(path, "wb") as f:
        f.write(base64.b64decode(b64))
    emit("receive_file", {
        "filename": filename, "server_filename": safe,
        "url": f"/download/{safe}"
    }, room=room)

@socketio.on("send_screenshot")
def on_send_screenshot(data):
    room, b64 = data["room"], data["image"]
    fname = f"ss_{room}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
    path = os.path.join(UPLOAD_DIR, fname)
    with open(path, "wb") as f:
        f.write(base64.b64decode(b64))
    emit("screenshot", {
        "server_filename": fname,
        "url": f"/download/{fname}"
    }, room=room)


# ═══════════════════════════════════════════════════════════════
#  START
# ═══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print(f"Server running on port {PORT} (async: {ASYNC_MODE})")
    socketio.run(app, host="0.0.0.0", port=PORT,
                 debug=False, allow_unsafe_werkzeug=True)
