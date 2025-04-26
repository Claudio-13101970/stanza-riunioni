
const socket = io();
const videosContainer = document.getElementById('videos');
const cameraSelect = document.getElementById('cameraSelect');
const micSelect = document.getElementById('micSelect');
const startButton = document.getElementById('startButton');
const shareScreenButton = document.getElementById('shareScreenButton');
const leaveButton = document.getElementById('leaveButton');

let localStream;
let peers = {};
let myId;

async function getDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  cameraSelect.innerHTML = '';
  micSelect.innerHTML = '';
  devices.forEach(device => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.text = device.label || device.kind;
    if (device.kind === 'videoinput') {
      cameraSelect.appendChild(option);
    } else if (device.kind === 'audioinput') {
      micSelect.appendChild(option);
    }
  });
}

async function startStream() {
  const constraints = {
    video: { deviceId: cameraSelect.value ? { exact: cameraSelect.value } : undefined },
    audio: { deviceId: micSelect.value ? { exact: micSelect.value } : undefined }
  };
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  addVideoStream(localStream, myId, true);
}

function addVideoStream(stream, id, isLocal = false) {
  let video = document.getElementById(id);
  if (!video) {
    video = document.createElement('video');
    video.id = id;
    video.autoplay = true;
    video.playsInline = true;
    if (isLocal) video.muted = true;
    videosContainer.appendChild(video);
  }
  video.srcObject = stream;
  adjustVideoSize();
}

function adjustVideoSize() {
  const videos = document.querySelectorAll('video');
  const total = videos.length;
  let size = '30%';
  if (total === 1) size = '80%';
  if (total === 2) size = '45%';
  if (total > 2) size = '30%';
  videos.forEach(video => {
    video.style.width = size;
  });
}

startButton.onclick = async () => {
  await getDevices();
  await startStream();
  socket.emit('offer', { offer: await createOffer() });
};

shareScreenButton.onclick = async () => {
  const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  const videoTrack = screenStream.getVideoTracks()[0];
  for (let peerId in peers) {
    const sender = peers[peerId].getSenders().find(s => s.track.kind === 'video');
    if (sender) sender.replaceTrack(videoTrack);
  }
  videoTrack.onended = async () => {
    const videoTrack = localStream.getVideoTracks()[0];
    for (let peerId in peers) {
      const sender = peers[peerId].getSenders().find(s => s.track.kind === 'video');
      if (sender) sender.replaceTrack(videoTrack);
    }
  };
};

leaveButton.onclick = () => {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  socket.disconnect();
  location.reload();
};

socket.on('connect', () => {
  myId = socket.id;
});

socket.on('offer', async ({ offer, id }) => {
  const peerConnection = createPeerConnection(id);
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('answer', { answer: answer, to: id });
});

socket.on('answer', async ({ answer, id }) => {
  if (peers[id]) {
    await peers[id].setRemoteDescription(new RTCSessionDescription(answer));
  }
});

socket.on('candidate', async ({ candidate, id }) => {
  if (peers[id]) {
    try {
      await peers[id].addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error(e);
    }
  }
});

socket.on('user-disconnected', (id) => {
  const video = document.getElementById(id);
  if (video) {
    video.classList.add('fade-out');
    setTimeout(() => video.remove(), 500);
    adjustVideoSize();
  }
  if (peers[id]) {
    peers[id].close();
    delete peers[id];
  }
});

function createPeerConnection(id) {
  const peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  peerConnection.ontrack = (event) => {
    addVideoStream(event.streams[0], id);
  };
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('candidate', { candidate: event.candidate });
    }
  };
  peers[id] = peerConnection;
  return peerConnection;
}

async function createOffer() {
  const peerConnection = createPeerConnection(socket.id);
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  return offer;
}
