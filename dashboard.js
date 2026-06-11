/* ===== DASHBOARD JS - Full Logic + SocketIO ===== */

// --- Auth Check ---
if (sessionStorage.getItem('kr_authenticated') !== 'true') {
    window.location.href = 'index.html';
}

// --- Room Code from Login ---
const roomCode = sessionStorage.getItem('kr_room_code') || 'UNKNOWN';
document.getElementById('roomCode').textContent = `# ${roomCode}`;

// ==========================================
// SOCKETIO CONNECTION
// ==========================================
let socket = null;
let serverUrl = window.location.origin;

// If hosted on GitHub Pages, ask the user for the backend server URL
if (window.location.hostname.includes('github.io')) {
    serverUrl = sessionStorage.getItem('kr_server_url');
    if (!serverUrl) {
        serverUrl = prompt("Vui lòng nhập địa chỉ SocketIO Backend Server (ví dụ: http://localhost:5000 hoặc URL online):", "http://localhost:5000");
        if (serverUrl) {
            sessionStorage.setItem('kr_server_url', serverUrl.trim());
        } else {
            serverUrl = "http://localhost:5000";
        }
    }
}

try {
    socket = io(serverUrl);
    socket.on('connect', () => {
        console.log('🔌 SocketIO connected');
        socket.emit('join_support', { room: roomCode });
        // Update exam status
        const examStatus = document.querySelector('.exam-status span');
        if (examStatus) examStatus.textContent = 'Đã kết nối';
    });
    socket.on('disconnect', () => {
        console.log('❌ SocketIO disconnected');
        const examStatus = document.querySelector('.exam-status span');
        if (examStatus) examStatus.textContent = 'Mất kết nối';
    });
    socket.on('room_status', (data) => {
        const examStatus = document.querySelector('.exam-status span');
        if (examStatus) {
            examStatus.textContent = data.client_online ? 'Client online' : 'Chờ client...';
        }
    });
    socket.on('client_joined', () => {
        const examStatus = document.querySelector('.exam-status span');
        if (examStatus) examStatus.textContent = 'Client online';
    });
    socket.on('client_disconnected', () => {
        const examStatus = document.querySelector('.exam-status span');
        if (examStatus) examStatus.textContent = 'Client offline';
    });
    // Receive chat from client
    socket.on('chat_message', (data) => {
        if (data.from === 'client') {
            const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            const msg = document.createElement('div');
            msg.className = 'chat-msg incoming';
            msg.innerHTML = `<span class="msg-time">${time}</span><span class="msg-bubble">${escapeHtml(data.text)}</span><button class="msg-delete" title="Xóa">×</button>`;
            chatMessages?.appendChild(msg);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    });
    // Receive screenshot from client
    socket.on('screenshot', (data) => {
        if (data.url) {
            const fullUrl = serverUrl.replace(/\/$/, '') + '/' + data.url.replace(/^\//, '');
            imageState.images.push({ url: fullUrl, name: data.server_filename || 'screenshot.png' });
            imageState.currentIndex = imageState.images.length - 1;
            renderImages();
        }
    });
    // Receive file from client or support
    socket.on('receive_file', (data) => {
        const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const msg = document.createElement('div');
        const isSelf = data.sender === 'support';
        msg.className = isSelf ? 'chat-msg outgoing' : 'chat-msg incoming';
        const fullUrl = serverUrl.replace(/\/$/, '') + '/' + data.url.replace(/^\//, '');
        msg.innerHTML = `
            <span class="msg-time">${time}</span>
            <span class="msg-bubble reply" style="background: rgba(0, 188, 212, 0.1); border: 1px solid rgba(0, 188, 212, 0.2);">
                📎 <strong>File:</strong> <a href="${fullUrl}" target="_blank" style="color: var(--cyan); text-decoration: underline; font-weight: bold;">${escapeHtml(data.filename)}</a>
            </span>
            <button class="msg-delete" title="Xóa">×</button>
        `;
        chatMessages?.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
} catch(e) {
    console.warn('SocketIO not available, running in offline mode');
}

// ==========================================
// IMAGE MANAGER
// ==========================================
const imageState = { images: [], currentIndex: 0 };

const fileInput = document.getElementById('fileInput');
const uploadImgBtn = document.getElementById('uploadImgBtn');
const uploadAreaBtn = document.getElementById('uploadAreaBtn');
const deleteAllImgBtn = document.getElementById('deleteAllImgBtn');
const deleteCurrentImg = document.getElementById('deleteCurrentImg');
const imageEmpty = document.getElementById('imageEmpty');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const imagePreview = document.getElementById('imagePreview');
const imageThumbsStrip = document.getElementById('imageThumbsStrip');
const imageThumbs = document.getElementById('imageThumbs');
const imgPrev = document.getElementById('imgPrev');
const imgNext = document.getElementById('imgNext');
const qCurrent = document.getElementById('qCurrent');
const qTotal = document.getElementById('qTotal');

uploadImgBtn?.addEventListener('click', () => fileInput.click());
uploadAreaBtn?.addEventListener('click', () => fileInput.click());

fileInput?.addEventListener('change', (e) => {
    Array.from(e.target.files).forEach(file => {
        if (!file.type.startsWith('image/')) return;
        imageState.images.push({ url: URL.createObjectURL(file), name: file.name });
    });
    if (imageState.images.length > 0) {
        imageState.currentIndex = imageState.images.length - 1;
        renderImages();
    }
    fileInput.value = '';
});

// Drag & Drop
const imageDisplay = document.getElementById('imageDisplay');
imageDisplay?.addEventListener('dragover', (e) => { e.preventDefault(); imageDisplay.style.outline = '2px dashed var(--green)'; });
imageDisplay?.addEventListener('dragleave', () => imageDisplay.style.outline = '');
imageDisplay?.addEventListener('drop', (e) => {
    e.preventDefault(); imageDisplay.style.outline = '';
    Array.from(e.dataTransfer.files).forEach(file => {
        if (!file.type.startsWith('image/')) return;
        imageState.images.push({ url: URL.createObjectURL(file), name: file.name });
    });
    if (imageState.images.length > 0) {
        imageState.currentIndex = imageState.images.length - 1;
        renderImages();
    }
});

// Delete current
deleteCurrentImg?.addEventListener('click', () => {
    if (!imageState.images.length) return;
    URL.revokeObjectURL(imageState.images[imageState.currentIndex].url);
    imageState.images.splice(imageState.currentIndex, 1);
    imageState.currentIndex = Math.min(imageState.currentIndex, Math.max(0, imageState.images.length - 1));
    renderImages();
});

// Delete all
deleteAllImgBtn?.addEventListener('click', () => {
    if (!imageState.images.length) return;
    if (!confirm('Xóa tất cả hình ảnh?')) return;
    imageState.images.forEach(img => URL.revokeObjectURL(img.url));
    imageState.images = [];
    imageState.currentIndex = 0;
    renderImages();
});

// Navigate
imgPrev?.addEventListener('click', () => { if (imageState.currentIndex > 0) { imageState.currentIndex--; renderImages(); } });
imgNext?.addEventListener('click', () => { if (imageState.currentIndex < imageState.images.length - 1) { imageState.currentIndex++; renderImages(); } });

document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (e.key === 'ArrowLeft') imgPrev?.click();
    if (e.key === 'ArrowRight') imgNext?.click();
    if (e.key === 'Delete') deleteCurrentImg?.click();
});

function renderImages() {
    const has = imageState.images.length > 0;
    imageEmpty.style.display = has ? 'none' : 'flex';
    imagePreviewContainer.style.display = has ? 'flex' : 'none';
    imageThumbsStrip.style.display = has ? 'block' : 'none';
    qCurrent.textContent = has ? imageState.currentIndex + 1 : 0;
    qTotal.textContent = imageState.images.length;

    if (has) {
        imagePreview.src = imageState.images[imageState.currentIndex].url;
        imageThumbs.innerHTML = '';
        imageState.images.forEach((img, i) => {
            const t = document.createElement('img');
            t.className = 'img-thumb' + (i === imageState.currentIndex ? ' active' : '');
            t.src = img.url; t.alt = img.name;
            t.addEventListener('click', () => { imageState.currentIndex = i; renderImages(); });
            imageThumbs.appendChild(t);
        });
        imageThumbs.querySelector('.active')?.scrollIntoView({ behavior: 'smooth', inline: 'center' });
    }
    buildSessionThumbnails();
}

// ==========================================
// TIMER
// ==========================================
let timerSeconds = 30 * 60;
let timerInterval = null;
const qTimerEl = document.getElementById('qTimer');
const timerMinInput = document.getElementById('timerMinutes');
const setTimerBtn = document.getElementById('setTimerBtn');

function formatTimer(s) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    qTimerEl.textContent = formatTimer(timerSeconds);
    qTimerEl.style.color = '';
    timerInterval = setInterval(() => {
        if (timerSeconds <= 0) { clearInterval(timerInterval); qTimerEl.textContent = '00:00'; qTimerEl.style.color = 'var(--red)'; return; }
        timerSeconds--;
        qTimerEl.textContent = formatTimer(timerSeconds);
        if (timerSeconds <= 300) qTimerEl.style.color = 'var(--red)';
    }, 1000);
}

setTimerBtn?.addEventListener('click', () => {
    timerSeconds = (parseInt(timerMinInput.value) || 30) * 60;
    startTimer();
});
startTimer();

// ==========================================
// CHAT
// ==========================================
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');

function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// Delete messages (event delegation)
chatMessages?.addEventListener('click', (e) => {
    if (e.target.classList.contains('msg-delete')) {
        const msg = e.target.closest('.chat-msg');
        msg.style.transition = 'all 0.3s';
        msg.style.opacity = '0';
        msg.style.transform = 'translateX(-20px)';
        setTimeout(() => msg.remove(), 300);
    }
});

// Send chat
function sendChat() {
    const text = chatInput?.value.trim();
    if (!text) return;
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const msg = document.createElement('div');
    msg.className = 'chat-msg outgoing';
    msg.innerHTML = `<span class="msg-time">${time}</span><span class="msg-bubble reply">${escapeHtml(text)}</span><button class="msg-delete" title="Xóa">×</button>`;
    chatMessages?.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    chatInput.value = '';
}
document.getElementById('chatSendBtn')?.addEventListener('click', sendChat);
chatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

// Extra menu
const chatPlusBtn = document.getElementById('chatPlusBtn');
const chatExtraMenu = document.getElementById('chatExtraMenu');
chatPlusBtn?.addEventListener('click', (e) => { e.stopPropagation(); chatExtraMenu?.classList.toggle('show'); });
document.addEventListener('click', () => chatExtraMenu?.classList.remove('show'));

// Send file → trigger chatFileInput instead of local image manager
const chatFileInput = document.getElementById('chatFileInput');
document.getElementById('sendFileBtn')?.addEventListener('click', () => {
    chatFileInput?.click();
    chatExtraMenu?.classList.remove('show');
});

chatFileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        const b64 = evt.target.result.split(',')[1];
        if (socket && socket.connected) {
            socket.emit('send_file', {
                room: roomCode,
                filename: file.name,
                data: b64,
                sender: 'support'
            });
        }
    };
    reader.readAsDataURL(file);
    chatFileInput.value = ''; // reset
});

