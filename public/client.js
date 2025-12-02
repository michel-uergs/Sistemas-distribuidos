// ========================================
// CONFIGURAÇÃO E ESTADO
// ========================================

const socket = io();


// Estado da aplicação
const state = {
    localStream: null,
    currentRoomId: null,
    currentUserName: null,
    peerConnections: new Map(),
    audioEnabled: true,
    videoEnabled: true,
    isScreenSharing: false
};

// Configuração ICE (STUN servers públicos)
const iceConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ========================================
// ELEMENTOS DOM
// ========================================

// Lobby
const lobby = document.getElementById('lobby');
const userNameInput = document.getElementById('userName');
const roomIdInput = document.getElementById('roomId');
const createRoomBtn = document.getElementById('createRoom');
const joinRoomBtn = document.getElementById('joinRoom');

// Room
const room = document.getElementById('room');
const videoGrid = document.getElementById('videoGrid');
const localVideo = document.getElementById('localVideo');
const currentRoomIdSpan = document.getElementById('currentRoomId');
const participantCountSpan = document.getElementById('participantCount');
const copyRoomIdBtn = document.getElementById('copyRoomId');
const leaveRoomBtn = document.getElementById('leaveRoom');
const leaveCallBtn = document.getElementById('leaveCall');

// Controles
const toggleAudioBtn = document.getElementById('toggleAudio');
const toggleVideoBtn = document.getElementById('toggleVideo');
const shareScreenBtn = document.getElementById('shareScreen');

// Indicadores
const localAudioIndicator = document.getElementById('localAudioIndicator');
const localVideoIndicator = document.getElementById('localVideoIndicator');

// Toast e Loading
const toast = document.getElementById('toast');
const loading = document.getElementById('loading');

// ========================================
// FUNÇÕES UTILITÁRIAS
// ========================================

// Gerar ID aleatório para sala
function generateRoomId() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

// Mostrar notificação
function showToast(message, duration = 3000) {
    const toastMessage = toast.querySelector('.toast-message');
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, duration);
}

// Mostrar/ocultar loading
function showLoading(show = true) {
    if (show) {
        loading.classList.remove('hidden');
    } else {
        loading.classList.add('hidden');
    }
}

// Atualizar contagem de participantes
function updateParticipantCount() {
    const count = state.peerConnections.size + 1;
    participantCountSpan.textContent = `${count} participante${count !== 1 ? 's' : ''}`;
}

// ========================================
// EVENTOS DO LOBBY
// ========================================

// Criar nova sala
createRoomBtn.addEventListener('click', () => {
    const userName = userNameInput.value.trim();
    
    if (!userName) {
        showToast('⚠️ Por favor, digite seu nome');
        return;
    }
    
    const roomId = generateRoomId();
    joinCall(roomId, userName);
});

// Entrar em sala existente
joinRoomBtn.addEventListener('click', () => {
    const userName = userNameInput.value.trim();
    const roomId = roomIdInput.value.trim();
    
    if (!userName) {
        showToast('⚠️ Por favor, digite seu nome');
        return;
    }
    
    if (!roomId) {
        showToast('⚠️ Por favor, digite o código da sala');
        return;
    }
    
    joinCall(roomId.toUpperCase(), userName);
});

// Permitir Enter para criar/entrar
roomIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinRoomBtn.click();
    }
});

userNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        if (roomIdInput.value.trim()) {
            joinRoomBtn.click();
        } else {
            createRoomBtn.click();
        }
    }
});

// ========================================
// FUNÇÕES DE VIDEOCHAMADA
// ========================================

// Entrar na chamada
async function joinCall(roomId, userName) {
    try {
        showLoading(true);
        
        state.currentRoomId = roomId;
        state.currentUserName = userName;
        
        // Obter stream de mídia local
        state.localStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        localVideo.srcObject = state.localStream;
        
        // Atualizar UI
        lobby.classList.add('hidden');
        room.classList.remove('hidden');
        currentRoomIdSpan.textContent = roomId;
        
        // Entrar na sala via Socket.io
        socket.emit('join-room', roomId, userName);
        
        showLoading(false);
        showToast(`✅ Você entrou na sala: ${roomId}`);
        
    } catch (error) {
        console.error('Erro ao acessar mídia:', error);
        showLoading(false);
        showToast('❌ Erro ao acessar câmera/microfone. Verifique as permissões.');
    }
}

