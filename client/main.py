#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Main — KR Client Entry Point.
Mở ui.html trong Chrome/Edge ở chế độ --app (không cần cài thêm gì).
Kết nối SocketIO tới server cloud, nhận chat/đáp án từ support.
Yêu cầu quyền Administrator (để dùng hotkey toàn cục).
"""

import signal
import traceback
import threading
import time
import ctypes
import sys
import os
import subprocess

# ─── Fix encoding ─────────────────────────────────────────────────────────────
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ─── Admin Check ──────────────────────────────────────────────────────────────
def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False

def run_as_admin():
    script = os.path.abspath(sys.argv[0])
    try:
        ctypes.windll.shell32.ShellExecuteW(
            None, "runas", sys.executable, f'"{script}"', None, 1
        )
    except Exception as e:
        print(f"[ERR] Không thể elevate: {e}")
        sys.exit(1)

def ensure_admin():
    if not is_admin():
        print("[!] Yêu cầu quyền Administrator — đang khởi động lại...")
        run_as_admin()
        sys.exit(0)
    print("[+] Đang chạy với quyền Administrator!")


# ─── Tìm Chrome / Edge ────────────────────────────────────────────────────────
BROWSER_PATHS = [
    # Chrome
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expanduser(r"~\AppData\Local\Google\Chrome\Application\chrome.exe"),
    # Edge
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    os.path.expanduser(r"~\AppData\Local\Microsoft\Edge\Application\msedge.exe"),
    # Chromium
    r"C:\Program Files\Chromium\Application\chrome.exe",
]

def find_browser():
    for path in BROWSER_PATHS:
        if os.path.exists(path):
            return path
    # Thử tìm qua where/which
    for name in ("chrome", "msedge", "chromium"):
        try:
            result = subprocess.run(
                ["where", name], capture_output=True, text=True
            )
            if result.returncode == 0:
                path = result.stdout.strip().split("\n")[0].strip()
                if os.path.exists(path):
                    return path
        except Exception:
            pass
    return None

_browser_proc = None

def open_browser_app(url: str, width=360, height=520):
    """Mở Chrome/Edge ở chế độ --app (cửa sổ riêng, không có toolbar)."""
    global _browser_proc
    browser = find_browser()
    if not browser:
        print("[ERR] Không tìm thấy Chrome hoặc Edge!")
        print("      Vui lòng cài Chrome: https://chrome.google.com")
        input("Nhấn Enter để thoát...")
        sys.exit(1)

    # Profile riêng để tránh ảnh hưởng profile chính
    profile_dir = os.path.join(BASE_DIR, ".browser_profile")
    os.makedirs(profile_dir, exist_ok=True)

    args = [
        browser,
        f"--app={url}",
        f"--window-size={width},{height}",
        "--window-position=20,80",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--disable-sync",
        "--disable-translate",
        "--disable-background-networking",
        "--disable-client-side-phishing-detection",
        "--disable-component-update",
        "--disable-hang-monitor",
        "--disable-popup-blocking",
        "--disable-prompt-on-repost",
        "--disable-renderer-backgrounding",
        "--noerrdialogs",
        "--silent-launch",
        "--force-app-mode",
        "--allow-file-access-from-files",
        "--disable-web-security",  # Cho phép file:// load resources
    ]

    print(f"[+] Mở browser: {os.path.basename(browser)}")
    print(f"[+] URL: {url}")
    _browser_proc = subprocess.Popen(
        args,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return _browser_proc


def close_browser():
    """Đóng cửa sổ browser khi thoát."""
    global _browser_proc
    if _browser_proc and _browser_proc.poll() is None:
        try:
            _browser_proc.terminate()
            _browser_proc.wait(timeout=3)
        except Exception:
            try:
                _browser_proc.kill()
            except Exception:
                pass


# ─── Mini Flask server phục vụ ui.html + inject config ───────────────────────
import socket_handler as _sh

_flask_port = None

def _get_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]

import socket

def start_local_server():
    """
    Khởi động Flask mini-server (localhost only) để phục vụ ui.html + script.js.
    Không dùng eventlet — chỉ cần threading đơn giản.
    Expose endpoint /config để JS lấy room_id và server_url.
    """
    global _flask_port
    try:
        from flask import Flask, send_from_directory, jsonify
        from flask_socketio import SocketIO
    except ImportError:
        print("[ERR] Flask chưa được cài. Chạy: pip install flask flask-socketio")
        sys.exit(1)

    _flask_port = _get_free_port()
    mini = Flask(__name__, static_folder=BASE_DIR)

    @mini.route("/")
    def index():
        return send_from_directory(BASE_DIR, "ui.html")

    @mini.route("/script.js")
    def script():
        return send_from_directory(BASE_DIR, "script.js")

    @mini.route("/config")
    def config():
        """JS gọi endpoint này để lấy room_id và server_url."""
        return jsonify({
            "room_id":    _sh.get_room_id() or "",
            "server_url": _sh.SERVER_URL,
        })

    # Tắt log Flask
    import logging
    log = logging.getLogger("werkzeug")
    log.setLevel(logging.ERROR)

    def _run():
        mini.run(host="127.0.0.1", port=_flask_port, debug=False, use_reloader=False)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    time.sleep(0.5)  # Chờ server ready
    print(f"[+] Local server: http://127.0.0.1:{_flask_port}")
    return f"http://127.0.0.1:{_flask_port}"


# ─── Hotkeys ──────────────────────────────────────────────────────────────────
_f1_count = 0
_f1_timer = None

def _on_f1():
    global _f1_count, _f1_timer
    _f1_count += 1
    if _f1_count == 1:
        if _f1_timer:
            _f1_timer.cancel()
        _f1_timer = threading.Timer(0.5, _reset_f1)
        _f1_timer.start()
    elif _f1_count >= 2:
        print("[*] F1x2 → Thoát")
        close_browser()
        os._exit(0)

def _reset_f1():
    global _f1_count
    _f1_count = 0

def _register_hotkeys():
    try:
        import keyboard
        keyboard.add_hotkey("f1", _on_f1)
        keyboard.add_hotkey("ctrl+s", lambda: threading.Thread(
            target=_sh.send_screenshot, daemon=True
        ).start())
        print("[OK] Hotkey: F1×2=exit  Ctrl+S=screenshot")
    except ImportError:
        print("[WARN] 'keyboard' không có — hotkeys bị tắt")
    except Exception as e:
        print(f"[WARN] Hotkey lỗi: {e}")


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    print("=" * 50)
    print("  KR Client Tool")
    print("=" * 50)

    # 1. Khởi động local server phục vụ ui.html
    local_url = start_local_server()

    # 2. Generate room_id & kết nối socket (background)
    room_id = _sh.generate_room_id()
    def _start_socket():
        _sh.connect_to_server(room_id=room_id)
    threading.Thread(target=_start_socket, daemon=True).start()

    # 3. Đăng ký hotkeys
    _register_hotkeys()

    # 4. Mở browser
    proc = open_browser_app(local_url, width=360, height=540)
    if not proc:
        print("[ERR] Không mở được browser!")
        return

    print("[OK] Đang chạy — đóng cửa sổ browser để thoát")

    # 5. Chờ browser đóng
    try:
        proc.wait()
    except KeyboardInterrupt:
        print("\n[*] Ctrl+C — đang thoát...")
    finally:
        close_browser()
        _sh.stop_reconnect()
        print("[*] Đã thoát.")


# ─── Graceful shutdown ────────────────────────────────────────────────────────
class GracefulKiller:
    def __init__(self):
        self.kill_now = False
        signal.signal(signal.SIGINT,  self._exit)
        signal.signal(signal.SIGTERM, self._exit)

    def _exit(self, signum, frame):
        print(f"\n[!] Signal {signum} — đang dừng...")
        self.kill_now = True
        close_browser()
        _sh.stop_reconnect()
        os._exit(0)

DEFAULT_RESTART_DELAY = 5

def run_with_recovery(target_task, delay_seconds=DEFAULT_RESTART_DELAY):
    GracefulKiller()
    while True:
        try:
            target_task()
            print("[i] Tiến trình kết thúc bình thường.")
            break
        except SystemExit:
            break
        except Exception as e:
            print(f"[ERR] Crash: {e}")
            traceback.print_exc()
            print(f"[*] Khởi động lại sau {delay_seconds}s...")
            time.sleep(delay_seconds)


# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    ensure_admin()
    run_with_recovery(target_task=main, delay_seconds=DEFAULT_RESTART_DELAY)