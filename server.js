const express = require("express");
const { Server } = require("socket.io");
const path = require("path");
const app = express();

// Porta dinâmica do Render (fallback 3000 para desenvolvimento local)
const PORT = process.env.PORT || 3000;

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, "public")));

// Criar servidor HTTP (Render exige HTTP)
const http = require("http");
const server = http.createServer(app);

// Criar servidor WebSocket
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Lista de salas
let rooms = {};

io.on("connection", (socket) => {
    console.log("Novo cliente conectado:", socket.id);

    // Listar salas atuais
    socket.emit("rooms", Object.keys(rooms));

    // Criar sala
    socket.on("createRoom", (room) => {
        if (!rooms[room]) {
            rooms[room] = [];
        }
        rooms[room].push(socket.id);

        socket.join(room);
        io.emit("rooms", Object.keys(rooms)); // Atualiza a lista para todos
        console.log(`Sala criada: ${room}`);
    });

    // Entrar na sala
    socket.on("joinRoom", (room) => {
        if (!rooms[room]) {
            socket.emit("error", "Sala não existe!");
            return;
        }

        rooms[room].push(socket.id);
        socket.join(room);
        console.log(`Cliente ${socket.id} entrou na sala ${room}`);
    });

    // WebRTC Signaling
    socket.on("offer", (data) => {
        socket.to(data.room).emit("offer", data);
    });

    socket.on("answer", (data) => {
        socket.to(data.room).emit("answer", data);
    });

    socket.on("candidate", (data) => {
        socket.to(data.room).emit("candidate", data);
    });

    // Desconectar
    socket.on("disconnect", () => {
        for (const room in rooms) {
            rooms[room] = rooms[room].filter(id => id !== socket.id);
            if (rooms[room].length === 0) delete rooms[room];
        }
        io.emit("rooms", Object.keys(rooms));
        console.log("Cliente desconectado:", socket.id);
    });
});

// Iniciar servidor HTTP
server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
