/* ===== DASHBOARD JS — Clean rewrite ===== */

// ─── Auth ────────────────────────────────────────────────────
if (sessionStorage.getItem('kr_authenticated') !== 'true') {
    window.location.href = 'index.html';
}

const roomCode = sessionStorage.getItem('kr_room_code') || 'UNKNOWN';
document.getElementById('roomCode').textContent = `# ${roomCode}`;


// ─── Server URL (configurable) ──────────────────────────────
const SERVER_URL = sessionStorage.getItem('kr_server_url') || window.location.origin;


// ─── Helpers ─────────────────────────────────────────────────
function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function timeNow() {
    return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function setStatus(text) {
    const el = document.querySelector('.exam-status span');
    if (el) el.textContent = text;
}


// ═════════════════════════════════════════════════════════════
//  SOCKETIO
// ═════════════════════════════════════════════════════════════
let socket = null;

function initSocket() {
    try {
        socket = io(SERVER_URL);

        socket.on('connect', () => {
            console.log('[+] Connected to', SERVER_URL);
            socket.emit('join_support', { room: roomCode });
            setStatus('Đã kết nối');
        });

        socket.on('disconnect', () => {
            console.log('[-] Disconnected');
            setStatus('Mất kết nối');
        });

        socket.on('room_status', (d) => {
            setStatus(d.client_online ? 'Client online' : 'Chờ client...');
        });

        socket.on('client_joined', () => setStatus('Client online'));
        socket.on('client_disconnected', () => setStatus('Client offline'));

        // Chat from client
        socket.on('chat_message', (d) => {
            if (d.from === 'client') addChatMsg(d.text, 'incoming');
        });

        // Screenshot from client
        socket.on('screenshot', (d) => {
            if (!d.url) return;
            const url = d.url.startsWith('http') ? d.url : SERVER_URL + d.url;
            imageState.images.push({ url, name: d.server_filename || 'screenshot.png' });
            imageState.currentIndex = imageState.images.length - 1;
            renderImages();
        });

        // File from client
        socket.on('receive_file', (d) => {
            const url = d.url.startsWith('http') ? d.url : SERVER_URL + d.url;
            addChatMsg(`📎 File: ${d.filename}`, 'incoming', url);
        });

    } catch (e) {
        console.warn('SocketIO error:', e);
        setStatus('Offline mode');
    }
}
initSocket();


// ═════════════════════════════════════════════════════════════
//  IMAGE MANAGER
// ═════════════════════════════════════════════════════════════
const imageState = { images: [], currentIndex: 0 };

const fileInput = document.getElementById('fileInput');
const imageEmpty = document.getElementById('imageEmpty');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const imagePreview = document.getElementById('imagePreview');
const imageThumbsStrip = document.getElementById('imageThumbsStrip');
const imageThumbs = document.getElementById('imageThumbs');
const qCurrent = document.getElementById('qCurrent');
const qTotal = document.getElementById('qTotal');

// Upload triggers
document.getElementById('uploadImgBtn')?.addEventListener('click', () => fileInput.click());
document.getElementById('uploadAreaBtn')?.addEventListener('click', () => fileInput.click());

fileInput?.addEventListener('change', (e) => {
    Array.from(e.target.files).forEach(f => {
        if (!f.type.startsWith('image/')) return;
        imageState.images.push({ url: URL.createObjectURL(f), name: f.name });
    });
    if (imageState.images.length) {
        imageState.currentIndex = imageState.images.length - 1;
        renderImages();
    }
    fileInput.value = '';
});

// Drag & Drop
const imageDisplay = document.getElementById('imageDisplay');
imageDisplay?.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageDisplay.style.outline = '2px dashed var(--green)';
});
imageDisplay?.addEventListener('dragleave', () => imageDisplay.style.outline = '');
imageDisplay?.addEventListener('drop', (e) => {
    e.preventDefault();
    imageDisplay.style.outline = '';
    Array.from(e.dataTransfer.files).forEach(f => {
        if (!f.type.startsWith('image/')) return;
        imageState.images.push({ url: URL.createObjectURL(f), name: f.name });
    });
    if (imageState.images.length) {
        imageState.currentIndex = imageState.images.length - 1;
        renderImages();
    }
});

// Delete
document.getElementById('deleteCurrentImg')?.addEventListener('click', () => {
    if (!imageState.images.length) return;
    URL.revokeObjectURL(imageState.images[imageState.currentIndex].url);
    imageState.images.splice(imageState.currentIndex, 1);
    imageState.currentIndex = Math.min(imageState.currentIndex, Math.max(0, imageState.images.length - 1));
    renderImages();
});

