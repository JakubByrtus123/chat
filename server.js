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

const savedMessages = loadMessages();
const userAvatars = loadAvatars();

// Normalize old messages
savedMessages.forEach(m => {
    if (!m.reactions) m.reactions = {};
    if (!m.edited) m.edited = false;
});

const io = new Server(server, {
    cors: { origin: '*' }
});

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('A user connected');
    socket.emit('chat history', savedMessages.slice(-MESSAGE_HISTORY_LIMIT));

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
        if (!data.reactions) data.reactions = {};
        if (!data.edited) data.edited = false;

        savedMessages.push(data);
        saveMessages(savedMessages);
        io.emit('chat message', data);
    });

    socket.on('edit message', (data) => {
        const index = savedMessages.findIndex(m => m.id === data.id);
        if (index !== -1 && savedMessages[index].name === data.username) {
            savedMessages[index].text = data.text;
            savedMessages[index].edited = true;
            savedMessages[index].editedAt = new Date().toISOString();
            savedMessages[index].isCode = /^```[\s\S]*```$/.test(data.text.trim());
            saveMessages(savedMessages);
            io.emit('message edited', {
                id: data.id,
                text: data.text,
                edited: true,
                editedAt: savedMessages[index].editedAt,
                isCode: savedMessages[index].isCode
            });
        }
    });

    socket.on('reaction', (data) => {
        const index = savedMessages.findIndex(m => m.id === data.messageId);
        if (index === -1) return;

        const msg = savedMessages[index];
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
    });

    socket.on('delete message', (data) => {
        const index = savedMessages.findIndex(m => m.id === data.id);
        if (index !== -1 && savedMessages[index].name === data.username) {
            savedMessages.splice(index, 1);
            saveMessages(savedMessages);
            io.emit('message deleted', { id: data.id });
        }
    });

    socket.on('typing', (data) => {
        socket.broadcast.emit('typing', data);
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

server.listen(3000, "0.0.0.0", () => {
    console.log('Server running on http://localhost:3000');
});