const socket = io();

const messages = document.getElementById("messages");
const nameInput = document.getElementById("name");
const messageInput = document.getElementById("message");
const sendButton = document.getElementById("send");
const typingIndicator = document.getElementById("typing-indicator");
const emojiTrigger = document.getElementById('emoji-trigger');
const pickerContainer = document.getElementById('picker-container');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const soundToggle = document.getElementById('sound-toggle');
const mentorToggle = document.getElementById('mentor-toggle');
const codeToggle = document.getElementById('code-toggle');
const avatarButton = document.getElementById('avatar-button');
const avatarInput = document.getElementById('avatar-input');
const dmRecipientSelect = document.getElementById('dm-recipient');
const dmPicker = document.querySelector('.dm-picker');
const avatarContextMenu = document.getElementById('avatar-context-menu');

let isMentorMode = false;
let isCodeMode = false;
let soundsEnabled = localStorage.getItem('chat_sounds') !== 'false';

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
const channelStore = new Map();
const knownUsers = new Set();
let onlineUsers = new Set();
let dmRecipient = '';
let contextMenuUsername = '';

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

mentorToggle.addEventListener('click', () => {
    isMentorMode = !isMentorMode;
    mentorToggle.classList.toggle('active', isMentorMode);
    messageInput.focus();
});

codeToggle.addEventListener('click', () => {
    isCodeMode = !isCodeMode;
    codeToggle.classList.toggle('active', isCodeMode);
    messageInput.focus();
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
    if (!event.target.closest('.avatar-context-menu')) {
        hideAvatarContextMenu();
    }
});

document.addEventListener('contextmenu', (event) => {
    if (!event.target.closest('.message-avatar') || event.target.closest('.my-message-row')) {
        hideAvatarContextMenu();
    }
});

avatarContextMenu.querySelector('.context-menu-item').addEventListener('click', () => {
    const username = contextMenuUsername;
    hideAvatarContextMenu();
    if (username) startDMWith(username);
});

dmRecipientSelect.addEventListener('change', () => {
    switchToChannel(dmRecipientSelect.value);
    messageInput.focus();
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
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-theme');
    darkModeToggle.innerHTML = '&#9788;';
}

darkModeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    darkModeToggle.innerHTML = isDark ? '&#9788;' : '&#9790;';
});

// Typing indicator
let typingTimeout;
messageInput.addEventListener('input', () => {
    autoResizeMessageInput();
    const typingPayload = { name: lockedUsername, isTyping: true };
    if (dmRecipient) typingPayload.to = dmRecipient;
    socket.emit('typing', typingPayload);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        const stopPayload = { name: lockedUsername, isTyping: false };
        if (dmRecipient) stopPayload.to = dmRecipient;
        socket.emit('typing', stopPayload);
    }, 1500);
});

socket.on('typing', (data) => {
    if (dmRecipient || data.to) return;
    if (data.isTyping && data.name !== lockedUsername) {
        typingIndicator.textContent = `${data.name} is typing...`;
    } else if (!data.isTyping) {
        typingIndicator.textContent = '';
    }
});

socket.on('dm typing', (data) => {
    if (!dmRecipient || data.name !== dmRecipient || data.to !== lockedUsername) return;
    if (data.isTyping) {
        typingIndicator.textContent = `${data.name} is typing...`;
    } else {
        typingIndicator.textContent = '';
    }
});