document.getElementById('deleteAllImgBtn')?.addEventListener('click', () => {
    if (!imageState.images.length || !confirm('Xóa tất cả hình ảnh?')) return;
    imageState.images.forEach(i => URL.revokeObjectURL(i.url));
    imageState.images = [];
    imageState.currentIndex = 0;
    renderImages();
});

// Navigate
document.getElementById('imgPrev')?.addEventListener('click', () => {
    if (imageState.currentIndex > 0) { imageState.currentIndex--; renderImages(); }
});
document.getElementById('imgNext')?.addEventListener('click', () => {
    if (imageState.currentIndex < imageState.images.length - 1) { imageState.currentIndex++; renderImages(); }
});

document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (e.key === 'ArrowLeft') document.getElementById('imgPrev')?.click();
    if (e.key === 'ArrowRight') document.getElementById('imgNext')?.click();
    if (e.key === 'Delete') document.getElementById('deleteCurrentImg')?.click();
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
            t.src = img.url;
            t.alt = img.name;
            t.addEventListener('click', () => { imageState.currentIndex = i; renderImages(); });
            imageThumbs.appendChild(t);
        });
        imageThumbs.querySelector('.active')?.scrollIntoView({ behavior: 'smooth', inline: 'center' });
    }
    buildSessionThumbnails();
}


// ═════════════════════════════════════════════════════════════
//  TIMER
// ═════════════════════════════════════════════════════════════
let timerSeconds = 30 * 60;
let timerInterval = null;
const qTimerEl = document.getElementById('qTimer');

function formatTimer(s) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    qTimerEl.textContent = formatTimer(timerSeconds);
    qTimerEl.style.color = '';
    timerInterval = setInterval(() => {
        if (timerSeconds <= 0) {
            clearInterval(timerInterval);
            qTimerEl.textContent = '00:00';
            qTimerEl.style.color = 'var(--red)';
            return;
        }
        timerSeconds--;
        qTimerEl.textContent = formatTimer(timerSeconds);
        if (timerSeconds <= 300) qTimerEl.style.color = 'var(--red)';
    }, 1000);
}

document.getElementById('setTimerBtn')?.addEventListener('click', () => {
    timerSeconds = (parseInt(document.getElementById('timerMinutes').value) || 30) * 60;
    startTimer();
});
startTimer();


// ═════════════════════════════════════════════════════════════
//  CHAT
// ═════════════════════════════════════════════════════════════
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');

function addChatMsg(text, type, fileUrl) {
    const time = timeNow();
    const msg = document.createElement('div');
    msg.className = `chat-msg ${type}`;

    let content = escapeHtml(text);
    if (fileUrl) {
        content += ` <a href="${fileUrl}" target="_blank" style="color:var(--cyan)">⬇ Tải</a>`;
    }

    const bubbleClass = type === 'outgoing' ? 'reply' : '';
    msg.innerHTML = `<span class="msg-time">${time}</span><span class="msg-bubble ${bubbleClass}">${content}</span><button class="msg-delete" title="Xóa">×</button>`;
    chatMessages?.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Delete messages (delegation)
chatMessages?.addEventListener('click', (e) => {
    if (!e.target.classList.contains('msg-delete')) return;
    const msg = e.target.closest('.chat-msg');
    msg.style.transition = 'all 0.3s';
    msg.style.opacity = '0';
    msg.style.transform = 'translateX(-20px)';
    setTimeout(() => msg.remove(), 300);
});

// Send chat
function sendChat() {
    const text = chatInput?.value.trim();
    if (!text) return;
    if (socket?.connected) {
        socket.emit('support_message', { room: roomCode, text });
    }
    addChatMsg(text, 'outgoing');
    chatInput.value = '';
}

document.getElementById('chatSendBtn')?.addEventListener('click', sendChat);
chatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

// Extra menu
const chatExtraMenu = document.getElementById('chatExtraMenu');
document.getElementById('chatPlusBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    chatExtraMenu?.classList.toggle('show');
});
document.addEventListener('click', () => chatExtraMenu?.classList.remove('show'));

