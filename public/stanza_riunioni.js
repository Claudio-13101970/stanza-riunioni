const socket = io();

let localStream;
let remoteStream;
let peerConnection;
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }, // Server STUN pubblico
  ],
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const joinButton = document.getElementById('joinButton');

joinButton.addEventListener('click', async () => {
  await start();
});

async function start() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    peerConnection = new RTCPeerConnection(configuration);

    // Quando riceviamo tracce remote
    peerConnection.ontrack = (event) => {
      if (!remoteStream) {
        remoteStream = new MediaStream();
        remoteVideo.srcObject = remoteStream;
      }
      remoteStream.addTrack(event.track);
    };

    // Quando ICE candidate sono generate
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('new-ice-candidate', event.candidate);
      }
    };

    // Aggiunge le tracce locali alla connessione
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Creiamo un'offerta
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Mandiamo l'offerta via WebSocket
    socket.emit('video-offer', offer);
  } catch (error) {
    console.error('Errore nell\'avviare la stanza:', error);
  }
}

// Riceviamo un'offerta
socket.on('video-offer', async (offer) => {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection(configuration);

    peerConnection.ontrack = (event) => {
      if (!remoteStream) {
        remoteStream = new MediaStream();
        remoteVideo.srcObject = remoteStream;
      }
      remoteStream.addTrack(event.track);
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('new-ice-candidate', event.candidate);
      }
    };

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit('video-answer', answer);
});

// Riceviamo una risposta
socket.on('video-answer', async (answer) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

// Riceviamo nuovi ICE candidates
socket.on('new-ice-candidate', async (candidate) => {
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    console.error('Errore aggiungendo ICE candidate:', error);
  }
});
