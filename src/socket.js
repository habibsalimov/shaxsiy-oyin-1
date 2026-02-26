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
