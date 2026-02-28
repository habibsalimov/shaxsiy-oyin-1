import { io } from "socket.io-client";

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io({
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    // Respond to latency pings from server
    socket.on("ping-latency", (ts) => {
      socket.emit("pong-latency", ts);
    });

    // Auto-rejoin room on connect (handles both page refresh and socket reconnect)
    socket.on("connect", () => {
      const raw = sessionStorage.getItem("game-session");
      if (!raw) return;
      try {
        const session = JSON.parse(raw);
        if (session && session.roomCode) {
          socket.emit("join-room", {
            code: session.roomCode,
            playerName: session.playerName || "Host",
            isHost: !!session.isHost,
          });
        }
      } catch (e) {
        // Corrupt session data, ignore
      }
    });
  }
  return socket;
}

export function emitEvent(event, data) {
  const s = getSocket();
  s.emit(event, data);
}

export function onEvent(event, callback) {
  const s = getSocket();
  s.on(event, callback);
  return () => s.off(event, callback);
}

export function offEvent(event, callback) {
  const s = getSocket();
  s.off(event, callback);
}

export function getSocketId() {
  return getSocket().id;
}
