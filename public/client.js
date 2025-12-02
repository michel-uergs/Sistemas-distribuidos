// public/script.js
const socket = io();

const state = {
  localStream: null,
  peers: new Map(), // socketId -> RTCPeerConnection
  roomId: null,
  userName: null
};

const iceConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// DOM
const lobby = document.getElementById("lobby");
const roomEl = document.getElementById("room");
const userNameInput = document.getElementById("userName");
const roomIdInput = document.getElementById("roomId");
const createRoomBtn = document.getElementById("createRoom");
const joinRoomBtn = document.getElementById("joinRoom");
const currentRoomIdSpan = document.getElementById("currentRoomId");
const leaveCallBtn = document.getElementById("leaveCall");
const videoGrid = document.getElementById("videoGrid");
const localVideo = document.getElementById("localVideo");

// util
function generateRoomId() { return Math.random().toString(36).substr(2,8).toUpperCase(); }
function addRemoteVideo(id, stream) {
  if (document.getElementById("video-" + id)) return;
  const v = document.createElement("video");
  v.id = "video-" + id;
  v.autoplay = true;
  v.playsInline = true;
  v.srcObject = stream;
  videoGrid.appendChild(v);
}
function removeRemoteVideo(id) {
  const el = document.getElementById("video-" + id);
  if (el) el.remove();
}

// create peer and attach tracks
async function createPeer(remoteId, isInitiator) {
  const pc = new RTCPeerConnection(iceConfig);
  state.peers.set(remoteId, pc);

  // add local tracks
  state.localStream.getTracks().forEach(t => pc.addTrack(t, state.localStream));

  pc.ontrack = (e) => { addRemoteVideo(remoteId, e.streams[0]); };

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("ice-candidate", remoteId, e.candidate);
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "disconnected" || pc.connectionState === "closed") {
      removeRemoteVideo(remoteId);
    }
  };

  if (isInitiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("offer", remoteId, offer);
  }

  return pc;
}

// UI handlers
createRoomBtn.onclick = () => {
  const name = userNameInput.value.trim();
  if (!name) return alert("Digite seu nome");
  const id = generateRoomId();
  joinCall(id, name);
};

joinRoomBtn.onclick = () => {
  const name = userNameInput.value.trim();
  const id = roomIdInput.value.trim();
  if (!name) return alert("Digite seu nome");
  if (!id) return alert("Digite o código da sala");
  joinCall(id.toUpperCase(), name);
};

leaveCallBtn.onclick = () => {
  // close pcs
  state.peers.forEach(pc => pc.close());
  state.peers.clear();
  if (state.localStream) state.localStream.getTracks().forEach(t => t.stop());
  // UI
  roomEl.style.display = "none";
  lobby.style.display = "";
  // disconnect socket (or emit leave event if you want to be graceful)
  socket.disconnect();
  setTimeout(() => socket.connect(), 500);
};

// join
async function joinCall(roomId, userName) {
  state.roomId = roomId;
  state.userName = userName;
  currentRoomIdSpan.textContent = roomId;

  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
    localVideo.srcObject = state.localStream;
  } catch (err) {
    return alert("Erro ao acessar câmera: " + err.message);
  }

  lobby.style.display = "none";
  roomEl.style.display = "";

  socket.emit("join-room", roomId, userName);
}

// SOCKET EVENTS

socket.on("room-users", async (userIds) => {
  // para cada usuário já presente, crie peer como initiator
  for (const id of userIds) {
    if (id === socket.id) continue;
    if (state.peers.has(id)) continue;
    await createPeer(id, true); // initiator
  }
});

socket.on("user-connected", async (userId, userName) => {
  // usuário novo chegou — iniciamos a conexão do lado que entrou antes?
  // se já temos localStream, criamos peer não-initiator (a outra ponta fará offer)
  if (!state.localStream) return;
  if (state.peers.has(userId)) return;
  await createPeer(userId, false);
});

socket.on("offer", async (fromId, offer) => {
  // receber offer -> criar pc se necessário, setRemoteDescription, responder
  let pc = state.peers.get(fromId);
  if (!pc) pc = await createPeer(fromId, false);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("answer", fromId, answer);
});

socket.on("answer", async (fromId, answer) => {
  const pc = state.peers.get(fromId);
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }
});

socket.on("ice-candidate", async (fromId, candidate) => {
  const pc = state.peers.get(fromId);
  if (pc) {
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch (e) { console.warn("ICE add failed", e); }
  }
});

socket.on("user-disconnected", (userId) => {
  const pc = state.peers.get(userId);
  if (pc) pc.close();
  state.peers.delete(userId);
  removeRemoteVideo(userId);
});

// debug
socket.on("connect", () => console.log("Socket connected", socket.id));
socket.on("disconnect", () => console.log("Socket disconnected"));
