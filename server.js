const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

app.get('/stanza_riunioni', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'stanza_riunioni.html'));
});

const users = {};

io.on('connection', (socket) => {
  console.log('Utente connesso:', socket.id);
  users[socket.id] = socket;

  socket.on('disconnect', () => {
    console.log('Utente disconnesso:', socket.id);
    delete users[socket.id];
    socket.broadcast.emit('user-disconnected', socket.id);
  });

  socket.on('offer', (data) => {
    socket.broadcast.emit('offer', { offer: data.offer, id: socket.id });
  });

  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', { answer: data.answer, id: socket.id });
  });

  socket.on('candidate', (data) => {
    socket.to(data.target).emit('candidate', { candidate: data.candidate, id: socket.id });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server WebSocket in ascolto sulla porta ${PORT}`);
});