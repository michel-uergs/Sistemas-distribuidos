// server.js
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const PORT = process.env.PORT || 3000;

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

// rooms: { roomId: { sockets: Set, users: Map(socketId -> userName) } }
const rooms = {};

io.on("connection", (socket) => {
  console.log("Novo cliente:", socket.id);

  // Quando o cliente pede para entrar ou criar uma sala
  // Fazemos a verificação: se não existe criamos, se existe apenas entra
  socket.on("join-room", (roomId, userName) => {
    roomId = String(roomId).toUpperCase();
    console.log(`${socket.id} solicita entrar na sala ${roomId} como ${userName}`);

    if (!rooms[roomId]) {
      rooms[roomId] = { sockets: new Set(), users: new Map() };
      console.log(`Sala criada: ${roomId}`);
    }

    // evitar duplicados
    if (!rooms[roomId].sockets.has(socket.id)) {
      rooms[roomId].sockets.add(socket.id);
      rooms[roomId].users.set(socket.id, userName || "Participante");
      socket.join(roomId);
    }

    // Enviar lista de outros usuários na sala ao que entrou
    const others = [...rooms[roomId].sockets].filter(id => id !== socket.id);
    socket.emit("room-users", others);

    // Notificar os outros na sala que chegou alguém (com id e nome)
    socket.to(roomId).emit("user-connected", socket.id, userName);

    // Emitir estado das salas para todos (opcional)
    io.emit("rooms", Object.keys(rooms));
  });

  // Signaling: offer, answer, ice
  socket.on("offer", (targetId, offer) => {
    io.to(targetId).emit("offer", socket.id, offer);
  });

  socket.on("answer", (targetId, answer) => {
    io.to(targetId).emit("answer", socket.id, answer);
  });

  socket.on("ice-candidate", (targetId, candidate) => {
    io.to(targetId).emit("ice-candidate", socket.id, candidate);
  });

  // Toggle audio/video
  socket.on("toggle-audio", (roomId, enabled) => {
    const room = rooms[roomId];
    if (room && room.sockets.has(socket.id)) {
      io.to(roomId).emit("user-audio-toggle", socket.id, enabled);
    }
  });

  socket.on("toggle-video", (roomId, enabled) => {
    const room = rooms[roomId];
    if (room && room.sockets.has(socket.id)) {
      io.to(roomId).emit("user-video-toggle", socket.id, enabled);
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("Disconnect:", socket.id);
    // Remover das salas
    for (const roomId of Object.keys(rooms)) {
      const room = rooms[roomId];
      if (room.sockets.has(socket.id)) {
        room.sockets.delete(socket.id);
        room.users.delete(socket.id);
        socket.to(roomId).emit("user-disconnected", socket.id);
        if (room.sockets.size === 0) {
          delete rooms[roomId];
          console.log(`Sala removida: ${roomId}`);
        }
      }
    }
    io.emit("rooms", Object.keys(rooms));
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando em http://0.0.0.0:${PORT}`);
});
