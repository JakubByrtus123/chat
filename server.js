const express = require('express');
const http = require('http');
const{Server} = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*'
    }
});

app.use(express.static('public'));

io.on('connection', (socket) => {

    console.log('A user connected');

    socket.on('chat message', (data) => {
        io.emit('chat message', data);
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

server.listen(3000, "0.0.0.0", () => {
    console.log('Server running on http://localhost:3000');
});