document.getElementById('sendFileBtn')?.addEventListener('click', () => {
    chatExtraMenu?.classList.remove('show');
    // Separate file input for sending any file to client
    const fi = document.createElement('input');
    fi.type = 'file';
    fi.accept = '*/*';
    fi.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const b64 = reader.result.split(',')[1];
            if (socket?.connected) {
                socket.emit('web_send_file', {
                    room: roomCode,
                    filename: file.name,
                    data: b64
                });
                addChatMsg(`📤 Đã gửi file: ${file.name}`, 'outgoing');
            } else {
                addChatMsg(`❌ Không kết nối, không gửi được: ${file.name}`, 'system');
            }
        };
        reader.readAsDataURL(file);
    });
    fi.click();
});


// ═════════════════════════════════════════════════════════════
//  HEADER BUTTONS
// ═════════════════════════════════════════════════════════════

// Delete all messages
document.getElementById('headerDeleteBtn')?.addEventListener('click', () => {
    if (!chatMessages.children.length || !confirm('Xóa tất cả tin nhắn?')) return;
    chatMessages.innerHTML = '';
});

// Copy Answer modal
document.getElementById('headerCopyBtn')?.addEventListener('click', openCopyModal);


// ═════════════════════════════════════════════════════════════
//  COPY ANSWER MODAL
// ═════════════════════════════════════════════════════════════
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

copyExamCode?.addEventListener('input', updateCopyPreview);
copyQuestionType?.addEventListener('change', updateCopyPreview);
copyAnswerInput?.addEventListener('input', updateCopyPreview);

document.getElementById('copyModalClose')?.addEventListener('click', closeCopyModal);
document.getElementById('copyCloseBtn')?.addEventListener('click', closeCopyModal);

document.getElementById('copyClearBtn')?.addEventListener('click', () => {
    copyExamCode.value = '';
    copyAnswerInput.value = '';
    updateCopyPreview();
});

document.getElementById('copySendBtn')?.addEventListener('click', () => {
    const type = copyQuestionType.value || 'MUL';
    const answers = copyAnswerInput.value.trim();
    if (!answers) { copyAnswerInput.focus(); return; }

    const formattedText = `${type}: ${answers}`;

    // Show in chat
    addChatMsg(formattedText, 'system');

    // Copy to clipboard
    const fullText = `Room: ${roomCode}\nExam Code: ${copyExamCode.value}\n\n${type}: ${answers}`;
    navigator.clipboard.writeText(fullText).catch(() => {});

    // Send via socket
    if (socket?.connected) {
        socket.emit('send_answer', { room: roomCode, answer: formattedText });
    }

    closeCopyModal();
});


// ═════════════════════════════════════════════════════════════
//  SEND TEXT MODAL
// ═════════════════════════════════════════════════════════════
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
        const preview = text.length > 120 ? text.substring(0, 120) + '...' : text;
        addChatMsg(preview, 'outgoing');

        if (socket?.connected) {
            socket.emit('support_message', { room: roomCode, text });
        }

        textContent.value = '';
        textCharCount.textContent = '0/40.000';
    }
    textModal?.classList.remove('show');
});

textContent?.addEventListener('input', () => {
    textCharCount.textContent = `${textContent.value.length.toLocaleString()}/40.000`;
});


// ═════════════════════════════════════════════════════════════
//  ANSWER GRID
// ═════════════════════════════════════════════════════════════
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


// ═════════════════════════════════════════════════════════════
//  SESSION THUMBNAILS
// ═════════════════════════════════════════════════════════════
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
        thumb.innerHTML = `
            <div class="thumb-preview" style="background-image:url('${imageState.images[i].url}');background-size:cover;background-position:center;">
                <span class="thumb-badge">SEB</span>
            </div>
            <div class="thumb-info">${timeNow()}</div>
        `;
        thumb.addEventListener('click', () => { imageState.currentIndex = i; renderImages(); });
        container.appendChild(thumb);
    }
}
buildSessionThumbnails();


// ═════════════════════════════════════════════════════════════
//  SIDEBAR RESIZE
// ═════════════════════════════════════════════════════════════
(function initResize() {
    const handle = document.getElementById('resizeHandle');
    const sidebar = document.getElementById('sidebarChat');
    if (!handle || !sidebar) return;
    let resizing = false;
    handle.addEventListener('mousedown', (e) => {
        resizing = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!resizing) return;
        sidebar.style.width = Math.max(180, Math.min(400, e.clientX)) + 'px';
    });
    document.addEventListener('mouseup', () => {
        resizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });
})();


// ═════════════════════════════════════════════════════════════
//  TABS
// ═════════════════════════════════════════════════════════════
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
