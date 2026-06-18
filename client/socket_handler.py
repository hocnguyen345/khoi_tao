#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SocketHandler v3 — Kết nối SocketIO client → server.
✓ Auto-reconnect với exponential backoff
✓ Screenshot capture (MSS → PIL fallback)
✓ File send / download
✓ Callback hooks → main.py (bridge sang JS)
"""

import sys
import os
import base64
import socketio
import threading
import time
import requests
from datetime import datetime

# Fix encoding
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# ─── Config ───────────────────────────────────────────────────────────────────
SERVER_URL = os.environ.get("SEB_SERVER", "http://localhost:5000")
RECONNECT_INTERVAL = 3
MAX_RETRIES = 5

# ─── Callback hooks (gán từ main.py) ─────────────────────────────────────────
# main.py sẽ override các biến này để bridge event sang JS
on_connection_change = None   # fn(ok: bool)
on_chat_message      = None   # fn(sender: str, text: str)
on_answer_received   = None   # fn(question: str, answer: str)
on_system_msg        = None   # fn(msg: str)

def _fire(hook, *args):
    """Gọi hook nếu được gán, bỏ qua nếu chưa."""
    if callable(hook):
        try:
            hook(*args)
        except Exception as e:
            print(f"[WARN] Callback error: {e}")

# ─── SocketIO Client ──────────────────────────────────────────────────────────
sio = socketio.Client(
    reconnection=False,   # Tự quản lý reconnect
    logger=False,
    engineio_logger=False,
)

_room_id           = None
_reconnect_thread  = None
_connected         = False
_reconnect_active  = True

def get_room_id():
    return _room_id

def generate_room_id():
    """Tạo room ID duy nhất theo thời gian + PID."""
    return f"R{datetime.now().strftime('%H%M%S')}_{os.getpid() % 10000}"

# ─── Auto-reconnect ───────────────────────────────────────────────────────────
def _auto_reconnect():
    global _connected
    attempt = 0
    while _reconnect_active:
        try:
            if not sio.connected:
                attempt += 1
                wait = min(2 ** (attempt - 1), 30)
                print(f"[*] Reconnect #{attempt} in {wait}s...")
                time.sleep(max(wait // 2, 1))
                try:
                    sio.connect(SERVER_URL, wait_timeout=5)
                    time.sleep(0.3)
                    if _room_id:
                        sio.emit("join_client", {"room": _room_id})
                    attempt = 0
                    print("[+] Reconnected!")
                except Exception as e:
                    print(f"[!] Reconnect failed: {e}")
                    if attempt > 10:
                        try:
                            sio.disconnect()
                        except Exception:
                            pass
                        time.sleep(5)
            else:
                attempt = 0
                time.sleep(1)
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"[!] Reconnect loop error: {e}")
            time.sleep(5)

def connect_to_server(room_id=None):
    """Kết nối tới server và join room."""
    global _reconnect_thread, _room_id

    if not room_id:
        room_id = generate_room_id()

    _room_id = room_id

    try:
        print(f"[*] Connecting to {SERVER_URL}...")
        sio.connect(SERVER_URL, wait_timeout=5)
        time.sleep(0.3)
        sio.emit("join_client", {"room": _room_id})
        print(f"[OK] Connected → room: {_room_id}")
    except Exception as e:
        print(f"[ERR] Connect failed: {e}")
        _fire(on_connection_change, False)

    # Bắt đầu auto-reconnect thread (chỉ một lần)
    if not _reconnect_thread or not _reconnect_thread.is_alive():
        _reconnect_thread = threading.Thread(target=_auto_reconnect, daemon=True)
        _reconnect_thread.start()

def stop_reconnect():
    """Dừng auto-reconnect khi thoát app."""
    global _reconnect_active
    _reconnect_active = False
    try:
        sio.disconnect()
    except Exception:
        pass

# ─── Socket Events ────────────────────────────────────────────────────────────
@sio.on("connect")
def _on_connect():
    global _connected
    _connected = True
    print("[+] SocketIO connected")
    _fire(on_connection_change, True)

@sio.on("disconnect")
def _on_disconnect():
    global _connected
    _connected = False
    print("[-] SocketIO disconnected")
    _fire(on_connection_change, False)

@sio.on("chat_message")
def _on_chat_message(data):
    """Nhận tin nhắn chat từ support."""
    sender = data.get("from", "support")
    text   = data.get("text", "")
    b64    = data.get("data")
    filename = data.get("filename", "")

    if text:
        print(f"[<] Chat from {sender}: {text[:80]}")
        _fire(on_chat_message, sender, text)

    # Nếu có file đính kèm trong chat_message
    if b64 and filename:
        dl_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "downloads")
        os.makedirs(dl_dir, exist_ok=True)
        safe = f"{datetime.now().strftime('%H%M%S')}_{filename}"
        path = os.path.join(dl_dir, safe)
        try:
            with open(path, "wb") as f:
                f.write(base64.b64decode(b64))
            print(f"[<] File saved: {path}")
            _fire(on_system_msg, f"📁 File nhận: {filename} → {path}")
        except Exception as e:
            print(f"[ERR] Save inline file: {e}")

@sio.on("receive_answer")
def _on_receive_answer(data):
    """Nhận đáp án từ support."""
    answer = data.get("answer", "")
    if not answer:
        return
    print(f"[<] Answer: {answer[:60]}")
    _fire(on_answer_received, "Đáp án", answer)

@sio.on("receive_file")
def _on_receive_file(data):
    """Nhận thông báo file — tự động tải về."""
    filename        = data.get("filename", "unknown")
    server_filename = data.get("server_filename", "")
    print(f"[<] File available: {filename}")
    _fire(on_system_msg, f"📁 Đang tải: {filename}...")
    if server_filename:
        threading.Thread(
            target=download_file_from_server,
            args=(server_filename,),
            daemon=True
        ).start()

@sio.on("screenshot")
def _on_screenshot(data):
    print(f"[<] Screenshot ACK: {data.get('server_filename', '')}")

# ─── Send functions ───────────────────────────────────────────────────────────
def send_chat(text: str) -> bool:
    """Gửi tin nhắn lên server."""
    if not sio.connected or not _room_id:
        print("[!] send_chat: not connected or no room")
        return False
    try:
        sio.emit("client_message", {"room": _room_id, "text": text})
        print(f"[>] Chat sent")
        return True
    except Exception as e:
        print(f"[ERR] send_chat: {e}")
        return False

def _capture_screen():
    """Chụp màn hình, thử MSS trước rồi PIL."""
    # MSS (tốt hơn với fullscreen exclusive)
    try:
        import mss
        from PIL import Image
        with mss.mss() as sc:
            monitor = sc.monitors[1]
            img = sc.grab(monitor)
            return Image.frombytes("RGB", img.size, img.rgb)
    except Exception as e:
        print(f"[!] MSS failed: {e}")
    # PIL fallback
    try:
        from PIL import ImageGrab
        return ImageGrab.grab()
    except Exception as e:
        print(f"[!] PIL failed: {e}")
    return None

def _is_black(img) -> bool:
    """Kiểm tra ảnh có bị đen không."""
    if not img:
        return True
    try:
        thumb  = img.resize((10, 10))
        pixels = list(thumb.getdata())
        avg    = sum(p[0] + p[1] + p[2] for p in pixels) // len(pixels) // 3
        if avg < 10:
            print("[!] Screenshot black — skipping")
            return True
    except Exception:
        pass
    return False

def send_screenshot() -> bool:
    """Chụp + gửi screenshot lên server."""
    if not sio.connected or not _room_id:
        return False
    try:
        img = _capture_screen()
        if not img or _is_black(img):
            return False

        import io
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        def _emit():
            try:
                if sio.connected:
                    sio.emit("send_screenshot", {"room": _room_id, "image": b64})
                    print(f"[>] Screenshot {len(b64)//1024}KB sent")
            except Exception as e:
                print(f"[!] Screenshot emit: {e}")

        threading.Thread(target=_emit, daemon=True).start()
        return True
    except Exception as e:
        print(f"[ERR] send_screenshot: {e}")
        return False

def send_file(filepath: str) -> bool:
    """Gửi file lên server (base64)."""
    if not sio.connected or not _room_id:
        return False
    if not os.path.exists(filepath):
        print(f"[!] File not found: {filepath}")
        return False
    try:
        filename = os.path.basename(filepath)
        with open(filepath, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")
        sio.emit("send_file", {"room": _room_id, "filename": filename, "data": b64})
        print(f"[>] File sent: {filename}")
        return True
    except Exception as e:
        print(f"[ERR] send_file: {e}")
        return False

def download_file_from_server(server_filename: str, save_to: str = None) -> str | None:
    """Tải file từ server về thư mục downloads/."""
    if not save_to:
        dl_dir  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "downloads")
        os.makedirs(dl_dir, exist_ok=True)
        save_to = os.path.join(dl_dir, server_filename)
    try:
        url  = f"{SERVER_URL}/download/{server_filename}"
        resp = requests.get(url, timeout=30)
        if resp.status_code == 200:
            os.makedirs(os.path.dirname(os.path.abspath(save_to)), exist_ok=True)
            with open(save_to, "wb") as f:
                f.write(resp.content)
            print(f"[>] Downloaded: {save_to} ({len(resp.content)//1024}KB)")
            _fire(on_system_msg, f"✅ Đã tải: {os.path.basename(save_to)}")
            return save_to
        else:
            print(f"[!] Download HTTP {resp.status_code}: {url}")
    except Exception as e:
        print(f"[ERR] download_file_from_server: {e}")
    return None
