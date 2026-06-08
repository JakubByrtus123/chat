const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const messagesFile = path.join(__dirname, 'messages.json');

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

const savedMessages = loadMessages();
const io = new Server(server, {
    cors: {
        origin: '*'
    }
});

app.use(express.static('public'));

// Objekt pro ukládání profilovek v paměti serveru (klíč = username, hodnota = Base64/dataURL)
const userAvatars = {}; 

io.on('connection', (socket) => {

    console.log('A user connected');
    socket.emit('chat history', savedMessages);

    // Klient si po připojení vyžádá profilovku ze serveru (pro případ, že změnil prohlížeč)
    socket.on('get avatar', (data) => {
        if (userAvatars[data.username]) {
            socket.emit('user avatar', { avatar: userAvatars[data.username] });
        }
    });

    // Uložení nové profilovky na serveru
    socket.on('update avatar', (data) => {
        if (data.username && data.avatar) {
            userAvatars[data.username] = data.avatar;
        }
    });

    // Zpracování nové zprávy
    socket.on('chat message', (data) => {
        // Pokud má uživatel na serveru uloženou novější profilovku, použijeme ji
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
            // Kontrola, zda zprávu maže skutečně ten, kdo ji poslal
            if (savedMessages[index].name === data.username) {
                savedMessages.splice(index, 1);
                saveMessages(savedMessages);
                
                // Dáme vědět všem klientům, aby zprávu smazali z obrazovky
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