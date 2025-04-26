const socket = io();

let localStream;
let remoteStream;
let peerConnection;
let selectedCameraId;
let selectedMicrophoneId;
const configuration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const joinButton = document.getElementById('joinButton');
const shareScreenButton = document.getElementById('shareScreenButton');
const cameraSelect = document.getElementById('cameraSelect');
const microphoneSelect = document.getElementById('microphoneSelect');

async function enumerateDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();

  cameraSelect.innerHTML = '';
  microphoneSelect.innerHTML = '';

  devices.forEach(device => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.text = device.label || `${device.kind}`;
    
    if (device.kind === 'videoinput') {
      cameraSelect.appendChild(option);
    } else if (device.kind === 'audioinput') {
      microphoneSelect.appendChild(option);
    }
  });
}

async function start() {
  try {
    const constraints = {
      video: { deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined },
      audio: { deviceId: selectedMicrophoneId ? { exact: selectedMicrophoneId } : undefined }
    };

    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;

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

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('video-offer', offer);
  } catch (error) {
    console.error('Errore nell\'avviare la stanza:', error);
  }
}

joinButton.addEventListener('click', async () => {
  selectedCameraId = cameraSelect.value;
  selectedMicrophoneId = microphoneSelect.value;
  await start();
});

shareScreenButton.addEventListener('click', async () => {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

    const screenTrack = screenStream.getVideoTracks()[0];

    const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
    sender.replaceTrack(screenTrack);

    screenTrack.onended = async () => {
      const constraints = { video: { deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined } };
      const camStream = await navigator.mediaDevices.getUserMedia(constraints);
      const camTrack = camStream.getVideoTracks()[0];
      sender.replaceTrack(camTrack);
    };

  } catch (err) {
    console.error('Errore durante la condivisione schermo:', err);
  }
});

// Riceviamo offerta
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

// Riceviamo risposta
socket.on('video-answer', async (answer) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

// Riceviamo ICE candidate
socket.on('new-ice-candidate', async (candidate) => {
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    console.error('Errore aggiungendo ICE candidate:', error);
  }
});

// Quando la pagina carica, elenchiamo i dispositivi disponibili
enumerateDevices();
navigator.mediaDevices.addEventListener('devicechange', enumerateDevices);