// Send message
function sendMessage() {
  const rawText = messageInput.value;
  const text = isCodeMode ? wrapCodeFence(rawText) : rawText;
  if (text.trim() === "") return;

  const stopTyping = { name: lockedUsername, isTyping: false };
  if (dmRecipient) stopTyping.to = dmRecipient;
  socket.emit('typing', stopTyping);
  const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const payload = {
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    name: lockedUsername,
    avatar: currentAvatar,
    text: text,
    time: timeString,
    isMentor: isMentorMode,
    isCode: isCodeMessage(text)
  };

  if (dmRecipient) {
    payload.to = dmRecipient;
    socket.emit("direct message", payload);
  } else {
    socket.emit("chat message", payload);
  }

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

socket.on('online users', (users) => {
  if (!Array.isArray(users)) return;
  onlineUsers = new Set(users);
  users.forEach(noteUser);
  updateRecipientOptions();
});

// Receive history
socket.on("chat history", (history) => {
  if (!Array.isArray(history)) return;
  const publicMsgs = history.slice(-MESSAGE_HISTORY_LIMIT);
  channelStore.set('public', [...publicMsgs]);
  publicMsgs.forEach(msg => noteUser(msg.name));
  if (!dmRecipient) {
    clearMessageView();
    publicMsgs.forEach(msg => renderMessage(msg, { scroll: false }));
    messages.scrollTop = messages.scrollHeight;
  }
});

socket.on('dm history', (history) => {
  if (!Array.isArray(history)) return;
  history.slice(-MESSAGE_HISTORY_LIMIT).forEach(msg => {
    noteUser(msg.name);
    noteUser(msg.to);
    addMessageToChannel(msg, determineDMChannelKey(msg));
  });
  if (dmRecipient) {
    switchToChannel(dmRecipient);
  }
});

socket.on("chat message", (data) => {
  addMessageToChannel(data, 'public');
  noteUser(data.name);
  if (!dmRecipient) {
    renderMessage(data);
    if (soundsEnabled && data.name !== lockedUsername) {
      playRandomNotificationSound();
    }
  }
});

socket.on('direct message', (data) => {
  const key = determineDMChannelKey(data);
  addMessageToChannel(data, key);
  noteUser(data.name);
  noteUser(data.to);
  if (activeChannelKey() === key) {
    renderMessage(data);
    if (soundsEnabled && data.name !== lockedUsername) {
      playRandomNotificationSound();
    }
  } else if (soundsEnabled && data.name !== lockedUsername) {
    playRandomNotificationSound();
  }
});

/* ------------------------------------------------------------------
   Direct messages
   ------------------------------------------------------------------ */
function dmChannelKey(otherUser) {
  return `dm:${[lockedUsername, otherUser].sort().join(':')}`;
}

function activeChannelKey() {
  return dmRecipient ? dmChannelKey(dmRecipient) : 'public';
}

function getChannelMessages(key) {
  if (!channelStore.has(key)) {
    channelStore.set(key, []);
  }
  return channelStore.get(key);
}

function addMessageToChannel(data, channelKey) {
  const list = getChannelMessages(channelKey);
  if (list.some(m => m.id === data.id)) return;
  list.push(data);
  while (list.length > MESSAGE_HISTORY_LIMIT) {
    list.shift();
  }
}

function determineDMChannelKey(data) {
  const other = data.name === lockedUsername ? data.to : data.name;
  return dmChannelKey(other);
}

function clearMessageView() {
  messages.innerHTML = '';
  messageDataMap.clear();
}

function updateRecipientOptions() {
  const current = dmRecipient;
  const users = [...knownUsers]
    .filter(name => name !== lockedUsername)
    .sort((a, b) => a.localeCompare(b));

  dmRecipientSelect.innerHTML = '<option value="">Everyone</option>';
  users.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = onlineUsers.has(name) ? `${name} · online` : name;
    dmRecipientSelect.appendChild(option);
  });
  dmRecipientSelect.value = current;
}

function noteUser(name) {
  if (!name || name === lockedUsername) return;
  knownUsers.add(name);
  updateRecipientOptions();
}

function syncDmPicker() {
  dmRecipientSelect.value = dmRecipient;
  if (dmPicker) {
    dmPicker.classList.toggle('dm-active', Boolean(dmRecipient));
  }
}

function showAvatarContextMenu(x, y, username) {
  contextMenuUsername = username;
  avatarContextMenu.hidden = false;
  avatarContextMenu.style.left = `${x}px`;
  avatarContextMenu.style.top = `${y}px`;

  const rect = avatarContextMenu.getBoundingClientRect();
  let left = x;
  let top = y;
  if (left + rect.width > window.innerWidth - 8) {
    left = window.innerWidth - rect.width - 8;
  }
  if (top + rect.height > window.innerHeight - 8) {
    top = window.innerHeight - rect.height - 8;
  }
  avatarContextMenu.style.left = `${left}px`;
  avatarContextMenu.style.top = `${top}px`;
}

function hideAvatarContextMenu() {
  avatarContextMenu.hidden = true;
  contextMenuUsername = '';
}

function updateMessageInputPlaceholder() {
  messageInput.placeholder = dmRecipient
    ? `Private message to ${dmRecipient}`
    : 'Type a message';
}

function switchToChannel(recipient) {
  dmRecipient = recipient || '';
  syncDmPicker();
  updateMessageInputPlaceholder();
  typingIndicator.textContent = '';
  clearMessageView();
  getChannelMessages(activeChannelKey()).forEach(msg => renderMessage(msg, { scroll: false }));
  messages.scrollTop = messages.scrollHeight;
}

function startDMWith(username) {
  if (!username || username === lockedUsername) return;
  switchToChannel(username);
  messageInput.focus();
}

