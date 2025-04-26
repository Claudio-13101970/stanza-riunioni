const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve i file statici dalla cartella "public"
app.use(express.static('public'));

// Serve la pagina HTML della stanza riunioni
app.get('/stanza_riunioni', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'stanza_riunioni.html'));
});

// Gestione connessioni socket
const rooms = {};

io.on('connection', (socket) => {
  console.log('Un utente si è connesso:', socket.id);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} si è unito alla stanza ${roomId}`);

    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }
    rooms[roomId].push(socket.id);

    // Notifica agli altri utenti nella stanza di un nuovo partecipante
    socket.to(roomId).emit('user-joined', socket.id);

    // Invia la lista degli utenti esistenti al nuovo arrivato
    socket.emit('all-users', rooms[roomId].filter(id => id !== socket.id));
  });

  socket.on('sending-signal', ({ userToSignal, callerId, signal }) => {
    io.to(userToSignal).emit('user-joined-signal', { signal, callerId });
  });

  socket.on('returning-signal', ({ callerId, signal }) => {
    io.to(callerId).emit('receiving-returned-signal', { signal, id: socket.id });
  });

  socket.on('disconnecting', () => {
    console.log('Un utente si sta disconnettendo:', socket.id);
    const roomsToDelete = [];
    for (const roomId of socket.rooms) {
      if (roomId !== socket.id) {
        if (rooms[roomId]) {
          rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
          socket.to(roomId).emit('user-left', socket.id);
          if (rooms[roomId].length === 0) {
            roomsToDelete.push(roomId);
          }
        }
      }
    }
    for (const roomId of roomsToDelete) {
      delete rooms[roomId];
    }
  });
});

// Avvia il server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);
});
