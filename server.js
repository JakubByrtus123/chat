const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const messagesFile = path.join(__dirname, 'messages.json');
const avatarsFile = path.join(__dirname, 'avatars.json'); // Soubor pro trvalé uložení profilovek

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

// Načtení profilovek ze souboru při startu
function loadAvatars() {
    try {
        if (!fs.existsSync(avatarsFile)) return {};
        return JSON.parse(fs.readFileSync(avatarsFile, 'utf8'));
    } catch (error) {
        console.error('Could not load saved avatars:', error);
        return {};
    }
}

// Uložení profilovek do souboru
function saveAvatars(avatars) {
    try {
        fs.writeFileSync(avatarsFile, JSON.stringify(avatars, null, 2));
    } catch (error) {
        console.error('Could not save avatars:', error);
    }
}

const savedMessages = loadMessages();
const userAvatars = loadAvatars(); // Načteme uložené profilovky z disku

const io = new Server(server, {
    cors: {
        origin: '*'
    }
});

app.use(express.static('public'));

io.on('connection', (socket) => {

    console.log('A user connected');
    socket.emit('chat history', savedMessages);

    // Klient si po připojení vyžádá profilovku ze serveru
    socket.on('get avatar', (data) => {
        if (data && data.username) {
            socket.emit('user avatar', {
                username: data.username,
                avatar: userAvatars[data.username] || null
            });
        }
    });

    // Uložení nové profilovky na serveru a zápis na disk
    socket.on('update avatar', (data) => {
        if (data.username && data.avatar) {
            userAvatars[data.username] = data.avatar;
            saveAvatars(userAvatars); // Uložíme do avatars.json
        }
    });

    // Zpracování nové zprávy
    socket.on('chat message', (data) => {
        if (userAvatars[data.name]) {
            data.avatar = userAvatars[data.name];
        }
        
        savedMessages.push(data);
        saveMessages(savedMessages);
        io.emit('chat message', data);
    });

    // Mazání zpráv
    socket.on('delete message', (data) => {
        const index = savedMessages.findIndex(m => m.id === data.id);
        
        if (index !== -1) {
            if (savedMessages[index].name === data.username) {
                savedMessages.splice(index, 1);
                saveMessages(savedMessages);
                io.emit('message deleted', { id: data.id });
            }
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