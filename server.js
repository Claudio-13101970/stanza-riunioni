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

io.on('connection', (socket) => {
  socket.broadcast.emit('user-connected', socket.id);

  socket.on('disconnect', () => {
    socket.broadcast.emit('user-disconnected', socket.id);
  });

  socket.on('signal', data => {
    io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server avviato sulla porta ${PORT}`);
});