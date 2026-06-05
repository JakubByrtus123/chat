const socket = io('192.168.21.86:3000');
 
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
    theme: document.body.classList.contains('dark-theme') ? 'dark' : 'light',
    set: 'native',
    onEmojiSelect: (emoji) => {
        messageInput.value += emoji.native;
        messageInput.focus();
        pickerContainer.style.display = 'none'; 
    }
});
pickerContainer.appendChild(picker);

emojiTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    pickerContainer.style.display = pickerContainer.style.display === 'none' ? 'block' : 'none';
});

document.addEventListener('click', (event) => {
    if (!pickerContainer.contains(event.target) && !emojiTrigger.contains(event.target)) {
        pickerContainer.style.display = 'none';
    }
});

// Dark Mode
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-theme');
    darkModeToggle.textContent = '☀️';
    picker.update({ theme: 'dark' });
}

darkModeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    darkModeToggle.textContent = isDark ? '☀️' : '🌙';
    picker.update({ theme: isDark ? 'dark' : 'light' });
});

// Cache jména
if (localStorage.getItem('chat_username')) {
    nameInput.value = localStorage.getItem('chat_username');
}
nameInput.addEventListener('input', () => {
    localStorage.setItem('chat_username', nameInput.value);
});

// Indikátor psaní
let typingTimeout;
messageInput.addEventListener('input', () => {
    let name = nameInput.value || "Anonymous";
    if (isMentorMode) name += " [Mentor] 🌟";
    socket.emit('typing', { name: name, isTyping: true });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing', { name: name, isTyping: false });
    }, 2000);
});

socket.on('typing', (data) => {
    let currentUserName = nameInput.value || "Anonymous";
    if (isMentorMode) currentUserName += " [Mentor] 🌟";
    
    if (data.isTyping && data.name !== currentUserName) {
        typingIndicator.textContent = `${data.name} is typing...`;
    } else if (!data.isTyping) {
        typingIndicator.textContent = '';
    }
});

// Odeslání zprávy
function sendMessage() {
  const text = messageInput.value;
  if (text.trim() === "") return;
 
  socket.emit('typing', { name: nameInput.value || "Anonymous", isTyping: false });
  const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  socket.emit("chat message", {
    name: nameInput.value || "Anonymous",
    text: text,
    time: timeString,
    isMentor: isMentorMode,
    isCode: isCodeMode
  });
 
  isCodeMode = false;
  codeToggle.classList.remove('active');
  messageInput.value = "";
  messageInput.focus();
}
 
sendButton.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });
 
// Příjem zprávy - TLAČÍTKO COPY JE ZDE KOMPLETNĚ ODSTRANĚNO Z HTML ŠABLONY
socket.on("chat message", (data) => {
  const messageElement = document.createElement("div");
  messageElement.classList.add("message");
  
  const currentUserName = nameInput.value || "Anonymous";
  const isMe = data.name === currentUserName;
  
  if (isMe) messageElement.classList.add("my-message");
  if (data.isMentor) messageElement.classList.add("mentor-message");

  const displayName = isMe ? "Vy" : data.name;
  const mentorBadge = data.isMentor ? `<span class="mentor-tag">Mentor 🌟</span>` : "";

  let headerHTML = `<div class="message-header"><strong>${escapeHTML(displayName)}:</strong>${mentorBadge}</div>`;

  let contentHTML = data.isCode 
    ? `<div class="code-block-wrapper"><pre><code>${escapeHTML(data.text)}</code></pre></div>`
    : `<div class="message-text">${escapeHTML(data.text)}</div>`;

  messageElement.innerHTML = `${headerHTML}${contentHTML}<span class="timestamp">${data.time}</span>`;
 
  messages.appendChild(messageElement);
  messages.scrollTop = messages.scrollHeight;
});

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}