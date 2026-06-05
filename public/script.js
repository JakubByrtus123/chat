const socket = io('192.168.21.86:3000');
// const socket = io();
// pokud chci aby to byl i local host

const messages = document.getElementById("messages");
const nameInput = document.getElementById("name");
const messageInput = document.getElementById("message");
const sendButton = document.getElementById("send");
const typingIndicator = document.getElementById("typing-indicator");
const emojiTrigger = document.getElementById('emoji-trigger');
const pickerContainer = document.getElementById('picker-container');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const mentorToggle = document.getElementById('mentor-toggle');
const codeToggle = document.getElementById('code-toggle');

let isMentorMode = false;
let isCodeMode = false;

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
    name: lockedUsername,
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
socket.on("chat message", (data) => {
  const messageElement = document.createElement("div");
  messageElement.classList.add("message");
  
  const currentUserName = lockedUsername;
  const isMe = data.name === currentUserName;
  
  if (isMe) messageElement.classList.add("my-message");
  if (data.isMentor) messageElement.classList.add("mentor-message");

  const displayName = isMe ? "You" : data.name;
  const mentorBadge = data.isMentor ? `<span class="mentor-tag">Mentor &#10022;</span>` : "";

  let headerHTML = `<div class="message-header"><strong>${escapeHTML(displayName)}</strong>${mentorBadge}</div>`;

  const codeText = getCodeFenceContent(data.text);
  let contentHTML = data.isCode || codeText !== null
    ? `<div class="code-block-wrapper"><pre><code>${escapeHTML(codeText ?? data.text)}</code></pre></div>`
    : `<div class="message-text">${escapeHTML(data.text)}</div>`;

  messageElement.innerHTML = `${headerHTML}${contentHTML}<span class="timestamp">${data.time}</span>`;
 
  messages.appendChild(messageElement);
  messages.scrollTop = messages.scrollHeight;
});

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

autoResizeMessageInput();
