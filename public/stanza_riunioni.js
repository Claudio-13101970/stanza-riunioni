const socket = io();

const videosDiv = document.getElementById('videos');
const startButton = document.getElementById('startButton');
const shareButton = document.getElementById('shareButton');
const leaveButton = document.getElementById('leaveButton');
const cameraSelect = document.getElementById('cameraSelect');
const microphoneSelect = document.getElementById('microphoneSelect');

let localStream;
let peers = {};

async function getDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  cameraSelect.innerHTML = '';
  microphoneSelect.innerHTML = '';

  devices.forEach(device => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.text = device.label || device.kind;

    if (device.kind === 'videoinput') {
      cameraSelect.appendChild(option);
    } else if (device.kind === 'audioinput') {
      microphoneSelect.appendChild(option);
    }
  });
}

startButton.onclick = async () => {
  await startLocalStream();
};

shareButton.onclick = async () => {
  const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  const screenTrack = screenStream.getTracks()[0];
  for (let id in peers) {
    let sender = peers[id].getSenders().find(s => s.track.kind === 'video');
    if (sender) sender.replaceTrack(screenTrack);
  }
};

leaveButton.onclick = () => {
  socket.disconnect();
  window.location.href = '/';
};

async function startLocalStream() {
  const constraints = {
    video: { deviceId: cameraSelect.value ? { exact: cameraSelect.value } : undefined },
    audio: { deviceId: microphoneSelect.value ? { exact: microphoneSelect.value } : undefined }
  };
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  const localVideo = document.createElement('video');
  localVideo.srcObject = localStream;
  localVideo.muted = true;
  localVideo.autoplay = true;
  localVideo.playsInline = true;
  videosDiv.appendChild(localVideo);

  socket.emit('offer', { offer: await createOffer() });
}

async function createOffer() {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  pc.ontrack = (event) => {
    const remoteVideo = document.createElement('video');
    remoteVideo.srcObject = event.streams[0];
    remoteVideo.autoplay = true;
    remoteVideo.playsInline = true;
    videosDiv.appendChild(remoteVideo);
  };
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('candidate', { candidate: event.candidate });
    }
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return offer;
}

socket.on('user-disconnected', (id) => {
  if (peers[id]) {
    peers[id].close();
    delete peers[id];
    refreshVideos();
  }
});

async function refreshVideos() {
  videosDiv.innerHTML = '';
  if (localStream) {
    const localVideo = document.createElement('video');
    localVideo.srcObject = localStream;
    localVideo.muted = true;
    localVideo.autoplay = true;
    localVideo.playsInline = true;
    videosDiv.appendChild(localVideo);
  }
}

getDevices();