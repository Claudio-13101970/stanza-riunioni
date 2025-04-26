const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

app.get('/stanza_riunioni', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'stanza_riunioni.html'));
});

const users = {};

io.on('connection', (socket) => {
  console.log('Nuovo utente connesso:', socket.id);

  socket.on('ready', () => {
    users[socket.id] = socket;
    socket.emit('all-users', Object.keys(users).filter(id => id !== socket.id));
    socket.broadcast.emit('user-joined', socket.id);
  });

  socket.on('signal', ({ to, signal }) => {
    io.to(to).emit('signal', { from: socket.id, signal });
  });

  socket.on('disconnect', () => {
    console.log('Utente disconnesso:', socket.id);
    delete users[socket.id];
    socket.broadcast.emit('user-left', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);
});