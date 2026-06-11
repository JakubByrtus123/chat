const socket = io();

const messages = document.getElementById("messages");
const nameInput = document.getElementById("name");
const messageInput = document.getElementById("message");
const sendButton = document.getElementById("send");
const typingIndicator = document.getElementById("typing-indicator");
const emojiTrigger = document.getElementById('emoji-trigger');
const pickerContainer = document.getElementById('picker-container');
// const darkModeToggle = document.getElementById('dark-mode-toggle');
const soundToggle = document.getElementById('sound-toggle');
const codeToggle = document.getElementById('code-toggle');
const avatarButton = document.getElementById('avatar-button');
const avatarInput = document.getElementById('avatar-input');
const fileTrigger = document.getElementById('file-trigger');
const fileInput = document.getElementById('file-input');
const attachmentChip = document.getElementById('attachment-chip');
const attachmentName = document.getElementById('attachment-name');
const attachmentClear = document.getElementById('attachment-clear');

let isCodeMode = false;
let soundsEnabled = localStorage.getItem('chat_sounds') !== 'false';
let pendingAttachment = null;
let lastSendTime = 0;
const RATE_LIMIT_MS = 1500;

let SimpleNotificationSounds = null;
let soundLibraryLoaded = false;

function loadSoundLibrary() {
    if (soundLibraryLoaded) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/simple-notification-sounds@1.0.0/dist/simple-notification-sounds.umd.js';
        script.onload = () => {
            SimpleNotificationSounds = window.SimpleNotificationSounds;
            soundLibraryLoaded = true;
            resolve();
        };
        script.onerror = () => {
            soundLibraryLoaded = true;
            reject();
        };
        document.head.appendChild(script);
    });
}

const notificationSoundConfigs = [
    { method: 'playAttention', duration: 'short' },
    { method: 'playAttention', duration: 'medium' },
    { method: 'playSuccess', duration: 'short' },
    { method: 'playSuccess', duration: 'medium' },
    { method: 'playAlert', duration: 'short' }
];

function playRandomNotificationSound() {
    if (!soundsEnabled) return;
    loadSoundLibrary().then(() => {
        if (!SimpleNotificationSounds) return;
        const cfg = notificationSoundConfigs[Math.floor(Math.random() * notificationSoundConfigs.length)];
        SimpleNotificationSounds[cfg.method](cfg.duration);
    }).catch(() => {});
}

function syncSoundToggle() {
    if (!soundToggle) return;
    soundToggle.classList.toggle('muted', !soundsEnabled);
    soundToggle.setAttribute('aria-label', soundsEnabled ? 'Mute notification sounds' : 'Unmute notification sounds');
    soundToggle.title = soundsEnabled ? 'Notification sounds on' : 'Notification sounds off';
}

function isDarkTheme() {
    return document.body.classList.contains('dark-theme');
}

const urlUsername = new URLSearchParams(window.location.search).get('user');
const defaultUsername = `User-${Math.floor(1000 + Math.random() * 9000)}`;
const lockedUsername = urlUsername || localStorage.getItem('chat_username') || defaultUsername;
localStorage.setItem('chat_username', lockedUsername);
nameInput.value = lockedUsername;
nameInput.title = "Username is locked for this browser";

let currentAvatar = localStorage.getItem(`chat_avatar_${lockedUsername}`) || createAvatarDataUrl(lockedUsername);
setAvatarButton(currentAvatar);

const MESSAGE_HISTORY_LIMIT = 267;
const messageDataMap = new Map();

function applyAvatar(avatar) {
    currentAvatar = avatar;
    localStorage.setItem(`chat_avatar_${lockedUsername}`, currentAvatar);
    setAvatarButton(currentAvatar);
}

function saveAvatar(avatar) {
    applyAvatar(avatar);
    socket.emit('update avatar', { username: lockedUsername, avatar: currentAvatar });
}

function isCustomAvatar(src) {
    return typeof src === 'string' && src.startsWith('data:image/') && !src.startsWith('data:image/svg');
}