// Criar conexão peer-to-peer
async function createPeerConnection(userId) {
    const peerConnection = new RTCPeerConnection(iceConfiguration);
    state.peerConnections.set(userId, peerConnection);
    
    // Adicionar tracks locais
    state.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, state.localStream);
    });
    
    // Lidar com ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', userId, event.candidate);
        }
    };
    
    // Receber stream remoto
    peerConnection.ontrack = (event) => {
        const remoteStream = event.streams[0];
        addRemoteVideo(userId, remoteStream);
    };
    
    // Monitorar estado da conexão
    peerConnection.onconnectionstatechange = () => {
        console.log(`Conexão com ${userId}: ${peerConnection.connectionState}`);
        
        if (peerConnection.connectionState === 'failed') {
            showToast('⚠️ Falha na conexão com um participante');
        }
    };
    
    return peerConnection;
}

// Adicionar vídeo remoto
function addRemoteVideo(userId, stream) {
    // Remover vídeo existente se houver
    const existingWrapper = document.getElementById(`video-${userId}`);
    if (existingWrapper) {
        existingWrapper.remove();
    }
    
    // Criar elementos
    const wrapper = document.createElement('div');
    wrapper.className = 'video-wrapper';
    wrapper.id = `video-${userId}`;
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsinline = true;
    
    const overlay = document.createElement('div');
    overlay.className = 'video-overlay';
    
    const info = document.createElement('div');
    info.className = 'video-info';
    
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = 'Participante';
    
    const indicators = document.createElement('div');
    indicators.className = 'indicators';
    
    const audioIndicator = document.createElement('span');
    audioIndicator.className = 'indicator';
    audioIndicator.id = `audio-${userId}`;
    audioIndicator.textContent = '🎤';
    
    const videoIndicator = document.createElement('span');
    videoIndicator.className = 'indicator';
    videoIndicator.id = `video-${userId}`;
    videoIndicator.textContent = '📹';
    
    indicators.appendChild(audioIndicator);
    indicators.appendChild(videoIndicator);
    info.appendChild(name);
    info.appendChild(indicators);
    overlay.appendChild(info);
    
    wrapper.appendChild(video);
    wrapper.appendChild(overlay);
    videoGrid.appendChild(wrapper);
    
    updateParticipantCount();
}

// Remover vídeo remoto
function removeRemoteVideo(userId) {
    const wrapper = document.getElementById(`video-${userId}`);
    if (wrapper) {
        wrapper.remove();
    }
    updateParticipantCount();
}

// ========================================
// SOCKET.IO EVENTS
// ========================================

// Usuários já na sala
socket.on('room-users', async (userIds) => {
    console.log('Usuários na sala:', userIds);
    
    for (const userId of userIds) {
        const peerConnection = await createPeerConnection(userId);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', userId, offer);
    }
});

// Novo usuário conectado
socket.on('user-connected', (userId, userName) => {
    console.log(`${userName} entrou`);
    showToast(`👋 ${userName} entrou na chamada`);
});

// Receber oferta
socket.on('offer', async (userId, offer) => {
    console.log('Oferta recebida de:', userId);
    
    const peerConnection = await createPeerConnection(userId);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    socket.emit('answer', userId, answer);
});

// Receber resposta
socket.on('answer', async (userId, answer) => {
    console.log('Resposta recebida de:', userId);
    
    const peerConnection = state.peerConnections.get(userId);
    if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

// Receber ICE candidate
socket.on('ice-candidate', async (userId, candidate) => {
    const peerConnection = state.peerConnections.get(userId);
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Erro ao adicionar ICE candidate:', error);
        }
    }
});

// Usuário desconectado
socket.on('user-disconnected', (userId) => {
    console.log('Usuário desconectado:', userId);
    
    const peerConnection = state.peerConnections.get(userId);
    if (peerConnection) {
        peerConnection.close();
        state.peerConnections.delete(userId);
    }
    
    removeRemoteVideo(userId);
    showToast('👋 Um participante saiu da chamada');
});

// Toggle de áudio remoto
socket.on('user-audio-toggle', (userId, enabled) => {
    const indicator = document.getElementById(`audio-${userId}`);
    if (indicator) {
        if (enabled) {
            indicator.classList.remove('off');
        } else {
            indicator.classList.add('off');
        }
    }
});

// Toggle de vídeo remoto
socket.on('user-video-toggle', (userId, enabled) => {
    const indicator = document.getElementById(`video-${userId}`);
    if (indicator) {
        if (enabled) {
            indicator.classList.remove('off');
        } else {
            indicator.classList.add('off');
        }
    }
});

// ========================================
// CONTROLES DE MÍDIA
// ========================================

