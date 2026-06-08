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

let isMentorMode = false;
let isCodeMode = false;
let soundsEnabled = localStorage.getItem('chat_sounds') !== 'false';

const notificationSounds = [
    () => SimpleNotificationSounds.playAttention('short'),
    () => SimpleNotificationSounds.playAttention('medium'),
    () => SimpleNotificationSounds.playSuccess('short'),
    () => SimpleNotificationSounds.playSuccess('medium'),
    () => SimpleNotificationSounds.playAlert('short')
];

function playRandomNotificationSound() {
    if (!soundsEnabled || typeof SimpleNotificationSounds === 'undefined') return;
    const playSound = notificationSounds[Math.floor(Math.random() * notificationSounds.length)];
    playSound();
}

function syncSoundToggle() {
    soundToggle.classList.toggle('muted', !soundsEnabled);
    soundToggle.setAttribute('aria-label', soundsEnabled ? 'Mute notification sounds' : 'Unmute notification sounds');
    soundToggle.title = soundsEnabled ? 'Notification sounds on' : 'Notification sounds off';
}

function isDarkTheme() {
    return document.body.classList.contains('dark-theme');
}

function syncPickerTheme() {
    if (typeof picker !== 'undefined') {
        picker.update({ theme: isDarkTheme() ? 'dark' : 'light' });
    }
}

const urlUsername = new URLSearchParams(window.location.search).get('user');
const defaultUsername = `User-${Math.floor(1000 + Math.random() * 9000)}`;
const lockedUsername = urlUsername || localStorage.getItem('chat_username') || defaultUsername;
localStorage.setItem('chat_username', lockedUsername);
nameInput.value = lockedUsername;
nameInput.title = "Username is locked for this browser";

let currentAvatar = localStorage.getItem(`chat_avatar_${lockedUsername}`) || createAvatarDataUrl(lockedUsername);
setAvatarButton(currentAvatar);

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

// Emoji Picker
const picker = new EmojiMart.Picker({
    theme: isDarkTheme() ? 'dark' : 'light',
    set: 'native',
    onEmojiSelect: (emoji) => {
        messageInput.value += emoji.native;
        messageInput.focus();
        pickerContainer.style.display = 'none'; 
    }
});
pickerContainer.appendChild(picker);
syncPickerTheme();

emojiTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    pickerContainer.style.display = pickerContainer.style.display === 'none' ? 'block' : 'none';
});

document.addEventListener('click', (event) => {
    if (!pickerContainer.contains(event.target) && !emojiTrigger.contains(event.target)) {
        pickerContainer.style.display = 'none';
    }
});

syncSoundToggle();

soundToggle.addEventListener('click', () => {
    soundsEnabled = !soundsEnabled;
    localStorage.setItem('chat_sounds', soundsEnabled ? 'true' : 'false');
    syncSoundToggle();
    if (soundsEnabled) {
        playRandomNotificationSound();
    }
});

// Dark Mode logic
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-theme');
    darkModeToggle.innerHTML = '&#9788;';
    syncPickerTheme();
}

darkModeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    darkModeToggle.innerHTML = isDark ? '&#9788;' : '&#9790;';
    syncPickerTheme();
});

// Typing indicator updated to English
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
    const currentUserName = lockedUsername;
    if (data.isTyping && data.name !== currentUserName) {
        typingIndicator.textContent = `${data.name} is typing...`;
    } else if (!data.isTyping) {
        typingIndicator.textContent = '';
    }
});

// Send message
function sendMessage() {
  const rawText = messageInput.value;
  const text = isCodeMode ? wrapCodeFence(rawText) : rawText;
  if (text.trim() === "") return;
 
  socket.emit('typing', { name: lockedUsername, isTyping: false });
  const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  socket.emit("chat message", {
    id: Date.now() + Math.random().toString(36).substr(2, 9), // Generování unikátního ID zprávy
    name: lockedUsername,
    avatar: currentAvatar,
    text: text,
    time: timeString,
    isMentor: isMentorMode,
    isCode: isCodeMessage(text)
  });
 
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
 
// Receive message - "You" used instead of "Vy"
socket.on("chat history", (history) => {
  if (!Array.isArray(history)) return;
  history.forEach(renderMessage);
});

socket.on("chat message", (data) => {
  renderMessage(data);
  if (soundsEnabled && data.name !== lockedUsername) {
    playRandomNotificationSound();
  }
});

function renderMessage(data) {
  const messageRow = document.createElement("div");
  messageRow.classList.add("message-row");
  
  // Bezpečné přiřazení ID řádku zprávy
  if (data.id) {
    messageRow.setAttribute('data-id', data.id);
  } else {
    const fallbackId = Date.now() + Math.random().toString(36).substr(2, 9);
    data.id = fallbackId;
    messageRow.setAttribute('data-id', fallbackId);
  }

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

  // Tlačítko pro smazání, pokud je zpráva naše
  const deleteButtonHTML = isMe 
    ? `<button class="delete-msg-btn" title="Delete message">&#128465;</button>` 
    : "";

  let headerHTML = `
    <div class="message-header">
      <strong>${escapeHTML(displayName)}</strong>
      ${mentorBadge}
      ${deleteButtonHTML}
    </div>`;

  const codeText = getCodeFenceContent(data.text);
  let contentHTML = data.isCode || codeText !== null
    ? `<div class="code-block-wrapper"><pre><code>${escapeHTML(codeText ?? data.text)}</code></pre></div>`
    : `<div class="message-text">${escapeHTML(data.text)}</div>`;

  const avatarElement = document.createElement("img");
  avatarElement.className = "message-avatar";
  avatarElement.alt = "";
  avatarElement.src = data.avatar || createAvatarDataUrl(data.name || "Anonymous");

  messageElement.innerHTML = `${headerHTML}${contentHTML}<span class="timestamp">${data.time}</span>`;
 
  // Navázání eventu na smazání po kliknutí na koš
// Navázání eventu na smazání po kliknutí na koš (bez potvrzovacího popupu)
if (isMe && data.id) {
  const btn = messageElement.querySelector('.delete-msg-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      socket.emit('delete message', { id: data.id, username: lockedUsername });
    });
  }
}

  // Složení zprávy a vhození do chatu (tohle ti na konci chybělo)
  messageRow.appendChild(avatarElement);
  messageRow.appendChild(messageElement);
  messages.appendChild(messageRow);
  messages.scrollTop = messages.scrollHeight;
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
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

// Přijetí požadavku na smazání od serveru
socket.on("message deleted", (data) => {
    console.log("Smaž zprávu s ID:", data.id); // Tady uvidíš, jestli event dorazil
    const rowToRemove = document.querySelector(`.message-row[data-id="${data.id}"]`);
    
    if (rowToRemove) {
        rowToRemove.remove();
        console.log("Element úspěšně odstraněn z HTML");
    } else {
        console.warn("Element s tímto ID nebyl v HTML nalezen!");
    }
});