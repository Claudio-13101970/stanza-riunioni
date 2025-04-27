
const socket = io();
const videosContainer = document.getElementById('videosContainer');
const cameraSelect = document.getElementById('cameraSelect');
const micSelect = document.getElementById('micSelect');
const startButton = document.getElementById('startButton');
const shareButton = document.getElementById('shareButton');
const leaveButton = document.getElementById('leaveButton');

let localStream;
const peers = {};
const remoteStreams = {}; // to store remote streams for reattachment

async function getDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  cameraSelect.innerHTML = '';
  micSelect.innerHTML = '';
  devices.forEach(device => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.text = device.label || device.kind;
    if (device.kind === 'videoinput') cameraSelect.appendChild(option);
    if (device.kind === 'audioinput') micSelect.appendChild(option);
  });
  // Add off options
  const camOff = document.createElement('option');
  camOff.value = 'off'; camOff.text = 'Videocamera Spenta';
  cameraSelect.appendChild(camOff);
  const micOff = document.createElement('option');
  micOff.value = 'off'; micOff.text = 'Microfono Spento';
  micSelect.appendChild(micOff);
}

async function startVideo() {
  const constraints = {
    video: cameraSelect.value && cameraSelect.value !== 'off' ? { deviceId: { exact: cameraSelect.value } } : false,
    audio: micSelect.value && micSelect.value !== 'off' ? { deviceId: { exact: micSelect.value } } : false
  };
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  addVideoStream(localStream, socket.id, true);
  socket.emit('ready');
}

// Add or update video element
function addVideoStream(stream, id, muted = false) {
  let video = document.getElementById(id);
  if (!video) {
    video = document.createElement('video');
    video.id = id; video.autoplay = true; video.playsInline = true; video.muted = muted;
    videosContainer.appendChild(video);
  }
  video.srcObject = stream;
  video.classList.remove('avatar', 'fade-in');
  adjustVideoLayout();
}

// Layout adjust
function adjustVideoLayout() {
  const vids = document.querySelectorAll('video');
  let width = vids.length <= 2 ? '45%' : vids.length <= 4 ? '30%' : '22%';
  vids.forEach(v => v.style.width = width);
}

startButton.onclick = async () => { await startVideo(); };
shareButton.onclick = async () => {
  const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  const track = screenStream.getVideoTracks()[0];
  Object.values(peers).forEach(peer => {
    const sender = peer.getSenders().find(s => s.track.kind === 'video');
    if (sender) sender.replaceTrack(track);
  });
};
leaveButton.onclick = () => { socket.disconnect(); window.close(); };

// Signaling
socket.on('all-users', async (users) => {
  for (const id of users) {
    const peer = createPeer(id);
    peers[id] = peer;
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('signal', { to: id, signal: offer });
  }
});
socket.on('user-joined', id => {
  const peer = createPeer(id);
  peers[id] = peer;
});
socket.on('signal', async ({ from, signal }) => {
  if (!peers[from]) peers[from] = createPeer(from);
  if (signal.type === 'offer' || signal.type === 'answer') {
    await peers[from].setRemoteDescription(new RTCSessionDescription(signal));
    if (signal.type === 'offer') {
      const ans = await peers[from].createAnswer();
      await peers[from].setLocalDescription(ans);
      socket.emit('signal', { to: from, signal: ans });
    }
  } else if (signal.candidate) {
    await peers[from].addIceCandidate(new RTCIceCandidate(signal));
  }
});
socket.on('user-left', id => {
  if (peers[id]) { peers[id].close(); delete peers[id]; }
  const vid = document.getElementById(id);
  if (vid) { vid.classList.add('fade-out'); setTimeout(() => vid.remove(), 500); }
  adjustVideoLayout();
});

// Socket event for toggling video
socket.on('video-toggled', ({ id, enabled }) => {
  const vid = document.getElementById(id);
  if (!vid) return;
  if (!enabled) {
    vid.srcObject = null;
    vid.classList.add('avatar');
    setTimeout(() => vid.classList.add('fade-in'), 0);
  } else if (remoteStreams[id]) {
    vid.srcObject = remoteStreams[id];
    vid.classList.remove('avatar', 'fade-in');
  }
});

// Create peer and attach tracks & events
function createPeer(id) {
  const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  if (localStream) localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
  peer.onicecandidate = e => { if (e.candidate) socket.emit('signal', { to: id, signal: e.candidate }); };
  peer.ontrack = e => {
    remoteStreams[id] = e.streams[0];
    addVideoStream(e.streams[0], id);
  };
  return peer;
}

// Handle local camera toggle
cameraSelect.addEventListener('change', async () => {
  if (!localStream) return;
  const localVid = document.getElementById(socket.id);
  const enabled = cameraSelect.value !== 'off';
  const sender = Object.values(peers).flatMap(p => p.getSenders()).find(s => s.track.kind === 'video');
  if (!enabled) {
    if (sender) sender.replaceTrack(null);
    localVid.srcObject = null;
    localVid.classList.add('avatar');
    setTimeout(() => localVid.classList.add('fade-in'), 0);
  } else {
    const track = (await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: cameraSelect.value } } })).getVideoTracks()[0];
    if (sender) sender.replaceTrack(track);
    localStream.getVideoTracks().forEach(t => localStream.removeTrack(t));
    localStream.addTrack(track);
    localVid.srcObject = localStream;
    localVid.classList.remove('avatar', 'fade-in');
  }
  socket.emit('video-toggled', { id: socket.id, enabled });
});

// Handle mic toggle just locally
micSelect.addEventListener('change', async () => {
  if (!localStream) return;
  const enabled = micSelect.value !== 'off';
  const sender = Object.values(peers).flatMap(p => p.getSenders()).find(s => s.track.kind === 'audio');
  if (!enabled) {
    if (sender) sender.replaceTrack(null);
  } else {
    const track = (await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: micSelect.value } } })).getAudioTracks()[0];
    if (sender) sender.replaceTrack(track);
    localStream.getAudioTracks().forEach(t => localStream.removeTrack(t));
    localStream.addTrack(track);
  }
});
