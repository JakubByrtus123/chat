const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const messagesFile = path.join(__dirname, 'messages.json');
const avatarsFile = path.join(__dirname, 'avatars.json');

function loadMessages() {
    try {
        if (!fs.existsSync(messagesFile)) return [];
        const savedMessages = JSON.parse(fs.readFileSync(messagesFile, 'utf8'));
        return Array.isArray(savedMessages) ? savedMessages : [];
    } catch (error) {
        console.error('Could not load saved messages:', error);
        return [];
    }
}

function saveMessages(messages) {
    try {
        fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2));
    } catch (error) {
        console.error('Could not save messages:', error);
    }
}

function loadAvatars() {
    try {
        if (!fs.existsSync(avatarsFile)) return {};
        return JSON.parse(fs.readFileSync(avatarsFile, 'utf8'));
    } catch (error) {
        console.error('Could not load saved avatars:', error);
        return {};
    }
}

function saveAvatars(avatars) {
    try {
        fs.writeFileSync(avatarsFile, JSON.stringify(avatars, null, 2));
    } catch (error) {
        console.error('Could not save avatars:', error);
    }
}

const MESSAGE_HISTORY_LIMIT = 267;
const MAX_MESSAGE_LENGTH = 1000;
const RATE_LIMIT_MS = 1500;

const savedMessages = loadMessages();
const userAvatars = loadAvatars();
const rateLimitMap = new Map();

function normalizeMessage(m) {
    if (!m.reactions) m.reactions = {};
    if (!m.edited) m.edited = false;
}

savedMessages.forEach(normalizeMessage);

function handleFileUpload(data) {
    if (data.file && data.file.data) {
        const base64Data = data.file.data.split(',')[1];
        if (base64Data) {
            const buffer = Buffer.from(base64Data, 'base64');
            const ext = path.extname(data.file.name) || '.bin';
            const filename = Date.now() + '-' + Math.random().toString(36).substr(2, 9) + ext;
            const uploadDir = path.join(__dirname, 'public', 'uploads');
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            const filepath = path.join(uploadDir, filename);
            fs.writeFileSync(filepath, buffer);
            data.file = {
                name: data.file.name,
                type: data.file.type,
                size: data.file.size,
                url: '/uploads/' + filename
            };
        }
    }
}

function isRateLimited(socketId) {
    const now = Date.now();
    const last = rateLimitMap.get(socketId) || 0;
    if (now - last < RATE_LIMIT_MS) return true;
    rateLimitMap.set(socketId, now);
    return false;
}

const io = new Server(server, {
    cors: { origin: '*' },
    maxHttpBufferSize: 5e6
});

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('A user connected');
    socket.emit('chat history', savedMessages.slice(-MESSAGE_HISTORY_LIMIT));

    socket.on('join', (data) => {
        const username = data && data.username;
        if (!username) return;
        socket.data.username = username;
    });

    socket.on('get avatar', (data) => {
        if (data && data.username) {
            socket.emit('user avatar', {
                username: data.username,
                avatar: userAvatars[data.username] || null
            });
        }
    });

    socket.on('update avatar', (data) => {
        if (data.username && data.avatar) {
            userAvatars[data.username] = data.avatar;
            saveAvatars(userAvatars);
        }
    });

    socket.on('chat message', (data) => {
        if (isRateLimited(socket.id)) {
            socket.emit('error message', 'You are sending messages too quickly. Please wait a moment.');
            return;
        }

        const text = data.text || '';
        if (text.length > MAX_MESSAGE_LENGTH) {
            socket.emit('error message', `Message too long. Max ${MAX_MESSAGE_LENGTH} characters.`);
            return;
        }

        if (userAvatars[data.name]) {
            data.avatar = userAvatars[data.name];
        }
        normalizeMessage(data);
        handleFileUpload(data);

        savedMessages.push(data);
        saveMessages(savedMessages);
        io.emit('chat message', data);
    });

    socket.on('edit message', (data) => {
        const publicIndex = savedMessages.findIndex(m => m.id === data.id);
        if (publicIndex !== -1 && savedMessages[publicIndex].name === data.username) {
            const newText = data.text || '';
            if (newText.length > MAX_MESSAGE_LENGTH) {
                socket.emit('error message', `Message too long. Max ${MAX_MESSAGE_LENGTH} characters.`);
                return;
            }
            savedMessages[publicIndex].text = data.text;
            savedMessages[publicIndex].edited = true;
            savedMessages[publicIndex].editedAt = new Date().toISOString();
            savedMessages[publicIndex].isCode = /^```[\s\S]*```$/.test(data.text.trim());
            saveMessages(savedMessages);
            io.emit('message edited', {
                id: data.id,
                text: data.text,
                edited: true,
                editedAt: savedMessages[publicIndex].editedAt,
                isCode: savedMessages[publicIndex].isCode
            });
        }
    });

    socket.on('reaction', (data) => {
        const publicIndex = savedMessages.findIndex(m => m.id === data.messageId);
        if (publicIndex !== -1) {
            const msg = savedMessages[publicIndex];
            if (!msg.reactions) msg.reactions = {};

            const emoji = data.emoji;
            const username = data.username;

            if (!msg.reactions[emoji]) {
                msg.reactions[emoji] = [];
            }

            const idx = msg.reactions[emoji].indexOf(username);
            if (idx === -1) {
                msg.reactions[emoji].push(username);
            } else {
                msg.reactions[emoji].splice(idx, 1);
                if (msg.reactions[emoji].length === 0) {
                    delete msg.reactions[emoji];
                }
            }

            saveMessages(savedMessages);
            io.emit('message reactions', {
                id: data.messageId,
                reactions: msg.reactions
            });
        }
    });

    socket.on('delete message', (data) => {
        const publicIndex = savedMessages.findIndex(m => m.id === data.id);
        if (publicIndex !== -1 && savedMessages[publicIndex].name === data.username) {
            savedMessages.splice(publicIndex, 1);
            saveMessages(savedMessages);
            io.emit('message deleted', { id: data.id });
        }
    });

    socket.on('typing', (data) => {
        socket.broadcast.emit('typing', data);
    });

    socket.on('disconnect', () => {
        rateLimitMap.delete(socket.id);
        console.log('A user disconnected');
    });
});

server.listen(3000, "0.0.0.0", () => {
    console.log('Server running on http://localhost:3000');
});