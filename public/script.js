const socket = io('192.168.21.86:3000');
 
const messages = document.getElementById("messages");
const nameInput = document.getElementById("name");
const messageInput = document.getElementById("message");
const sendButton = document.getElementById("send");
const typingIndicator = document.getElementById("typing-indicator");

const emojiTrigger = document.getElementById('emoji-trigger');
const pickerContainer = document.getElementById('picker-container');

const darkModeToggle = document.getElementById('dark-mode-toggle');

// Funkce, která vrátí správný motiv pro Emoji Mart picker
function getPickerTheme() {
    return document.body.classList.contains('dark-theme') ? 'dark' : 'light';
}

// INICIALIZACE NOVÉHO, RYCHLÉHO EMOJI MART PICKERU
const pickerOptions = {
    theme: getPickerTheme(),
    set: 'native', // Použije nativní emoji operačního systému (extrémně rychlé)
    onEmojiSelect: (emoji) => {
        messageInput.value += emoji.native;
        messageInput.focus();
        pickerContainer.style.display = 'none'; // Automatické zavření po výběru
    }
};

const picker = new EmojiMart.Picker(pickerOptions);
pickerContainer.appendChild(picker);

// Funkce pro aktualizaci motivu smajlíků za běhu
function updatePickerTheme() {
    picker.update({ theme: getPickerTheme() });
}
 
// NAČTENÍ DARK MODU Z LOCALSTORAGE
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-theme');
    darkModeToggle.textContent = '☀️';
    updatePickerTheme();
}

// Přepínání Dark Modu po kliknutí
darkModeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    
    if (document.body.classList.contains('dark-theme')) {
        localStorage.setItem('theme', 'dark');
        darkModeToggle.textContent = '☀️';
    } else {
        localStorage.setItem('theme', 'light');
        darkModeToggle.textContent = '🌙';
    }
    updatePickerTheme(); // Změní téma i v emoji okně
});

// Načtení jména z localStorage po načtení stránky
if (localStorage.getItem('chat_username')) {
    nameInput.value = localStorage.getItem('chat_username');
}

// Uložení jména do localStorage, když ho uživatel změní
nameInput.addEventListener('input', () => {
    localStorage.setItem('chat_username', nameInput.value);
});

// Otevření / zavření okna s emoji
emojiTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    pickerContainer.style.display = pickerContainer.style.display === 'none' ? 'block' : 'none';
});

// Zavření pickeru při kliknutí kamkoliv mimo, ale ignorujeme kliknutí uvnitř samotného pickeru
document.addEventListener('click', (event) => {
    const isClickInsidePicker = pickerContainer.contains(event.target);
    const isClickOnTrigger = emojiTrigger.contains(event.target);

    if (!isClickInsidePicker && !isClickOnTrigger) {
        pickerContainer.style.display = 'none';
    }
});

// Logika pro detekci psaní
let typingTimeout;
messageInput.addEventListener('input', () => {
    const name = nameInput.value || "Anonymous";
    socket.emit('typing', { name: name, isTyping: true });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing', { name: name, isTyping: false });
    }, 2000);
});

// Příjem indikace psaní ze serveru
socket.on('typing', (data) => {
    const currentUserName = nameInput.value || "Anonymous";
    if (data.isTyping && data.name !== currentUserName) {
        typingIndicator.textContent = `${data.name} is typing...`;
    } else if (!data.isTyping && data.name !== currentUserName) {
        typingIndicator.textContent = '';
    }
});

// Funkce pro odeslání zprávy na server
function sendMessage() {
  const name = nameInput.value || "Anonymous";
  const text = messageInput.value;
 
  if (text.trim() === "") {
    return;
  }
 
  socket.emit('typing', { name: name, isTyping: false });

  const now = new Date();
  const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  socket.emit("chat message", {
    name: name,
    text: text,
    time: timeString
  });
 
  messageInput.value = "";
  messageInput.focus();
}
 
sendButton.addEventListener("click", sendMessage);
 
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendMessage();
  }
});
 
// Příjem zprávy ze serveru a její vykreslení (vlevo/vpravo)
socket.on("chat message", (data) => {
  const messageElement = document.createElement("div");
  messageElement.classList.add("message");
  
  const currentUserName = nameInput.value || "Anonymous";
  const msgTime = data.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (data.name === currentUserName) {
    messageElement.classList.add("my-message");
    messageElement.innerHTML = `<strong>You:</strong><br>${data.text}<span class="timestamp">${msgTime}</span>`;
  } else {
    messageElement.innerHTML = `<strong>${data.name}:</strong><br>${data.text}<span class="timestamp">${msgTime}</span>`;
  }
 
  messages.appendChild(messageElement);
  messages.scrollTop = messages.scrollHeight;
});