const socket = io();

let localStream;
let remoteStream;
let peerConnection;
const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startButton = document.getElementById('startButton');
const shareScreenButton = document.getElementById('shareScreenButton');
const audioSelect = document.getElementById('audioSelect');
const videoSelect = document.getElementById('videoSelect');

startButton.addEventListener('click', start);
shareScreenButton.addEventListener('click', shareScreen);

async function enumerateDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  audioSelect.innerHTML = '';
  videoSelect.innerHTML = '';
  devices.forEach(device => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.text = device.label || `${device.kind}`;
    if (device.kind === 'audioinput') audioSelect.appendChild(option);
    if (device.kind === 'videoinput') videoSelect.appendChild(option);
  });
}

async function start() {
  const constraints = {
    video: { deviceId: videoSelect.value ? { exact: videoSelect.value } : undefined },
    audio: { deviceId: audioSelect.value ? { exact: audioSelect.value } : undefined }
  };
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  localVideo.srcObject = localStream;

  peerConnection = new RTCPeerConnection(configuration);

  peerConnection.ontrack = event => {
    if (!remoteStream) {
      remoteStream = new MediaStream();
      remoteVideo.srcObject = remoteStream;
    }
    remoteStream.addTrack(event.track);
  };

  peerConnection.onicecandidate = event => {
    if (event.candidate) socket.emit('new-ice-candidate', event.candidate);
  };

  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('video-offer', offer);
}

async function shareScreen() {
  const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  const screenTrack = screenStream.getTracks()[0];
  const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
  sender.replaceTrack(screenTrack);

  screenTrack.onended = async () => {
    const videoTrack = localStream.getVideoTracks()[0];
    sender.replaceTrack(videoTrack);
  };
}

socket.on('video-offer', async (offer) => {
  if (!peerConnection) await start();
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('video-answer', answer);
});

socket.on('video-answer', async (answer) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('new-ice-candidate', async (candidate) => {
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    console.error('Errore ICE', error);
  }
});

enumerateDevices();