socket.on('connect', () => {
    socket.emit('join', { username: lockedUsername });
    socket.emit('get avatar', { username: lockedUsername });
});

socket.on('user avatar', (data) => {
    if (!data || data.username !== lockedUsername) return;
    if (data.avatar) {
        applyAvatar(data.avatar);
    } else if (isCustomAvatar(currentAvatar)) {
        socket.emit('update avatar', { username: lockedUsername, avatar: currentAvatar });
    }
});

avatarButton.addEventListener('click', () => {
    avatarInput.click();
});

avatarInput.addEventListener('change', () => {
    const file = avatarInput.files && avatarInput.files[0];
    if (!file) return;

    resizeAvatarFile(file).then((avatarDataUrl) => {
        saveAvatar(avatarDataUrl);
    }).catch(() => {
        alert("Avatar image could not be loaded.");
    });
    avatarInput.value = "";
});

codeToggle.addEventListener('click', () => {
    isCodeMode = !isCodeMode;
    codeToggle.classList.toggle('active', isCodeMode);
    messageInput.focus();
});

/* ------------------------------------------------------------------
   File attachments
   ------------------------------------------------------------------ */
fileTrigger.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert("File is too large. Max 5MB.");
        fileInput.value = "";
        return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
        pendingAttachment = {
            name: file.name,
            type: file.type,
            size: file.size,
            data: reader.result
        };
        attachmentName.textContent = file.name;
        attachmentChip.style.display = 'inline-flex';
    });
    reader.readAsDataURL(file);
    fileInput.value = "";
});

attachmentClear.addEventListener('click', () => {
    pendingAttachment = null;
    attachmentChip.style.display = 'none';
});

/* ------------------------------------------------------------------
   Emoji Picker
   ------------------------------------------------------------------ */
let picker = null;

emojiTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!picker) return;
    pickerContainer.style.display = pickerContainer.style.display === 'none' ? 'block' : 'none';
});

document.addEventListener('click', (event) => {
    if (!pickerContainer.contains(event.target) && !emojiTrigger.contains(event.target)) {
        pickerContainer.style.display = 'none';
    }
    if (!event.target.closest('.reactions-bar')) {
        document.querySelectorAll('.reaction-picker-mini').forEach(p => p.style.display = 'none');
    }
});

async function loadEmojiPicker() {
    const sources = [
        'https://esm.sh/emoji-picker-element@1',
        'https://cdn.jsdelivr.net/npm/emoji-picker-element@1/dist/index.js',
        'https://unpkg.com/emoji-picker-element@1/dist/index.js'
    ];

    for (const src of sources) {
        try {
            await import(src);
            if (customElements.get('emoji-picker')) {
                initPicker();
                return;
            }
        } catch (e) {
            console.warn(`Emoji picker source failed: ${src}`, e);
        }
    }
    console.error('All emoji picker sources failed');
}

function initPicker() {
    picker = document.createElement('emoji-picker');
    picker.setAttribute('locale', 'en');
    picker.addEventListener('emoji-click', (event) => {
        messageInput.value += event.detail.unicode;
        messageInput.focus();
        pickerContainer.style.display = 'none';
    });
    pickerContainer.appendChild(picker);
}

loadEmojiPicker();

syncSoundToggle();

soundToggle.addEventListener('click', () => {
    soundsEnabled = !soundsEnabled;
    localStorage.setItem('chat_sounds', soundsEnabled ? 'true' : 'false');
    syncSoundToggle();
    if (soundsEnabled) {
        playRandomNotificationSound();
    }
});

// Dark Mode
// if (localStorage.getItem('theme') === 'dark') {
//     document.body.classList.add('dark-theme');
//     darkModeToggle.innerHTML = '&#9788;';
// }

// darkModeToggle.addEventListener('click', () => {
//     document.body.classList.toggle('dark-theme');
//     const isDark = document.body.classList.contains('dark-theme');
//     localStorage.setItem('theme', isDark ? 'dark' : 'light');
//     darkModeToggle.innerHTML = isDark ? '&#9788;' : '&#9790;';
// });

