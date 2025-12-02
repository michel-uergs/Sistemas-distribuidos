const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const rooms = {}; // <- armazena usuários por sala

io.on("connection", (socket) => {
    console.log("Novo cliente:", socket.id);

    // Criar ou entrar na sala
    socket.on("join-room", (roomId) => {
        console.log(`Cliente ${socket.id} pediu para entrar na sala ${roomId}`);

        // Se a sala não existe → cria
        if (!rooms[roomId]) {
            rooms[roomId] = [];
        }

        // Impedir duplicação de sala e duplicação de cliente
        if (!rooms[roomId].includes(socket.id)) {
            rooms[roomId].push(socket.id);
            socket.join(roomId);
        }

        console.log("Estado das salas:", rooms);

        // Se já existe alguém na sala → enviar "user-connected"
        const otherUsers = rooms[roomId].filter(id => id !== socket.id);

        if (otherUsers.length > 0) {
            console.log(`Notificando ${socket.id} sobre ${otherUsers[0]}`);
            socket.to(roomId).emit("user-connected", socket.id);
            socket.emit("user-connected", otherUsers[0]);
        }
    });

    // WebRTC: repasse de sinalização
    socket.on("offer", (data) => {
        socket.to(data.roomId).emit("offer", data);
    });

    socket.on("answer", (data) => {
        socket.to(data.roomId).emit("answer", data);
    });

    socket.on("ice-candidate", (data) => {
        socket.to(data.roomId).emit("ice-candidate", data);
    });

    socket.on("disconnect", () => {
        console.log("Cliente desconectou:", socket.id);

        for (const roomId in rooms) {
            rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);

            if (rooms[roomId].length === 0) {
                delete rooms[roomId];
            }
        }

        console.log("Estado atualizado:", rooms);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log("Servidor rodando na porta " + PORT);
});