// ==========================================
// HEADER BUTTONS: COPY + DELETE + EXPORT
// ==========================================

// Delete all messages
document.getElementById('headerDeleteBtn')?.addEventListener('click', () => {
    if (!chatMessages.children.length) return;
    if (!confirm('Xóa tất cả tin nhắn?')) return;
    while (chatMessages.firstChild) chatMessages.removeChild(chatMessages.firstChild);
});

// Copy → open Copy Answer modal
document.getElementById('headerCopyBtn')?.addEventListener('click', () => {
    openCopyModal();
});

// Export Report
document.querySelector('.export-btn')?.addEventListener('click', () => {
    const code = roomCode;
    const answersText = document.getElementById('copyAnswerInput')?.value.trim() || 'Chưa có đáp án nào được sao chép/tạo.';
    
    let chatLog = '';
    const messages = chatMessages?.children || [];
    for (let msg of messages) {
        const time = msg.querySelector('.msg-time')?.textContent || '';
        const text = msg.querySelector('.msg-bubble')?.textContent || '';
        const isIncoming = msg.classList.contains('incoming');
        const isSystem = msg.classList.contains('system');
        
        let sender = 'Hỗ trợ';
        if (isIncoming) sender = 'Thí sinh';
        else if (isSystem) sender = 'Hệ thống';
        
        chatLog += `[${time}] ${sender}: ${text}\n`;
    }
    
    const reportContent = 
        `==================================================\n` +
        `         BÁO CÁO PHÒNG HỖ TRỢ - KAMEN RIDER\n` +
        `==================================================\n` +
        `Mã phòng: ${code}\n` +
        `Thời gian xuất: ${new Date().toLocaleString('vi-VN')}\n` +
        `--------------------------------------------------\n` +
        `ĐÁP ÁN ĐÃ LƯU / SOẠN THẢO:\n\n` +
        `${answersText}\n` +
        `--------------------------------------------------\n` +
        `LỊCH SỬ CHAT VÀ PHẢN HỒI:\n\n` +
        `${chatLog}\n` +
        `==================================================\n`;
        
    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Report_Room_${code}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// ==========================================
// COPY ANSWER MODAL
// ==========================================
const copyModal = document.getElementById('copyAnswerModal');
const copyRoomCode = document.getElementById('copyRoomCode');
const copyExamCode = document.getElementById('copyExamCode');
const copyQuestionType = document.getElementById('copyQuestionType');
const copyAnswerInput = document.getElementById('copyAnswerInput');
const previewRoom = document.getElementById('previewRoom');
const previewExam = document.getElementById('previewExam');
const previewTypeLabel = document.getElementById('previewTypeLabel');
const previewAnswers = document.getElementById('previewAnswers');

function openCopyModal() {
    copyRoomCode.value = roomCode;
    previewRoom.textContent = roomCode;
    previewExam.textContent = copyExamCode.value || '';
    updateCopyPreview();
    copyModal?.classList.add('show');
}

function closeCopyModal() {
    copyModal?.classList.remove('show');
}

function updateCopyPreview() {
    previewRoom.textContent = copyRoomCode.value || '';
    previewExam.textContent = copyExamCode.value || '';
    previewTypeLabel.textContent = (copyQuestionType.value || 'MUL') + ':';
    previewAnswers.textContent = copyAnswerInput.value || '';
}

// Live preview updates
copyExamCode?.addEventListener('input', updateCopyPreview);
copyQuestionType?.addEventListener('change', updateCopyPreview);
copyAnswerInput?.addEventListener('input', updateCopyPreview);

// Close buttons
document.getElementById('copyModalClose')?.addEventListener('click', closeCopyModal);
document.getElementById('copyCloseBtn')?.addEventListener('click', closeCopyModal);

// Clear
document.getElementById('copyClearBtn')?.addEventListener('click', () => {
    copyExamCode.value = '';
    copyAnswerInput.value = '';
    updateCopyPreview();
});

// Send → create formatted message in chat
document.getElementById('copySendBtn')?.addEventListener('click', () => {
    const type = copyQuestionType.value || 'MUL';
    const answers = copyAnswerInput.value.trim();
    if (!answers) { copyAnswerInput.focus(); return; }

    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const formattedText = `${type}: ${answers}`;

    const msg = document.createElement('div');
    msg.className = 'chat-msg system';
    msg.innerHTML = `<span class="msg-bubble code">${escapeHtml(formattedText)}</span><span class="msg-time">${time}</span><button class="msg-delete" title="Xóa">×</button>`;
    chatMessages?.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Copy to clipboard
    const fullText = `Room: ${roomCode}\nExam Code: ${copyExamCode.value}\n\n${type}: ${answers}`;
    navigator.clipboard.writeText(fullText).catch(() => {});

    closeCopyModal();
});

// ==========================================
// SEND TEXT MODAL
// ==========================================
const textModal = document.getElementById('textModal');
const textContent = document.getElementById('textModalContent');
const textCharCount = document.getElementById('textCharCount');

document.getElementById('sendTextBtn')?.addEventListener('click', () => {
    textModal?.classList.add('show');
    chatExtraMenu?.classList.remove('show');
    textContent?.focus();
});

document.getElementById('textModalCancel')?.addEventListener('click', () => {
    textModal?.classList.remove('show');
});

document.getElementById('textModalConfirm')?.addEventListener('click', () => {
    const text = textContent?.value.trim();
    if (text) {
        const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const msg = document.createElement('div');
        msg.className = 'chat-msg outgoing';
        const preview = text.length > 120 ? text.substring(0, 120) + '...' : text;
        msg.innerHTML = `<span class="msg-time">${time}</span><span class="msg-bubble reply">${escapeHtml(preview)}</span><button class="msg-delete" title="Xóa">×</button>`;
        chatMessages?.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        textContent.value = '';
        textCharCount.textContent = '0/40.000';
    }
    textModal?.classList.remove('show');
});

textContent?.addEventListener('input', () => {
    textCharCount.textContent = `${textContent.value.length.toLocaleString()}/40.000`;
});

// ==========================================
// ANSWER GRID
// ==========================================
(function buildAnswerGrid() {
    const grid = document.getElementById('answerGrid');
    if (!grid) return;
    for (let i = 1; i <= 30; i++) {
        const cell = document.createElement('div');
        cell.className = 'answer-cell';
        cell.dataset.num = i;
        cell.innerHTML = `<span>${i}</span>`;
        cell.addEventListener('click', () => { cell.classList.toggle('active'); updateAnswerCount(); });
        grid.appendChild(cell);
    }
})();

function updateAnswerCount() {
    const el = document.getElementById('answerCount');
    if (el) el.textContent = document.querySelectorAll('.answer-cell.active').length;
}

document.querySelector('.delete-answers')?.addEventListener('click', () => {
    document.querySelectorAll('.answer-cell.active').forEach(c => c.classList.remove('active'));
    updateAnswerCount();
});

document.getElementById('answerToggle')?.addEventListener('click', () => {
    document.getElementById('answerPanel')?.classList.toggle('collapsed');
});

// ==========================================
// SESSION THUMBNAILS
// ==========================================
function buildSessionThumbnails() {
    const container = document.getElementById('sessionThumbnails');
    if (!container) return;
    container.innerHTML = '';
    const count = imageState.images.length;
    const pageSize = 5;
    const totalPages = Math.ceil(count / pageSize) || 1;
    const currentPage = Math.floor(imageState.currentIndex / pageSize) + 1;
    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, count);

    const pageInfo = document.querySelector('.session-page-info');
    if (pageInfo) {
        pageInfo.textContent = count > 0
            ? `Page ${currentPage}/${totalPages} (${start + 1}-${end}/${count})`
            : 'Page 0/0 (0/0)';
    }

    for (let i = start; i < end; i++) {
        const thumb = document.createElement('div');
        thumb.className = 'session-thumb' + (i === imageState.currentIndex ? ' active' : '');
        const now = new Date();
        thumb.innerHTML = `
            <div class="thumb-preview" style="background-image:url('${imageState.images[i].url}');background-size:cover;background-position:center;">
                <span class="thumb-badge">SEB</span>
            </div>
            <div class="thumb-info">${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</div>
        `;
        thumb.addEventListener('click', () => { imageState.currentIndex = i; renderImages(); });
        container.appendChild(thumb);
    }
}
buildSessionThumbnails();

// ==========================================
// SIDEBAR RESIZE
// ==========================================
(function initResize() {
    const handle = document.getElementById('resizeHandle');
    const sidebar = document.getElementById('sidebarChat');
    if (!handle || !sidebar) return;
    let isResizing = false;
    handle.addEventListener('mousedown', (e) => { isResizing = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => { if (!isResizing) return; sidebar.style.width = Math.max(180, Math.min(400, e.clientX)) + 'px'; });
    document.addEventListener('mouseup', () => { isResizing = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; });
})();

// ==========================================
// TABS
// ==========================================
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('show');
    });
});