function removeMessageFromChannels(id) {
  channelStore.forEach((list) => {
    const index = list.findIndex(m => m.id === id);
    if (index !== -1) list.splice(index, 1);
  });
}

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
        if (!newText.trim()) return;
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
    const codeText = getCodeFenceContent(data.text);
    const isCode = data.isCode || codeText !== null;
    const contentHTML = isCode || codeText !== null
        ? `<div class="code-block-wrapper"><pre><code>${escapeHTML(codeText ?? data.text)}</code></pre></div>`
        : `<div class="message-text">${escapeHTML(data.text)}</div>`;
    body.innerHTML = contentHTML;
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

  const currentUserName = lockedUsername;
  const isMe = data.name === currentUserName;

  if (isMe) {
    messageRow.classList.add("my-message-row");
    messageElement.classList.add("my-message");
  }
  if (data.isMentor) messageElement.classList.add("mentor-message");

  const displayName = isMe ? "You" : data.name;
  const mentorBadge = data.isMentor ? `<span class="mentor-tag">Mentor &#10022;</span>` : "";

  const editButtonHTML = isMe
    ? `<button class="msg-action-btn edit-msg-btn" title="Edit message">&#9998;</button>`
    : "";
  const deleteButtonHTML = isMe
    ? `<button class="msg-action-btn delete-msg-btn" title="Delete message">&#128465;</button>`
    : "";

  let headerHTML = `
    <div class="message-header">
      <div class="message-header-left">
        <strong>${escapeHTML(displayName)}</strong>
        ${mentorBadge}
      </div>
      <div class="message-actions">
        ${editButtonHTML}
        ${deleteButtonHTML}
      </div>
    </div>`;

  const codeText = getCodeFenceContent(data.text);
  let contentHTML = data.isCode || codeText !== null
    ? `<div class="code-block-wrapper"><pre><code>${escapeHTML(codeText ?? data.text)}</code></pre></div>`
    : `<div class="message-text">${escapeHTML(data.text)}</div>`;

  const editedHTML = data.edited
    ? `<span class="edited-tag" title="${data.editedAt || ''}">edited ${formatTime(data.editedAt)}</span>`
    : '';

  messageElement.innerHTML = `
    ${headerHTML}
    <div class="message-body">${contentHTML}</div>
    <div class="message-footer">
      <div class="message-meta">${editedHTML}<span class="timestamp">${data.time}</span></div>
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

  const avatarElement = document.createElement("img");
  avatarElement.className = "message-avatar";
  avatarElement.alt = "";
  avatarElement.src = data.avatar || createAvatarDataUrl(data.name || "Anonymous");
  if (!isMe) {
    avatarElement.title = "Right-click for direct message";
    avatarElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showAvatarContextMenu(e.clientX, e.clientY, data.name);
    });
  }

  messageRow.appendChild(avatarElement);
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
        const newContent = isCode
            ? `<div class="code-block-wrapper"><pre><code>${escapeHTML(codeText ?? data.text)}</code></pre></div>`
            : `<div class="message-text">${escapeHTML(data.text)}</div>`;
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

// Real-time reaction sync — ONLY replaces innerHTML, listener from renderMessage persists
socket.on('message reactions', (data) => {
    const row = document.querySelector(`.message-row[data-id="${data.id}"]`);
    if (!row) return;

    const reactionsBar = row.querySelector('.reactions-bar');
    if (!reactionsBar) return;

    reactionsBar.innerHTML = buildReactionsInnerHTML(data.reactions);
    // NO new addEventListener here — the one attached in renderMessage is still active
});

socket.on('dm edited', (data) => {
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
        const newContent = isCode
            ? `<div class="code-block-wrapper"><pre><code>${escapeHTML(codeText ?? data.text)}</code></pre></div>`
            : `<div class="message-text">${escapeHTML(data.text)}</div>`;
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

socket.on('dm reactions', (data) => {
    const row = document.querySelector(`.message-row[data-id="${data.id}"]`);
    if (!row) return;

    const reactionsBar = row.querySelector('.reactions-bar');
    if (!reactionsBar) return;

    reactionsBar.innerHTML = buildReactionsInnerHTML(data.reactions);
});

socket.on('dm deleted', (data) => {
    removeMessageFromChannels(data.id);
    messageDataMap.delete(data.id);
    const rowToRemove = document.querySelector(`.message-row[data-id="${data.id}"]`);
    if (rowToRemove) {
        rowToRemove.remove();
    }
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

syncDmPicker();
updateMessageInputPlaceholder();
autoResizeMessageInput();

socket.on("message deleted", (data) => {
    removeMessageFromChannels(data.id);
    messageDataMap.delete(data.id);
    const rowToRemove = document.querySelector(`.message-row[data-id="${data.id}"]`);
    if (rowToRemove) {
        rowToRemove.remove();
    }
});