// Typing indicator
let typingTimeout;
messageInput.addEventListener('input', () => {
    autoResizeMessageInput();
    socket.emit('typing', { name: lockedUsername, isTyping: true });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing', { name: lockedUsername, isTyping: false });
    }, 1500);
});

socket.on('typing', (data) => {
    if (data.isTyping && data.name !== lockedUsername) {
        typingIndicator.textContent = `${data.name} is typing...`;
    } else if (!data.isTyping) {
        typingIndicator.textContent = '';
    }
});

// Send message
function sendMessage() {
    const now = Date.now();
    if (now - lastSendTime < RATE_LIMIT_MS) {
        alert("Please wait a moment before sending another message.");
        return;
    }

    const rawText = messageInput.value;
    const text = isCodeMode ? wrapCodeFence(rawText) : rawText;
    if (text.trim() === "" && !pendingAttachment) return;
    if (text.length > 1000) {
        alert("Message too long. Max 1000 characters.");
        return;
    }

    lastSendTime = now;
    socket.emit('typing', { name: lockedUsername, isTyping: false });

    const nowDate = new Date();
    const timeString = nowDate.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    const payload = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        name: lockedUsername,
        avatar: currentAvatar,
        text: text,
        time: timeString,
        isCode: isCodeMessage(text)
    };

    if (pendingAttachment) {
        payload.file = pendingAttachment;
        pendingAttachment = null;
        attachmentChip.style.display = 'none';
    }

    socket.emit("chat message", payload);

    isCodeMode = false;
    codeToggle.classList.remove('active');
    messageInput.value = "";
    autoResizeMessageInput();
    messageInput.focus();
}

sendButton.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Receive history
socket.on("chat history", (history) => {
    if (!Array.isArray(history)) return;
    messages.innerHTML = '';
    messageDataMap.clear();
    history.slice(-MESSAGE_HISTORY_LIMIT).forEach(msg => renderMessage(msg, { scroll: false }));
    messages.scrollTop = messages.scrollHeight;
});

socket.on("chat message", (data) => {
    renderMessage(data);
    if (soundsEnabled && data.name !== lockedUsername) {
        playRandomNotificationSound();
    }
});

socket.on('error message', (msg) => {
    alert(msg);
});

/* ------------------------------------------------------------------
   Helpers
   ------------------------------------------------------------------ */
