const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const{Server} = require('socket.io');

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

io.on('connection', (socket) => {

    console.log('A user connected');
    socket.emit('chat history', savedMessages);

    socket.on('chat message', (data) => {
        savedMessages.push(data);
        saveMessages(savedMessages);
        io.emit('chat message', data);
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
