# KR Client Tool — Hướng dẫn cài đặt

Tool nhận đáp án và chat với support trong kỳ thi.

## Yêu cầu

- Windows 10/11
- Python 3.10+ ([tải tại python.org](https://python.org/downloads))
- Google Chrome hoặc Microsoft Edge
- Quyền Administrator

## Cài đặt nhanh

### Bước 1: Tải mã nguồn
```
Tải ZIP từ GitHub → Giải nén → Vào thư mục MA_NGUON
```

### Bước 2: Cấu hình server URL

Mở file `socket_handler.py`, tìm dòng:
```python
SERVER_URL = os.environ.get("SEB_SERVER", "http://localhost:5000")
```

Thay URL server cloud vào (lấy từ người quản lý):
```python
SERVER_URL = os.environ.get("SEB_SERVER", "https://your-server.onrender.com")
```

### Bước 3: Chạy

**Cách 1 — Double-click:**
```
run_admin.bat  (sẽ tự cài thư viện và chạy)
```

**Cách 2 — Command line (với quyền Admin):**
```bash
pip install -r requirements.txt
python main.py
```

## Hotkeys

| Phím | Chức năng |
|------|-----------|
| F1 × 2 | Thoát chương trình |
| Ctrl + S | Chụp và gửi screenshot |

## Giao diện

- **Tab Chat** — Chat với support
- **Tab Đáp án** — Xem đáp án được gửi (click để copy)

## Lưu ý

- Cửa sổ sẽ mở trong Chrome/Edge ở chế độ app (không có toolbar)
- Cần kết nối internet để kết nối tới server
- Mã phòng (Room ID) được tạo tự động khi khởi động — thông báo cho support biết
