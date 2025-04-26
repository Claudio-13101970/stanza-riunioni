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
}

async function startVideo() {
  const constraints = {
    video: { deviceId: cameraSelect.value ? { exact: cameraSelect.value } : undefined },
    audio: { deviceId: micSelect.value ? { exact: micSelect.value } : undefined }
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
  await getDevices();
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
  window.location.reload();
};

socket.on('user-connected', async (id) => {
  const peer = createPeer(id);
  peers[id] = peer;
  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
});

socket.on('signal', async ({ from, signal }) => {
  if (!peers[from]) {
    const peer = createPeer(from);
    peers[from] = peer;
    localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
  }
  await peers[from].setRemoteDescription(new RTCSessionDescription(signal));
  if (signal.type === 'offer') {
    const answer = await peers[from].createAnswer();
    await peers[from].setLocalDescription(answer);
    socket.emit('signal', { to: from, signal: answer });
  }
});

socket.on('user-disconnected', (id) => {
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