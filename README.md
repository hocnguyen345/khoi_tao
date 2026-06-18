# KAMEN RIDER — Remote Support System

Hệ thống hỗ trợ từ xa gồm 3 thành phần:

```
khoi_tao/
├── server/    ← Backend Flask+SocketIO (deploy lên Render)
├── client/    ← Python client (ai tải về máy cũng chạy được)
└── web/       ← Dashboard HTML cho support (deploy cùng server)
    (index.html, dashboard.html, dashboard.js, dashboard.css, ...)
```

---

## 1. Deploy Server (Render — miễn phí)

1. Vào [render.com](https://render.com) → New Web Service → connect repo này
2. Cài đặt:
   - **Root Directory**: `server`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn --worker-class eventlet -w 1 server:app`
3. Deploy → lấy URL: `https://ten-server.onrender.com`

---

## 2. Cấu hình Client

Mở `client/socket_handler.py`, sửa dòng:
```python
SERVER_URL = os.environ.get("SEB_SERVER", "https://ten-server.onrender.com")
```

---

## 3. Chạy Client (học sinh)

```
1. Tải ZIP → Giải nén → vào thư mục client/
2. Double-click run_admin.bat
3. Cửa sổ Chrome/Edge sẽ mở tự động
4. Thông báo Room ID cho support
```

**Yêu cầu:** Windows + Python 3.10+ + Chrome/Edge

---

## 4. Dùng Dashboard (support/giáo viên)

Mở `https://ten-server.onrender.com` → nhập Room Code của học sinh → HENSHIN!

---

## Hotkeys (Client)

| Phím | Chức năng |
|------|-----------|
| F1 × 2 | Thoát |
| Ctrl+S | Chụp screenshot gửi support |
