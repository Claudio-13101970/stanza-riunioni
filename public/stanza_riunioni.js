const socket = io();
const videosContainer = document.getElementById('videosContainer');
const cameraSelect = document.getElementById('cameraSelect');
const micSelect = document.getElementById('micSelect');
const startButton = document.getElementById('startButton');
const shareButton = document.getElementById('shareButton');
const leaveButton = document.getElementById('leaveButton');

let localStream;
const peers = {};
const remoteStreams = {};    // memorizza gli stream remoti

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

  // Aggiungiamo manualmente le opzioni "spento"
  const cameraOffOption = document.createElement('option');
  cameraOffOption.value = 'off';
  cameraOffOption.text = 'Videocamera Spenta';
  cameraSelect.appendChild(cameraOffOption);

  const micOffOption = document.createElement('option');
  micOffOption.value = 'off';
  micOffOption.text = 'Microfono Spento';
  micSelect.appendChild(micOffOption);
}

async function startVideo() {
  const constraints = {
    video: { deviceId: cameraSelect.value && cameraSelect.value !== 'off' ? { exact: cameraSelect.value } : undefined },
    audio: { deviceId: micSelect.value && micSelect.value !== 'off' ? { exact: micSelect.value } : undefined }
  };
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  addVideoStream(localStream, socket.id, true);

  socket.emit('ready');
}

function addVideoStream(stream, id, muted = false) {
  let video = document.getElementById(id);
  if (!video) {
    video = document.createElement('video');
    video.id = id;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = muted;
    videosContainer.appendChild(video);
  }
  video.srcObject = stream;
  video.classList.remove('avatar');
  adjustVideoLayout();
}

function adjustVideoLayout() {
  const videos = document.querySelectorAll('video');
  let width = '45%';
  if (videos.length <= 2) width = '45%';
  else if (videos.length <= 4) width = '30%';
  else width = '22%';
  videos.forEach(video => {
    video.style.width = width;
  });
}

startButton.onclick = async () => {
  await startVideo();
};

shareButton.onclick = async () => {
  const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  const screenTrack = screenStream.getVideoTracks()[0];
  Object.values(peers).forEach(peer => {
    const sender = peer.getSenders().find(s => s.track.kind === 'video');
    if (sender) sender.replaceTrack(screenTrack);
  });
};

leaveButton.onclick = () => {
  socket.disconnect();
  window.close();
};

socket.on('all-users', async (users) => {
  for (const userId of users) {
    const peer = createPeer(userId);
    peers[userId] = peer;
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('signal', { to: userId, signal: offer });
  }
});

socket.on('user-joined', async (userId) => {
  const peer = createPeer(userId);
  peers[userId] = peer;
});

socket.on('signal', async ({ from, signal }) => {
  if (!peers[from]) {
    const peer = createPeer(from);
    peers[from] = peer;
  }

  if (signal.type === 'offer' || signal.type === 'answer') {
    await peers[from].setRemoteDescription(new RTCSessionDescription(signal));
    if (signal.type === 'offer') {
      const answer = await peers[from].createAnswer();
      await peers[from].setLocalDescription(answer);
      socket.emit('signal', { to: from, signal: answer });
    }
  } else if (signal.candidate) {
    await peers[from].addIceCandidate(new RTCIceCandidate(signal));
  }
});

// Ricevo toggle camera da remoto
socket.on('camera-toggled', ({ id, enabled }) => {
  const vid = document.getElementById(id);
  if (!vid) return;
  const track = remoteStreams[id]?.getVideoTracks()[0];
  if (track) track.enabled = enabled;

  if (!enabled) {
    vid.classList.add('avatar');
    setTimeout(() => vid.classList.add('fade-in'), 0);
  } else {
    vid.classList.remove('avatar','fade-in');
  }
});

socket.on('user-left', (id) => {
  if (peers[id]) {
    peers[id].close();
    delete peers[id];
  }
  const video = document.getElementById(id);
  if (video) {
    video.classList.add('fade-out');
    setTimeout(() => video.remove(), 500);
  }
  adjustVideoLayout();
});

function createPeer(id) {
  const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

  if (localStream) {
    localStream.getTracks().forEach(track => {
      peer.addTrack(track, localStream);
    });
  }

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { to: id, signal: event.candidate });
    }
  };

  peer.ontrack = (event) => {
  // salva lo stream in remoto e poi lo mostra
  remoteStreams[id] = event.streams[0];
  addVideoStream(event.streams[0], id);
};

  return peer;
}

// Carica dispositivi appena apre
window.addEventListener('DOMContentLoaded', getDevices);

// Cambio dinamico dei dispositivi

// Gestione toggle videocamera via enabled track
cameraSelect.addEventListener('change', () => {
  if (!localStream) return;
  const isOn = cameraSelect.value !== 'off';
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) videoTrack.enabled = isOn;

  // forza il video element a riprendere lo stesso stream
  const localVideo = document.getElementById(socket.id);
  localVideo.srcObject = localStream;

  // UI locale (avatar + fade-in)
  if (!isOn) {
    localVideo.classList.add('avatar');
    setTimeout(() => localVideo.classList.add('fade-in'), 0);
  } else {
    localVideo.classList.remove('avatar','fade-in');
  }

  // notifico tutti gli altri
  socket.emit('camera-toggled', { id: socket.id, enabled: isOn });
});

micSelect.addEventListener('change', () => {
  if (!localStream) return;
  const enabled = micSelect.value !== 'off';
  localStream.getAudioTracks().forEach(track => {
    track.enabled = enabled;
  });
});