const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const messagesFile = path.join(__dirname, 'messages.json');
const dmsFile = path.join(__dirname, 'direct-messages.json');
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

function loadDMs() {
    try {
        if (!fs.existsSync(dmsFile)) return [];
        const savedDMs = JSON.parse(fs.readFileSync(dmsFile, 'utf8'));
        return Array.isArray(savedDMs) ? savedDMs : [];
    } catch (error) {
        console.error('Could not load direct messages:', error);
        return [];
    }
}

function saveDMs(dms) {
    try {
        fs.writeFileSync(dmsFile, JSON.stringify(dms, null, 2));
    } catch (error) {
        console.error('Could not save direct messages:', error);
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

const savedMessages = loadMessages();
const savedDMs = loadDMs();
const userAvatars = loadAvatars();
const userSockets = new Map();

function normalizeMessage(m) {
    if (!m.reactions) m.reactions = {};
    if (!m.edited) m.edited = false;
}

savedMessages.forEach(normalizeMessage);
savedDMs.forEach(normalizeMessage);

function getOnlineUsers() {
    return [...userSockets.keys()].sort((a, b) => a.localeCompare(b));
}

function broadcastOnlineUsers() {
    const users = getOnlineUsers();
    io.emit('online users', users);
}

function emitToUser(username, event, data) {
    const sockets = userSockets.get(username);
    if (!sockets) return;
    sockets.forEach(socketId => io.to(socketId).emit(event, data));
}

function emitToUsers(usernames, event, data) {
    const unique = [...new Set(usernames.filter(Boolean))];
    unique.forEach(username => emitToUser(username, event, data));
}

function findDMIndex(id) {
    return savedDMs.findIndex(m => m.id === id);
}

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

        const previousUsername = socket.data.username;
        if (previousUsername && userSockets.has(previousUsername)) {
            userSockets.get(previousUsername).delete(socket.id);
            if (userSockets.get(previousUsername).size === 0) {
                userSockets.delete(previousUsername);
            }
        }

        socket.data.username = username;
        if (!userSockets.has(username)) {
            userSockets.set(username, new Set());
        }
        userSockets.get(username).add(socket.id);

        const userDMs = savedDMs.filter(m => m.name === username || m.to === username);
        socket.emit('dm history', userDMs.slice(-MESSAGE_HISTORY_LIMIT));
        socket.emit('online users', getOnlineUsers());
        broadcastOnlineUsers();
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
        if (userAvatars[data.name]) {
            data.avatar = userAvatars[data.name];
        }
        normalizeMessage(data);
        handleFileUpload(data);

        savedMessages.push(data);
        saveMessages(savedMessages);
        io.emit('chat message', data);
    });

    socket.on('direct message', (data) => {
        const sender = data && data.name;
        const recipient = data && data.to;
        if (!sender || !recipient || sender === recipient) return;

        if (userAvatars[sender]) {
            data.avatar = userAvatars[sender];
        }
        normalizeMessage(data);
        handleFileUpload(data);

        savedDMs.push(data);
        saveDMs(savedDMs);
        emitToUsers([sender, recipient], 'direct message', data);
    });

    socket.on('edit message', (data) => {
        const publicIndex = savedMessages.findIndex(m => m.id === data.id);
        if (publicIndex !== -1 && savedMessages[publicIndex].name === data.username) {
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
            return;
        }

        const dmIndex = findDMIndex(data.id);
        if (dmIndex === -1) return;
        const dm = savedDMs[dmIndex];
        if (dm.name !== data.username) return;

        dm.text = data.text;
        dm.edited = true;
        dm.editedAt = new Date().toISOString();
        dm.isCode = /^```[\s\S]*```$/.test(data.text.trim());
        saveDMs(savedDMs);
        emitToUsers([dm.name, dm.to], 'dm edited', {
            id: data.id,
            text: data.text,
            edited: true,
            editedAt: dm.editedAt,
            isCode: dm.isCode
        });
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
            return;
        }

        const dmIndex = findDMIndex(data.messageId);
        if (dmIndex === -1) return;

        const msg = savedDMs[dmIndex];
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

        saveDMs(savedDMs);
        emitToUsers([msg.name, msg.to], 'dm reactions', {
            id: data.messageId,
            reactions: msg.reactions
        });
    });

    socket.on('delete message', (data) => {
        const publicIndex = savedMessages.findIndex(m => m.id === data.id);
        if (publicIndex !== -1 && savedMessages[publicIndex].name === data.username) {
            savedMessages.splice(publicIndex, 1);
            saveMessages(savedMessages);
            io.emit('message deleted', { id: data.id });
            return;
        }

        const dmIndex = findDMIndex(data.id);
        if (dmIndex === -1) return;
        const dm = savedDMs[dmIndex];
        if (dm.name !== data.username) return;

        savedDMs.splice(dmIndex, 1);
        saveDMs(savedDMs);
        emitToUsers([dm.name, dm.to], 'dm deleted', { id: data.id });
    });

    socket.on('typing', (data) => {
        if (data && data.to) {
            emitToUser(data.to, 'dm typing', data);
            return;
        }
        socket.broadcast.emit('typing', data);
    });

    socket.on('disconnect', () => {
        const username = socket.data.username;
        if (username && userSockets.has(username)) {
            userSockets.get(username).delete(socket.id);
            if (userSockets.get(username).size === 0) {
                userSockets.delete(username);
            }
            broadcastOnlineUsers();
        }
        console.log('A user disconnected');
    });
});

server.listen(3000, "0.0.0.0", () => {
    console.log('Server running on http://localhost:3000');
});