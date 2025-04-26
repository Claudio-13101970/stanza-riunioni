const socket = io();
let localStream;
let peerConnection;
let remoteStreams = {};
const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const localVideo = document.getElementById('localVideo');
const videosContainer = document.getElementById('videos');
const cameraSelect = document.getElementById('cameraSelect');
const microphoneSelect = document.getElementById('microphoneSelect');
const startButton = document.getElementById('startButton');
const shareScreenButton = document.getElementById('shareScreenButton');

async function enumerateDevices() {
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
  const constraints = {
    video: { deviceId: cameraSelect.value ? { exact: cameraSelect.value } : undefined },
    audio: { deviceId: microphoneSelect.value ? { exact: microphoneSelect.value } : undefined }
  };
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  localVideo.srcObject = localStream;

  peerConnection = new RTCPeerConnection(configuration);
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  peerConnection.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit('new-ice-candidate', candidate);
  };

  peerConnection.ontrack = (event) => {
    if (!remoteStreams[event.streams[0].id]) {
      const newVideo = document.createElement('video');
      newVideo.autoplay = true;
      newVideo.playsInline = true;
      newVideo.srcObject = event.streams[0];
      videosContainer.appendChild(newVideo);
      remoteStreams[event.streams[0].id] = newVideo;
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('video-offer', offer);
};

shareScreenButton.onclick = async () => {
  const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  const screenTrack = screenStream.getTracks()[0];
  const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
  sender.replaceTrack(screenTrack);
  screenTrack.onended = async () => {
    const videoTrack = localStream.getVideoTracks()[0];
    sender.replaceTrack(videoTrack);
  };
};

socket.on('video-offer', async (offer) => {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection(configuration);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('new-ice-candidate', candidate);
    };

    peerConnection.ontrack = (event) => {
      if (!remoteStreams[event.streams[0].id]) {
        const newVideo = document.createElement('video');
        newVideo.autoplay = true;
        newVideo.playsInline = true;
        newVideo.srcObject = event.streams[0];
        videosContainer.appendChild(newVideo);
        remoteStreams[event.streams[0].id] = newVideo;
      }
    };
  }
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
    console.error('Errore ICE candidate', error);
  }
});

enumerateDevices();
navigator.mediaDevices.ondevicechange = enumerateDevices;
