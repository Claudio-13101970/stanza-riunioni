const socket = io();

let localStream;
let peerConnection;
const config = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startButton = document.getElementById('startButton');

startButton.onclick = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit('ice-candidate', candidate);
      }
    };

    peerConnection.ontrack = ({ streams: [stream] }) => {
      remoteVideo.srcObject = stream;
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', offer);
  } catch (err) {
    console.error('Errore nell’acquisizione dei media:', err);
  }
};

socket.on('offer', async offer => {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection(config);

    peerConnection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit('ice-candidate', candidate);
      }
    };

    peerConnection.ontrack = ({ streams: [stream] }) => {
      remoteVideo.srcObject = stream;
    };

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  await peerConnection.setRemoteDescription(offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('answer', answer);
});

socket.on('answer', async answer => {
  await peerConnection.setRemoteDescription(answer);
});

socket.on('ice-candidate', async candidate => {
  try {
    await peerConnection.addIceCandidate(candidate);
  } catch (err) {
    console.error('Errore ICE candidate', err);
  }
});