function formatTime(isoString) {
    if (!isoString) return '';
    try {
        const d = new Date(isoString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '';
    }
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/* ------------------------------------------------------------------
   Reactions
   ------------------------------------------------------------------ */
function buildReactionsInnerHTML(reactions) {
    return Object.entries(reactions || {}).map(([emoji, users]) => {
        const count = users.length;
        const hasReacted = users.includes(lockedUsername);
        return `<button class="reaction-pill ${hasReacted ? 'reacted' : ''}" data-emoji="${emoji}" title="${users.join(', ')}">
            <span class="reaction-emoji">${emoji}</span>
            <span class="reaction-count">${count}</span>
        </button>`;
    }).join('') + `
        <button class="add-reaction-btn" title="Add reaction">+</button>
        <div class="reaction-picker-mini" style="display:none">
            <button data-emoji="👍">👍</button>
            <button data-emoji="❤️">❤️</button>
            <button data-emoji="😂">😂</button>
            <button data-emoji="😮">😮</button>
            <button data-emoji="🎉">🎉</button>
        </div>`;
}

function handleReactionClick(e, messageId) {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.classList.contains('reaction-pill')) {
        const emoji = btn.dataset.emoji;
        socket.emit('reaction', { messageId, emoji, username: lockedUsername });
    } else if (btn.classList.contains('add-reaction-btn')) {
        const picker = btn.parentElement.querySelector('.reaction-picker-mini');
        const isHidden = picker.style.display === 'none' || !picker.style.display;
        document.querySelectorAll('.reaction-picker-mini').forEach(p => p.style.display = 'none');
        picker.style.display = isHidden ? 'flex' : 'none';
    } else if (btn.parentElement && btn.parentElement.classList.contains('reaction-picker-mini')) {
        const emoji = btn.dataset.emoji;
        socket.emit('reaction', { messageId, emoji, username: lockedUsername });
        btn.parentElement.style.display = 'none';
    }
}

/* ------------------------------------------------------------------
   Edit
   ------------------------------------------------------------------ */
function startEdit(messageElement, data) {
    const body = messageElement.querySelector('.message-body');
    const isCode = data.isCode || getCodeFenceContent(data.text) !== null;
    const editText = isCode ? (getCodeFenceContent(data.text) ?? data.text) : data.text;

    body.innerHTML = `
        <div class="edit-area">
            <textarea class="edit-textarea" rows="2">${escapeHTML(editText)}</textarea>
            <div class="edit-actions">
                <button class="edit-save-btn">Save</button>
                <button class="edit-cancel-btn">Cancel</button>
            </div>
        </div>
    `;

    const textarea = body.querySelector('.edit-textarea');
    textarea.focus();

    body.querySelector('.edit-save-btn').addEventListener('click', () => {
        const newText = textarea.value;
        if (!newText.trim() && !data.file) return;
        const finalText = isCode ? wrapCodeFence(newText) : newText;

        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const cached = messageDataMap.get(data.id);
        if (cached) {
            cached.text = finalText;
            cached.edited = true;
            cached.editedAt = now.toISOString();
        }
        restoreMessageBody(body, cached || { ...data, text: finalText, edited: true, editedAt: now.toISOString() });

        const meta = messageElement.querySelector('.message-meta');
        if (meta) {
            let editedTag = meta.querySelector('.edited-tag');
            if (!editedTag) {
                editedTag = document.createElement('span');
                editedTag.className = 'edited-tag';
                const ts = meta.querySelector('.timestamp');
                if (ts) meta.insertBefore(editedTag, ts);
                else meta.appendChild(editedTag);
            }
            editedTag.textContent = `edited ${timeStr}`;
            editedTag.title = now.toISOString();
        }

        socket.emit('edit message', { id: data.id, text: finalText, username: lockedUsername });
    });

    body.querySelector('.edit-cancel-btn').addEventListener('click', () => {
        restoreMessageBody(body, data);
    });
}

function restoreMessageBody(body, data) {
    let html = '';
    const codeText = getCodeFenceContent(data.text);
    const isCode = data.isCode || codeText !== null;
    if (isCode || codeText !== null) {
        html += `<div class="code-block-wrapper"><pre><code>${escapeHTML(codeText ?? data.text)}</code></pre></div>`;
    } else if (data.text) {
        html += `<div class="message-text">${escapeHTML(data.text)}</div>`;
    }
    if (data.file) {
        html += renderAttachment(data.file);
    }
    body.innerHTML = html;
}

/* ------------------------------------------------------------------
   Render
   ------------------------------------------------------------------ */
function trimOldMessages() {
  while (messages.children.length > MESSAGE_HISTORY_LIMIT) {
    const oldest = messages.firstElementChild;
    if (!oldest) break;
    const id = oldest.getAttribute('data-id');
    if (id) messageDataMap.delete(id);
    oldest.remove();
  }
}

function renderAttachment(file) {
    if (!file || !file.url) return '';
    if (file.type && file.type.startsWith('image/')) {
        return `<div class="attachment-preview"><img src="${escapeHTML(file.url)}" alt="${escapeHTML(file.name)}" loading="lazy"></div>`;
    }
    if (file.type && file.type.startsWith('video/')) {
        return `<div class="attachment-preview"><video src="${escapeHTML(file.url)}" controls preload="metadata" style="max-width:100%;max-height:300px;border-radius:6px;display:block;"></video></div>`;
    }
    const size = formatBytes(file.size);
    return `<a class="file-attachment" href="${escapeHTML(file.url)}" download="${escapeHTML(file.name)}" target="_blank">
        <span class="file-icon">&#128196;</span>
        <div class="file-info">
            <span class="file-name">${escapeHTML(file.name)}</span>
            <span class="file-size">${size}</span>
        </div>
    </a>`;
}

function renderMessage(data, options = {}) {
  const { scroll = true } = options;
  const messageRow = document.createElement("div");
  messageRow.classList.add("message-row");

  if (data.id) {
    messageRow.setAttribute('data-id', data.id);
  } else {
    const fallbackId = Date.now() + Math.random().toString(36).substr(2, 9);
    data.id = fallbackId;
    messageRow.setAttribute('data-id', fallbackId);
  }

  messageDataMap.set(data.id, data);

  const messageElement = document.createElement("div");
  messageElement.classList.add("message");

  const isMe = data.name === lockedUsername;

  if (isMe) {
    messageRow.classList.add("my-message-row");
    messageElement.classList.add("my-message");
  }

  const displayName = isMe ? "You" : data.name;

  const editButtonHTML = isMe
    ? `<button class="msg-action-btn edit-msg-btn" title="Edit message">&#9998;</button>`
    : "";
  const deleteButtonHTML = isMe
    ? `<button class="msg-action-btn delete-msg-btn" title="Delete message">&#128465;</button>`
    : "";

  let headerHTML = `
    <div class="message-header">
      <div class="message-header-left">
        <img class="message-header-avatar" src="${escapeHTML(data.avatar || createAvatarDataUrl(data.name || 'Anonymous'))}" alt="">
        <strong>${escapeHTML(displayName)}</strong>
        <span class="timestamp-inline">${data.time}</span>
      </div>
      <div class="message-actions">
        ${editButtonHTML}
        ${deleteButtonHTML}
      </div>
    </div>`;

  let contentHTML = '';
  const codeText = getCodeFenceContent(data.text);
  if (data.isCode || codeText !== null) {
    contentHTML += `<div class="code-block-wrapper"><pre><code>${escapeHTML(codeText ?? data.text)}</code></pre></div>`;
  } else if (data.text) {
    contentHTML += `<div class="message-text">${escapeHTML(data.text)}</div>`;
  }
  if (data.file) {
    contentHTML += renderAttachment(data.file);
  }

  const editedHTML = data.edited
    ? `<span class="edited-tag" title="${data.editedAt || ''}">edited ${formatTime(data.editedAt)}</span>`
    : '';

  messageElement.innerHTML = `
    ${headerHTML}
    <div class="message-body">${contentHTML}</div>
    <div class="message-footer">
      ${editedHTML ? `<div class="message-meta">${editedHTML}</div>` : ''}
      <div class="reactions-bar" data-id="${data.id}">
        ${buildReactionsInnerHTML(data.reactions)}
      </div>
    </div>
  `;

  if (isMe && data.id) {
    const editBtn = messageElement.querySelector('.edit-msg-btn');
    const deleteBtn = messageElement.querySelector('.delete-msg-btn');
    if (editBtn) editBtn.addEventListener('click', () => startEdit(messageElement, messageDataMap.get(data.id)));
    if (deleteBtn) deleteBtn.addEventListener('click', () => {
      socket.emit('delete message', { id: data.id, username: lockedUsername });
    });
  }

  const reactionsBar = messageElement.querySelector('.reactions-bar');
  if (reactionsBar) {
    reactionsBar.addEventListener('click', (e) => handleReactionClick(e, data.id));
  }

  messageRow.appendChild(messageElement);
  messages.appendChild(messageRow);
  trimOldMessages();
  if (scroll) {
    messages.scrollTop = messages.scrollHeight;
  }
}

// Real-time edit sync
socket.on('message edited', (data) => {
    const cached = messageDataMap.get(data.id);
    if (cached) {
        cached.text = data.text;
        cached.edited = true;
        cached.editedAt = data.editedAt;
        if (data.isCode !== undefined) cached.isCode = data.isCode;
    }

    const row = document.querySelector(`.message-row[data-id="${data.id}"]`);
    if (!row) return;

    const msg = row.querySelector('.message');
    const body = msg.querySelector('.message-body');
    const meta = msg.querySelector('.message-meta');

    if (body) {
        const codeText = getCodeFenceContent(data.text);
        const isCode = data.isCode || codeText !== null;
        let newContent = '';
        if (isCode) {
            newContent += `<div class="code-block-wrapper"><pre><code>${escapeHTML(codeText ?? data.text)}</code></pre></div>`;
        } else if (data.text) {
            newContent += `<div class="message-text">${escapeHTML(data.text)}</div>`;
        }
        const cachedFile = cached && cached.file;
        if (cachedFile) {
            newContent += renderAttachment(cachedFile);
        }
        body.innerHTML = newContent;
    }

    if (meta) {
        let editedTag = meta.querySelector('.edited-tag');
        if (!editedTag) {
            editedTag = document.createElement('span');
            editedTag.className = 'edited-tag';
            const ts = meta.querySelector('.timestamp');
            if (ts) meta.insertBefore(editedTag, ts);
            else meta.appendChild(editedTag);
        }
        editedTag.textContent = `edited ${formatTime(data.editedAt)}`;
        editedTag.title = data.editedAt || '';
    }
});

// Real-time reaction sync
socket.on('message reactions', (data) => {
    const row = document.querySelector(`.message-row[data-id="${data.id}"]`);
    if (!row) return;

    const reactionsBar = row.querySelector('.reactions-bar');
    if (!reactionsBar) return;

    reactionsBar.innerHTML = buildReactionsInnerHTML(data.reactions);
});

function escapeHTML(str) {
    return str.replace(/[&<<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

function wrapCodeFence(text) {
    const trimmed = text.trim();
    if (isCodeMessage(trimmed)) return trimmed;
    return `\`\`\`\n${text}\n\`\`\``;
}

function isCodeMessage(text) {
    return /^```[\s\S]*```$/.test(text.trim());
}

function getCodeFenceContent(text) {
    const match = text.trim().match(/^```(?:\w+)?\n?([\s\S]*?)\n?```$/);
    return match ? match[1] : null;
}

function autoResizeMessageInput() {
    messageInput.scrollTop = messageInput.scrollHeight;
}

function setAvatarButton(src) {
    avatarButton.style.backgroundImage = `url("${src}")`;
}

function createAvatarDataUrl(name) {
    const palettes = [
        ["#2543dd", "#22c55e"],
        ["#ef476f", "#ffd166"],
        ["#7c3aed", "#38bdf8"],
        ["#f97316", "#14b8a6"],
        ["#0f172a", "#f43f5e"]
    ];
    const hash = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
    const [bg, fg] = palettes[hash % palettes.length];
    const initials = name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part[0])
        .join("")
        .toUpperCase() || "?";
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
            <rect width="96" height="96" rx="20" fill="${bg}"/>
            <circle cx="76" cy="20" r="18" fill="${fg}" opacity="0.9"/>
            <circle cx="18" cy="78" r="22" fill="${fg}" opacity="0.35"/>
            <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle"
                font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#fff">${escapeHTML(initials)}</text>
        </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function resizeAvatarFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('error', reject);
        reader.addEventListener('load', () => {
            const image = new Image();
            image.addEventListener('error', reject);
            image.addEventListener('load', () => {
                const size = 160;
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                const side = Math.min(image.width, image.height);
                const sx = (image.width - side) / 2;
                const sy = (image.height - side) / 2;

                canvas.width = size;
                canvas.height = size;
                context.drawImage(image, sx, sy, side, side, 0, 0, size, size);
                resolve(canvas.toDataURL('image/jpeg', 0.82));
            });
            image.src = reader.result;
        });
        reader.readAsDataURL(file);
    });
}

autoResizeMessageInput();

socket.on("message deleted", (data) => {
    messageDataMap.delete(data.id);
    const rowToRemove = document.querySelector(`.message-row[data-id="${data.id}"]`);
    if (rowToRemove) {
        rowToRemove.remove();
    }
});