const socket = io('192.168.21.86:3000');
 
const messages = document.getElementById("messages");
const nameInput = document.getElementById("name");
const messageInput = document.getElementById("message");
const sendButton = document.getElementById("send");
 
function sendMessage() {
  const name = nameInput.value || "Anonymous";
  const text = messageInput.value;
 
  if (text.trim() === "") {
    return;
  }
 
  socket.emit("chat message", {
    name: name,
    text: text
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
 
socket.on("chat message", (data) => {
  const messageElement = document.createElement("div");
  messageElement.classList.add("message");
  messageElement.textContent = `${data.name}: ${data.text}`;
 
  messages.appendChild(messageElement);
  messages.scrollTop = messages.scrollHeight;
});