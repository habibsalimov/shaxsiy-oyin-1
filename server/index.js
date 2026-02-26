import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import path from "path";
import { GameManager } from "./GameManager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
  pingInterval: 5000,
  pingTimeout: 10000,
});

const gm = new GameManager();

// Serve static files in production
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

function broadcastState(room) {
  const state = gm.getGameState(room);
  io.to(room.code).emit("game-state", state);
}

// Latency ping
setInterval(() => {
  io.sockets.sockets.forEach((socket) => {
    socket.emit("ping-latency", Date.now());
  });
}, 5000);

io.on("connection", (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on("pong-latency", (ts) => {
    const room = gm.getRoomForSocket(socket.id);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (player) player.latency = Date.now() - ts;
  });

  socket.on("create-room", (data) => {
    const { code, room } = gm.createRoom(socket.id, data);
    socket.join(code);
    socket.emit("room-created", { code });
    broadcastState(room);
  });

  socket.on("join-room", (data) => {
    const result = gm.joinRoom(socket.id, data);
    if (result.error) {
      socket.emit("error", { message: result.error });
      return;
    }
    socket.join(result.room.code);
    // If host reconnected, re-emit room-created so client restores host screen
    if (result.isHost) {
      socket.emit("room-created", { code: result.room.code });
    }
    broadcastState(result.room);
  });

  socket.on("start-timer", (data) => {
    const result = gm.startTimer(socket.id, data);
    if (!result) return;

    io.to(result.room.code).emit("timer-started", {
      ti: result.ti, ni: result.ni, timerEnd: result.timerEnd
    });

    // Set up server-side timer expiry
    clearTimeout(result.room.timerTimeout);
    result.room.timerTimeout = setTimeout(() => {
      gm.handleTimerExpiry(result.room, result.ti, result.ni);
      io.to(result.room.code).emit("timer-expired", { ti: result.ti, ni: result.ni });
      broadcastState(result.room);
    }, result.ms);

    broadcastState(result.room);
  });

  socket.on("buzz", () => {
    const result = gm.buzz(socket.id);
    if (!result) return;
    io.to(result.room.code).emit("buzz-update", { buzzOrder: result.room.buzzOrder });
    broadcastState(result.room);
  });

  socket.on("judge", (data) => {
    const result = gm.judge(socket.id, data);
    if (!result) return;
    broadcastState(result.room);
  });

  socket.on("skip-question", (data) => {
    const result = gm.skipQuestion(socket.id, data);
    if (!result) return;
    broadcastState(result.room);
  });

  socket.on("lock-room", () => {
    const result = gm.lockRoom(socket.id);
    if (!result) return;
    broadcastState(result.room);
  });

  socket.on("block-player", (data) => {
    const result = gm.blockPlayer(socket.id, data);
    if (!result) return;
    broadcastState(result.room);
  });

  socket.on("remove-player", (data) => {
    const result = gm.removePlayer(socket.id, data);
    if (!result) return;
    io.to(result.room.code).emit("player-removed", { playerId: data.playerId });
    broadcastState(result.room);
  });

  socket.on("finish-game", () => {
    const result = gm.finishGame(socket.id);
    if (!result) return;
    io.to(result.room.code).emit("game-finished", { finalResult: result.result });
  });

  socket.on("disconnect", () => {
    console.log(`[disconnect] ${socket.id}`);
    const result = gm.handleDisconnect(socket.id);
    if (!result) return;
    broadcastState(result.room);
  });
});

const PORT = process.env.PORT || 3010;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
