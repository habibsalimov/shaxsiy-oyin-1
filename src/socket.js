import { io } from "socket.io-client";

// Socket.IO remains the default for the Node deployment.
export class CloudflareSocket {
  constructor() {
    this.listeners = new Map();
    this.connected = false;
    this.id = undefined;
    this.generation = 0;
    this.attempts = 0;
    queueMicrotask(() => {
      let session;
      try { session = JSON.parse(sessionStorage.getItem("game-session")); } catch { }
      if (session?.roomCode) {
        this.join({ code: session.roomCode, playerName: session.playerName || "Host", isHost: !!session.isHost, hostToken: session.hostToken });
      } else {
        this.checkHealth();
      }
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
    return this;
  }

  off(event, callback) {
    this.listeners.get(event)?.delete(callback);
    return this;
  }

  dispatch(event, data) {
    for (const callback of [...(this.listeners.get(event) || [])]) callback(data);
  }

  setConnected(value) {
    if (value === this.connected) return;
    this.connected = value;
    this.dispatch(value ? "connect" : "disconnect");
  }

  async checkHealth() {
    const generation = this.generation;
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      if (generation !== this.generation) return;
      this.setConnected(response.ok);
    } catch {
      if (generation === this.generation) this.setConnected(false);
    }
    if (generation === this.generation && !this.connected) {
      this.retry = setTimeout(() => this.checkHealth(), 5000);
    }
  }

  stopConnection() {
    this.generation++;
    clearTimeout(this.retry);
    clearInterval(this.heartbeat);
    clearTimeout(this.handshakeTimeout);
    const old = this.ws;
    this.ws = null;
    old?.close();
    this.id = undefined;
    this.setConnected(false);
  }

  join(data) {
    this.stopConnection();
    this.joinData = { ...data };
    this.attempts = 0;
    this.open();
  }

  open() {
    const generation = this.generation;
    const url = new URL("/ws", window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("code", this.joinData.code);
    const ws = this.ws = new WebSocket(url);
    let awaitingJoin = true;
    let pongReceived = true;
    this.handshakeTimeout = setTimeout(() => ws.close(), 15000);
    ws.onmessage = ({ data }) => {
      if (generation !== this.generation || ws !== this.ws) return;
      if (data === "__pong") { pongReceived = true; return; }
      let message;
      try { message = JSON.parse(data); } catch { return; }
      const { event, data: payload } = message;
      if (event === "connected") {
        clearTimeout(this.handshakeTimeout);
        this.id = payload.id;
        this.attempts = 0;
        this.setConnected(true);
        this.send("join-room", this.joinData);
        this.heartbeat = setInterval(() => {
          if (!pongReceived) { ws.close(); return; }
          pongReceived = false;
          if (ws.readyState === WebSocket.OPEN) ws.send("__ping");
        }, 30000);
        return;
      }
      if (event === "room-created" && payload?.code === this.createdRoomCode) {
        this.createdRoomCode = null;
        return;
      }
      if (event === "ping-latency") this.send("pong-latency", payload);
      // Dispatch first: removal handlers compare the current connection ID.
      if (event === "game-state") {
        awaitingJoin = false;
        // Confirm membership before publishing state. Connection status changes can
        // unmount the landing screen's pending join listener during the handshake.
        if (!this.joinData?.isHost && payload?.code === this.joinData?.code &&
            payload.players?.some(player => player.socketId === this.id)) {
          try {
            sessionStorage.setItem("game-session", JSON.stringify({
              roomCode: payload.code, isHost: false, playerName: this.joinData.playerName,
            }));
          } catch { }
        }
      }
      const terminal = (event === "error" && awaitingJoin) || event === "game-finished" || (event === "player-removed" && payload?.socketId === this.id);
      this.dispatch(event, payload);
      if (terminal) {
        this.joinData = null;
        this.stopConnection();
        this.checkHealth();
      }
    };
    ws.onclose = () => {
      if (generation !== this.generation || ws !== this.ws) return;
      clearTimeout(this.handshakeTimeout);
      clearInterval(this.heartbeat);
      this.id = undefined;
      this.setConnected(false);
      if (this.joinData && this.attempts++ < 10) {
        this.retry = setTimeout(() => this.open(), Math.min(1000 * this.attempts, 5000));
      } else {
        this.dispatch("error", { message: "Server bilan ulanish uzildi. Sahifani yangilang." });
      }
    };
    ws.onerror = () => ws.close();
  }

  send(event, data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }));
      return true;
    }
    return false;
  }

  async createRoom(data) {
    this.stopConnection();
    this.joinData = null;
    const generation = this.generation;
    try {
      const response = await fetch("/api/rooms", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      const result = await response.json();
      if (generation !== this.generation) return;
      if (!response.ok) throw new Error(result.message || result.error || "Xonani yaratib bo'lmadi");
      this.createdRoomCode = result.code;
      this.dispatch("room-created", result);
      this.join({ code: result.code, playerName: data.hostName, isHost: true, hostToken: result.hostToken });
    } catch (error) {
      if (generation !== this.generation) return;
      this.dispatch("error", { message: error.message || "Server bilan aloqa yo'q" });
      this.checkHealth();
    }
  }

  emit(event, data) {
    if (event === "create-room") { void this.createRoom(data); return this; }
    if (event === "join-room") { this.join(data); return this; }
    if (!this.send(event, data)) {
      this.dispatch("error", { message: "Server bilan aloqa yo'q. Qayta ulanishni kuting." });
    }
    return this;
  }
}

let socket = null;

export function getSocket() {
  if (!socket) {
    if (import.meta.env?.VITE_TRANSPORT === "cloudflare") {
      socket = new CloudflareSocket();
      return socket;
    }
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
            hostToken: session.hostToken || null,
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
