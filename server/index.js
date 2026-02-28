import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import path from "path";
import { GameManager } from "./GameManager.js";
import { saveResult, getResult, listResults } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
  pingInterval: 5000,
  pingTimeout: 10000,
  maxHttpBufferSize: 10e6, // 10MB for base64 image attachments
});

const gm = new GameManager();

// Serve static files in production
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));

// REST API for game results
app.get("/api/results", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  res.json(listResults(limit));
});

app.get("/api/results/:id", (req, res) => {
  const result = getResult(req.params.id);
  if (!result) return res.status(404).json({ error: "Natija topilmadi" });
  res.json(result);
});

// SPA catch-all (must be after API routes)
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

  socket.on("start-game", () => {
    const result = gm.startGame(socket.id);
    if (!result) return;
    if (result.error) {
      socket.emit("error", { message: result.error });
      return;
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
    if (result.falstart) {
      io.to(result.room.code).emit("falstart-caught", { playerId: socket.id });
    }
    if (result.room.buzzOrder.length > 0) {
      io.to(result.room.code).emit("buzz-update", { buzzOrder: result.room.buzzOrder });
    }
    broadcastState(result.room);
  });

  socket.on("judge", (data) => {
    const result = gm.judge(socket.id, data);
    if (!result) return;
    broadcastState(result.room);
  });

  socket.on("correct-score", (data) => {
    const result = gm.correctScore(socket.id, data);
    if (!result) return;
    broadcastState(result.room);
  });

  socket.on("skip-question", (data) => {
    const result = gm.skipQuestion(socket.id, data);
    if (!result) return;
    broadcastState(result.room);
  });

  socket.on("set-attachment", (data) => {
    const result = gm.setAttachment(socket.id, data);
    if (!result) return;
    broadcastState(result.room);
  });

  socket.on("remove-attachment", (data) => {
    const result = gm.removeAttachment(socket.id, data);
    if (!result) return;
    broadcastState(result.room);
  });

  socket.on("add-topic", (data) => {
    const result = gm.addTopic(socket.id, data || {});
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
    const id = Math.random().toString(36).slice(2, 8).toUpperCase();
    try { saveResult(id, result.room.hostName, result.result); } catch (e) { console.error("DB save error:", e); }
    io.to(result.room.code).emit("game-finished", { finalResult: { id, ...result.result } });
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
