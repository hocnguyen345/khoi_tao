/**
 * script.js — KR Client Widget
 * Kết nối tới server cloud qua SocketIO.
 * Nhận room_id + server_url từ /config (do main.py inject).
 */

"use strict";

// ─── State ─────────────────────────────────────────────────────────────────
let socket      = null;
let roomId      = null;
let serverUrl   = null;
let connected   = false;
let reconnectTimer     = null;
let reconnectAttempts  = 0;
const MAX_RECONNECT_MS = 30000;

// ─── DOM refs ──────────────────────────────────────────────────────────────
const statusDot    = document.getElementById("status-dot");
const roomLabel    = document.getElementById("room-label");
const chatMessages = document.getElementById("chat-messages");
const chatInput    = document.getElementById("chat-input");
const btnSend      = document.getElementById("btn-send");
const btnClose     = document.getElementById("btn-close");
const answersList  = document.getElementById("answers-list");
const toast        = document.getElementById("toast");
const tabs         = document.querySelectorAll(".tab");
const panels       = document.querySelectorAll(".panel");

// ─── Toast ─────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, duration = 2200) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
}

// ─── Tabs ──────────────────────────────────────────────────────────────────
tabs.forEach(tab => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));

document.body.addEventListener("auxclick", e => {
  if (e.button === 1) {
    const active = document.querySelector(".tab.active");
    const next   = active?.nextElementSibling || document.querySelector(".tab");
    if (next) switchTab(next.dataset.tab);
  }
});

function switchTab(name) {
  tabs.forEach(t   => t.classList.toggle("active",   t.dataset.tab === name));
  panels.forEach(p => p.classList.toggle("active",   p.id === `panel-${name}`));
}

// ─── Connection Status ─────────────────────────────────────────────────────
function setConnected(ok) {
  connected = ok;
  statusDot.classList.toggle("ok", ok);
  roomLabel.textContent = ok ? (roomId || "Online") : "Offline";
}

// ─── SocketIO ──────────────────────────────────────────────────────────────
function loadSocketIO(callback) {
  if (typeof io !== "undefined") { callback(); return; }
  const s = document.createElement("script");
  s.src = `${serverUrl}/socket.io/socket.io.js`;
  s.onload  = callback;
  s.onerror = () => {
    // Fallback: thử CDN
    const fb = document.createElement("script");
    fb.src = "https://cdn.socket.io/4.7.4/socket.io.min.js";
    fb.onload  = callback;
    fb.onerror = () => {
      addSystemMsg("❌ Không tải được socket.io — thử lại sau 5s...");
      setTimeout(() => loadSocketIO(callback), 5000);
    };
    document.head.appendChild(fb);
  };
  document.head.appendChild(s);
}

function connectSocket() {
  if (socket) {
    try { socket.disconnect(); } catch(_) {}
  }

  socket = io(serverUrl, {
    transports:    ["websocket", "polling"],
    reconnection:  false,
    timeout:       6000,
  });

  socket.on("connect", () => {
    reconnectAttempts = 0;
    clearTimeout(reconnectTimer);
    setConnected(true);
    addSystemMsg("✅ Kết nối thành công");
    if (roomId) socket.emit("join_client", { room: roomId });
  });

  socket.on("disconnect", () => {
    setConnected(false);
    addSystemMsg("⚠️ Mất kết nối — đang thử lại...");
    scheduleReconnect();
  });

  socket.on("connect_error", () => {
    setConnected(false);
    scheduleReconnect();
  });

  // ── Sự kiện từ server ──────────────────────────────────────────────────
  socket.on("connected", data => {
    roomId = data.room;
    setConnected(true);
    roomLabel.textContent = roomId;
    addSystemMsg(`🔑 Room: ${roomId}`);
  });

  socket.on("chat_message", data => {
    const sender = data.from || "support";
    const text   = data.text || "";
    if (!text) return;
    addChatMsg(sender === "client" ? "me" : "them", text, sender);
    if (sender !== "client") showToast("💬 Tin nhắn mới từ support");
  });

  socket.on("receive_answer", data => {
    const answer = data.answer || "";
    if (!answer) return;
    addAnswerCard("Đáp án mới", answer);
    switchTab("answers");
    showToast("📋 Nhận đáp án!");
  });

  socket.on("receive_file", data => {
    const { filename, url } = data;
    const fullUrl = url?.startsWith("http") ? url : serverUrl + url;
    addSystemMsg(`📁 File từ support: <a href="${fullUrl}" target="_blank">${escapeHtml(filename)}</a>`);
    showToast(`📁 Nhận file: ${filename}`);
  });

  socket.on("screenshot", data => {
    addSystemMsg(`📸 Screenshot đã lưu: ${data.server_filename || ""}`);
  });
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(1.6, reconnectAttempts), MAX_RECONNECT_MS);
  reconnectTimer = setTimeout(connectSocket, delay);
}

// ─── Chat ──────────────────────────────────────────────────────────────────
function addSystemMsg(html) {
  const div = document.createElement("div");
  div.className = "msg-system";
  div.innerHTML = html;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addChatMsg(side, text, senderLabel) {
  const div = document.createElement("div");
  div.className = `msg ${side}`;
  if (senderLabel && side === "them") {
    const s = document.createElement("div");
    s.className = "sender";
    s.textContent = senderLabel;
    div.appendChild(s);
  }
  const t = document.createElement("div");
  t.textContent = text;
  div.appendChild(t);
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  if (!connected || !socket || !roomId) {
    showToast("⚠️ Chưa kết nối server");
    return;
  }
  socket.emit("client_message", { room: roomId, text });
  addChatMsg("me", text);
  chatInput.value = "";
  chatInput.style.height = "34px";
}

btnSend.addEventListener("click", sendChat);
chatInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
chatInput.addEventListener("input", () => {
  chatInput.style.height = "34px";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 80) + "px";
});

// ─── Answers ───────────────────────────────────────────────────────────────
function addAnswerCard(question, answer) {
  const empty = answersList.querySelector(".answers-empty");
  if (empty) empty.remove();

  const card = document.createElement("div");
  card.className = "answer-card";
  card.innerHTML = `
    <div class="q">${escapeHtml(question)}</div>
    <div class="a">${escapeHtml(answer)}</div>
    <span class="copy-hint">Copy ▸</span>
  `;
  card.addEventListener("click", () => {
    navigator.clipboard?.writeText(answer).then(() => showToast("✅ Đã copy!"));
  });
  answersList.appendChild(card);
  answersList.scrollTop = answersList.scrollHeight;
}

function escapeHtml(t) {
  return String(t)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ─── Close ─────────────────────────────────────────────────────────────────
btnClose.addEventListener("click", () => window.close());

// ─── Khởi động ─────────────────────────────────────────────────────────────
async function init() {
  addSystemMsg("🚀 Đang khởi động...");

  // 1. Lấy config từ main.py (room_id + server_url)
  try {
    const res = await fetch("/config");
    if (res.ok) {
      const cfg = await res.json();
      serverUrl = cfg.server_url || window.location.origin;
      roomId    = cfg.room_id   || null;
      addSystemMsg(`🔗 Server: ${serverUrl}`);
      if (roomId) addSystemMsg(`🔑 Room: ${roomId}`);
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (e) {
    serverUrl = window.location.origin;
    addSystemMsg(`⚠️ Không lấy được config: ${e.message}`);
  }

  // 2. Load socket.io rồi kết nối
  loadSocketIO(connectSocket);
}

document.addEventListener("DOMContentLoaded", init);
