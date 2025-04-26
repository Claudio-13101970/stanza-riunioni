const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path'); // <--- QUESTA parte era mancante

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve i file statici della cartella "public"
app.use(express.static('public'));

// Servire il file HTML per la stanza riunioni
app.get('/stanza_riunioni', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'stanza_riunioni.html'));
});

// Evento di connessione WebSocket
io.on('connection', (socket) => {
  console.log('Un utente si è connesso');

  socket.on('disconnect', () => {
    console.log('Un utente si è disconnesso');
  });

  socket.on('video-offer', (data) => {
    socket.broadcast.emit('video-offer', data);
  });

  socket.on('video-answer', (data) => {
    socket.broadcast.emit('video-answer', data);
  });

  socket.on('new-ice-candidate', (data) => {
    socket.broadcast.emit('new-ice-candidate', data);
  });
});

// Avvia il server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server WebSocket in ascolto sulla porta ${