// ==========================================
// SOCKETIO: Override send functions
// ==========================================

// Override sendChat to also emit via socket
const _origSendChat = sendChat;
function sendChatSocket() {
    const text = chatInput?.value.trim();
    if (!text) return;
    // Send via socket if connected
    if (socket && socket.connected) {
        socket.emit('support_message', { room: roomCode, text: text });
    }
    // Show in local UI
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const msg = document.createElement('div');
    msg.className = 'chat-msg outgoing';
    msg.innerHTML = `<span class="msg-time">${time}</span><span class="msg-bubble reply">${escapeHtml(text)}</span><button class="msg-delete" title="Xóa">×</button>`;
    chatMessages?.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    chatInput.value = '';
}

// Replace event listeners
document.getElementById('chatSendBtn')?.removeEventListener('click', sendChat);
document.getElementById('chatSendBtn')?.addEventListener('click', sendChatSocket);
chatInput?.removeEventListener('keydown', sendChat);
chatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatSocket(); });

// Override Copy Answer send to also emit via socket
const origCopySend = document.getElementById('copySendBtn');
if (origCopySend) {
    origCopySend.addEventListener('click', () => {
        const type = document.getElementById('copyQuestionType')?.value || 'MUL';
        const answers = document.getElementById('copyAnswerInput')?.value.trim();
        if (answers && socket && socket.connected) {
            socket.emit('send_answer', { room: roomCode, answer: `${type}: ${answers}` });
        }
    });
}
