const socket = io();
const videosContainer = document.getElementById('videosContainer');
const cameraSelect = document.getElementById('cameraSelect');
const micSelect = document.getElementById('micSelect');
const startButton = document.getElementById('startButton');
const shareButton = document.getElementById('shareButton');
const leaveButton = document.getElementById('leaveButton');

let localStream;
const peers = {};

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
    addVideoStream(event.streams[0], id);
  };

  return peer;
}

// Carica dispositivi appena apre
window.addEventListener('DOMContentLoaded', getDevices);

// Cambio dinamico dei dispositivi
cameraSelect.addEventListener('change', async () => {
  if (!localStream) return;

  const localVideo = document.getElementById(socket.id);

  if (cameraSelect.value === 'off') {
    // Spegni videocamera
    const sender = Object.values(peers)
      .flatMap(peer => peer.getSenders())
      .find(s => s.track.kind === 'video');
    if (sender) sender.replaceTrack(null);
    // Rimuovi lo stream e mostra avatar
    localVideo.srcObject = null;
    localVideo.classList.add('avatar');
    // forza il fade-in
    setTimeout(() => localVideo.classList.add('fade-in'), 0);
  } else {
    // Riaccendi videocamera
    const videoTrack = (await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: cameraSelect.value } }
    })).getVideoTracks()[0];
    const sender = Object.values(peers)
      .flatMap(peer => peer.getSenders())
      .find(s => s.track.kind === 'video');
    if (sender) sender.replaceTrack(videoTrack);
    // aggiorna localStream
    const localSender = localStream.getVideoTracks()[0];
    localStream.removeTrack(localSender);
    localStream.addTrack(videoTrack);
    // ripristina stream e rimuovi avatar
    localVideo.srcObject = localStream;
    localVideo.classList.remove('avatar', 'fade-in');
  }
});

micSelect.addEventListener('change', async () => {
  if (!localStream) return;

  if (micSelect.value === 'off') {
    const sender = Object.values(peers).flatMap(peer => peer.getSenders()).find(s => s.track.kind === 'audio');
    if (sender) sender.replaceTrack(null);
  } else {
    const audioTrack = (await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: micSelect.value } } })).getAudioTracks()[0];
    const sender = Object.values(peers).flatMap(peer => peer.getSenders()).find(s => s.track.kind === 'audio');
    if (sender) sender.replaceTrack(audioTrack);
    const localSender = localStream.getAudioTracks()[0];
    localStream.removeTrack(localSender);
    localStream.addTrack(audioTrack);
  }
});