// Toggle Áudio
toggleAudioBtn.addEventListener('click', () => {
    state.audioEnabled = !state.audioEnabled;
    
    const audioTrack = state.localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = state.audioEnabled;
    }
    
    // Atualizar UI
    if (state.audioEnabled) {
        toggleAudioBtn.classList.add('active');
        localAudioIndicator.classList.remove('off');
    } else {
        toggleAudioBtn.classList.remove('active');
        localAudioIndicator.classList.add('off');
    }
    
    socket.emit('toggle-audio', state.currentRoomId, state.audioEnabled);
    showToast(state.audioEnabled ? '🎤 Microfone ligado' : '🔇 Microfone desligado');
});

// Toggle Vídeo
toggleVideoBtn.addEventListener('click', () => {
    state.videoEnabled = !state.videoEnabled;
    
    const videoTrack = state.localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = state.videoEnabled;
    }
    
    // Atualizar UI
    if (state.videoEnabled) {
        toggleVideoBtn.classList.add('active');
        localVideoIndicator.classList.remove('off');
    } else {
        toggleVideoBtn.classList.remove('active');
        localVideoIndicator.classList.add('off');
    }
    
    socket.emit('toggle-video', state.currentRoomId, state.videoEnabled);
    showToast(state.videoEnabled ? '📹 Câmera ligada' : '🚫 Câmera desligada');
});

// Compartilhar Tela
shareScreenBtn.addEventListener('click', async () => {
    if (state.isScreenSharing) {
        // Parar compartilhamento
        stopScreenSharing();
        return;
    }
    
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always'
            },
            audio: false
        });
        
        const screenTrack = screenStream.getVideoTracks()[0];
        
        // Substituir track de vídeo em todas as conexões
        state.peerConnections.forEach(pc => {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(screenTrack);
            }
        });
        
        // Atualizar vídeo local
        localVideo.srcObject = screenStream;
        state.isScreenSharing = true;
        shareScreenBtn.classList.add('active');
        
        // Quando parar de compartilhar
        screenTrack.onended = () => {
            stopScreenSharing();
        };
        
        showToast('🖥️ Compartilhando tela');
        
    } catch (error) {
        console.error('Erro ao compartilhar tela:', error);
        showToast('❌ Erro ao compartilhar tela');
    }
});

function stopScreenSharing() {
    const videoTrack = state.localStream.getVideoTracks()[0];
    
    // Restaurar track de vídeo original
    state.peerConnections.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
            sender.replaceTrack(videoTrack);
        }
    });
    
    localVideo.srcObject = state.localStream;
    state.isScreenSharing = false;
    shareScreenBtn.classList.remove('active');
    
    showToast('⏹️ Compartilhamento encerrado');
}

// Copiar ID da sala
copyRoomIdBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(state.currentRoomId)
        .then(() => {
            showToast('📋 Código copiado!');
        })
        .catch(() => {
            showToast('❌ Erro ao copiar código');
        });
});

// Sair da sala
function leaveCall() {
    // Parar todos os tracks
    if (state.localStream) {
        state.localStream.getTracks().forEach(track => track.stop());
    }
    
    // Fechar todas as conexões
    state.peerConnections.forEach(pc => pc.close());
    state.peerConnections.clear();
    
    // Remover vídeos remotos
    const remoteVideos = videoGrid.querySelectorAll('.video-wrapper:not(#localVideoWrapper)');
    remoteVideos.forEach(video => video.remove());
    
    // Resetar estado
    state.localStream = null;
    state.currentRoomId = null;
    state.currentUserName = null;
    state.audioEnabled = true;
    state.videoEnabled = true;
    state.isScreenSharing = false;
    
    // Resetar UI
    toggleAudioBtn.classList.add('active');
    toggleVideoBtn.classList.add('active');
    shareScreenBtn.classList.remove('active');
    localAudioIndicator.classList.remove('off');
    localVideoIndicator.classList.remove('off');
    
    // Voltar para lobby
    room.classList.add('hidden');
    lobby.classList.remove('hidden');
    
    // Reconectar socket
    socket.disconnect();
    socket.connect();
    
    showToast('👋 Você saiu da chamada');
}

leaveRoomBtn.addEventListener('click', leaveCall);
leaveCallBtn.addEventListener('click', leaveCall);

// ========================================
// TRATAMENTO DE ERROS
// ========================================

window.addEventListener('error', (event) => {
    console.error('Erro:', event.error);
});

socket.on('connect_error', (error) => {
    console.error('Erro de conexão:', error);
    showToast('❌ Erro de conexão com o servidor');
});

socket.on('disconnect', () => {
    console.log('Desconectado do servidor');
});

console.log('🎥 VideoCall Client carregado!');