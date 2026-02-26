const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateCode(existing) {
  for (let i = 0; i < 200; i++) {
    const code = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    if (!existing.has(code)) return code;
  }
  for (let i = 0; i < 200; i++) {
    const num = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
    const l = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    const code = num + l;
    if (!existing.has(code)) return code;
  }
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export class GameManager {
  constructor() {
    this.rooms = new Map();
    this.socketToRoom = new Map();
  }

  createRoom(socketId, { hostName, rounds, topics, nominals, timer, falstart }) {
    const code = generateCode(new Set(this.rooms.keys()));
    const topicNames = (Array.isArray(topics) && topics.length > 0)
      ? topics
      : Array.from({ length: parseInt(rounds) || 5 }, (_, i) => `${i + 1}-mavzu`);

    const room = {
      code,
      hostSocketId: socketId,
      hostName,
      settings: { timer: parseInt(timer) || 7, nominals: nominals || [10,20,30,40,50], falstart: !!falstart },
      topicNames,
      players: [],
      locked: false,
      blockedPlayers: new Set(),
      phase: "lobby",
      topicScores: [],
      currentTopicIdx: 0,
      activeCell: null,
      cellData: {},
      timerEnd: null,
      timerTimeout: null,
      buzzOrder: [],
      falstartBlocked: new Set(),
    };
    this.rooms.set(code, room);
    this.socketToRoom.set(socketId, code);
    return { code, room };
  }

  joinRoom(socketId, { code, playerName, isHost }) {
    const room = this.rooms.get(code);
    if (!room) return { error: "Xona topilmadi" };

    // Host reconnection: update hostSocketId
    if (isHost && room.hostName === playerName) {
      const oldHostId = room.hostSocketId;
      this.socketToRoom.delete(oldHostId);
      room.hostSocketId = socketId;
      this.socketToRoom.set(socketId, code);
      return { room, reconnected: true, isHost: true };
    }

    if (room.locked) return { error: "Xona qulflangan" };
    if (room.players.some(p => p.socketId === socketId)) return { error: "Siz allaqachon xonadasiz" };

    // Check if reconnecting (same name, disconnected)
    const existing = room.players.find(p => p.name === playerName && !p.connected);
    if (existing) {
      const oldId = existing.socketId;
      existing.socketId = socketId;
      existing.connected = true;
      this.socketToRoom.delete(oldId);
      this.socketToRoom.set(socketId, code);
      return { room, reconnected: true };
    }

    const player = { socketId, name: playerName, connected: true, latency: 0 };
    room.players.push(player);
    this.socketToRoom.set(socketId, code);
    return { room };
  }

  getRoomForSocket(socketId) {
    const code = this.socketToRoom.get(socketId);
    return code ? this.rooms.get(code) : null;
  }

  isHost(socketId) {
    const room = this.getRoomForSocket(socketId);
    return room && room.hostSocketId === socketId;
  }

  _ensureTopicScores(room, ti) {
    while (room.topicScores.length <= ti) {
      const s = {};
      room.players.forEach(p => {
        s[p.socketId] = {};
        room.settings.nominals.forEach(n => { s[p.socketId][n] = null; });
      });
      room.topicScores.push(s);
    }
  }

  startTimer(socketId, { ti, ni }) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;

    room.activeCell = { ti, ni };
    room.buzzOrder = [];
    room.falstartBlocked = new Set();
    if (room.phase === "lobby") room.phase = "playing";
    this._ensureTopicScores(room, ti);
    room.currentTopicIdx = ti;

    const ms = room.settings.timer * 1000;
    room.timerEnd = Date.now() + ms;
    clearTimeout(room.timerTimeout);

    return { room, timerEnd: room.timerEnd, ti, ni, ms };
  }

  handleTimerExpiry(room, ti, ni) {
    room.timerEnd = null;
    const key = `${ti}-${ni}`;
    if (!room.cellData[key]) room.cellData[key] = { history: [] };
    const cell = room.cellData[key];
    if (!cell.history.some(h => h.result === "correct" || h.result === "no_answer")) {
      cell.history.push({ playerId: null, playerName: null, result: "no_answer", nominal: null, ts: Date.now() });
    }
    room.buzzOrder = [];
    room.falstartBlocked = new Set();
  }

  buzz(socketId) {
    const room = this.getRoomForSocket(socketId);
    if (!room || !room.timerEnd) return null;
    if (room.blockedPlayers.has(socketId)) return null;
    if (room.falstartBlocked.has(socketId)) return null;
    if (room.buzzOrder.some(b => b.socketId === socketId)) return null;

    const player = room.players.find(p => p.socketId === socketId);
    if (!player || !player.connected) return null;

    const effectiveTime = Date.now() - Math.floor(player.latency / 2);
    room.buzzOrder.push({ socketId, name: player.name, effectiveTime });
    room.buzzOrder.sort((a, b) => a.effectiveTime - b.effectiveTime);

    // Stop timer on first buzz
    if (room.buzzOrder.length === 1) {
      clearTimeout(room.timerTimeout);
      room.timerEnd = null;
    }

    return { room };
  }

  judge(socketId, { playerId, result }) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;
    if (!room.activeCell) return null;

    const { ti, ni } = room.activeCell;
    const nom = room.settings.nominals[ni];

    this._ensureTopicScores(room, ti);
    if (!room.topicScores[ti][playerId]) {
      room.topicScores[ti][playerId] = {};
      room.settings.nominals.forEach(n => { room.topicScores[ti][playerId][n] = null; });
    }
    room.topicScores[ti][playerId][nom] = result;

    // Record in cellData
    const key = `${ti}-${ni}`;
    if (!room.cellData[key]) room.cellData[key] = { history: [] };
    const player = room.players.find(p => p.socketId === playerId);
    room.cellData[key].history.push({
      playerId, playerName: player?.name || playerId,
      result, nominal: nom, ts: Date.now()
    });

    if (result === "correct") {
      room.buzzOrder = [];
      clearTimeout(room.timerTimeout);
      room.timerEnd = null;
      // Auto-advance
      const nextNi = ni + 1;
      if (nextNi < room.settings.nominals.length) {
        room.activeCell = { ti, ni: nextNi };
      } else if (ti + 1 < room.topicNames.length) {
        room.currentTopicIdx = ti + 1;
        room.activeCell = { ti: ti + 1, ni: 0 };
        this._ensureTopicScores(room, ti + 1);
      } else {
        room.activeCell = null;
      }
    } else {
      room.buzzOrder = room.buzzOrder.filter(b => b.socketId !== playerId);
    }

    return { room };
  }

  skipQuestion(socketId, { ti, ni }) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;

    const key = `${ti}-${ni}`;
    if (!room.cellData[key]) room.cellData[key] = { history: [] };
    room.cellData[key].history.push({ playerId: null, playerName: null, result: "skipped", nominal: null, ts: Date.now() });

    clearTimeout(room.timerTimeout);
    room.timerEnd = null;
    room.buzzOrder = [];

    const nextNi = ni + 1;
    if (nextNi < room.settings.nominals.length) {
      room.activeCell = { ti, ni: nextNi };
    } else if (ti + 1 < room.topicNames.length) {
      room.currentTopicIdx = ti + 1;
      room.activeCell = { ti: ti + 1, ni: 0 };
      this._ensureTopicScores(room, ti + 1);
    } else {
      room.activeCell = null;
    }

    return { room };
  }

  lockRoom(socketId) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;
    room.locked = !room.locked;
    return { room };
  }

  blockPlayer(socketId, { playerId }) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;
    if (room.blockedPlayers.has(playerId)) {
      room.blockedPlayers.delete(playerId);
    } else {
      room.blockedPlayers.add(playerId);
    }
    return { room };
  }

  removePlayer(socketId, { playerId }) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;
    room.players = room.players.filter(p => p.socketId !== playerId);
    room.buzzOrder = room.buzzOrder.filter(b => b.socketId !== playerId);
    room.blockedPlayers.delete(playerId);
    this.socketToRoom.delete(playerId);
    return { room };
  }

  finishGame(socketId) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;
    clearTimeout(room.timerTimeout);
    room.phase = "finished";
    room.timerEnd = null;
    room.activeCell = null;

    const result = {
      topicScores: room.topicScores,
      topicNames: room.topicNames,
      players: room.players.map(p => ({ socketId: p.socketId, name: p.name })),
      nominals: room.settings.nominals,
      date: new Date().toISOString(),
    };

    // Schedule room cleanup after 5 minutes
    setTimeout(() => {
      this.rooms.delete(room.code);
    }, 5 * 60 * 1000);

    return { result, room };
  }

  handleDisconnect(socketId) {
    const room = this.getRoomForSocket(socketId);
    if (!room) return null;

    if (room.hostSocketId === socketId) {
      return { room, hostDisconnected: true };
    }

    const player = room.players.find(p => p.socketId === socketId);
    if (player) player.connected = false;
    room.buzzOrder = room.buzzOrder.filter(b => b.socketId !== socketId);
    this.socketToRoom.delete(socketId);

    return { room, playerDisconnected: socketId };
  }

  getGameState(room) {
    return {
      code: room.code,
      hostName: room.hostName,
      hostSocketId: room.hostSocketId,
      settings: { ...room.settings },
      topicNames: [...room.topicNames],
      players: room.players.map(p => ({
        socketId: p.socketId, name: p.name,
        connected: p.connected, latency: p.latency
      })),
      locked: room.locked,
      blockedPlayers: [...room.blockedPlayers],
      phase: room.phase,
      topicScores: room.topicScores,
      currentTopicIdx: room.currentTopicIdx,
      activeCell: room.activeCell,
      cellData: room.cellData,
      timerEnd: room.timerEnd,
      buzzOrder: room.buzzOrder.map(b => ({ socketId: b.socketId, name: b.name, effectiveTime: b.effectiveTime })),
      falstartBlocked: [...room.falstartBlocked],
    };
  }
}
