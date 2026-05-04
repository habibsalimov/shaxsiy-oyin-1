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

function generatePlayerId() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
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
      hostConnected: true,
      settings: { timer: parseInt(timer) || 7, nominals: nominals || [10,20,30,40,50], falstart: !!falstart },
      topicNames,
      players: [],
      locked: false,
      blockedPlayers: new Set(),
      phase: "lobby",
      topicScores: [],
      topicNominals: [],
      currentTopicIdx: 0,
      activeCell: null,
      cellData: {},
      attachments: {},
      timerEnd: null,
      timerTimeout: null,
      buzzOrder: [],
      falstartBlocked: new Set(),
      timerStarted: false,
      cellLocked: false,
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
      room.hostConnected = true;
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

    const player = { id: generatePlayerId(), socketId, name: playerName, connected: true, latency: 0 };
    room.players.push(player);
    this.ensurePlayerScoreEntries(room, player);
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

  getPlayerBySocket(room, socketId) {
    return room.players.find((p) => p.socketId === socketId) || null;
  }

  ensurePlayerScoreEntries(room, player) {
    room.topicScores.forEach((topicScore, idx) => {
      if (topicScore[player.id]) return;
      const noms = this._getTopicNominals(room, idx);
      topicScore[player.id] = {};
      noms.forEach((n) => {
        topicScore[player.id][n] = null;
      });
    });
  }

  _ensureTopicScores(room, ti) {
    while (room.topicScores.length <= ti) {
      const idx = room.topicScores.length;
      // Lock nominals for this topic (use current settings at time of creation)
      if (!room.topicNominals[idx]) {
        room.topicNominals[idx] = [...room.settings.nominals];
      }
      const noms = room.topicNominals[idx];
      const s = {};
      room.players.forEach(p => {
        s[p.id] = {};
        noms.forEach(n => { s[p.id][n] = null; });
      });
      room.topicScores.push(s);
    }
  }

  _getTopicNominals(room, ti) {
    return room.topicNominals[ti] || room.settings.nominals;
  }

  _findNextOpenCell(room, afterTi, afterNi) {
    const isDone = (ti, ni) => {
      const h = room.cellData[`${ti}-${ni}`]?.history || [];
      return h.some(e => e.result === "correct" || e.result === "no_answer" || e.result === "skipped");
    };
    // Search from (afterTi, afterNi+1) forward
    for (let ti = afterTi; ti < room.topicNames.length; ti++) {
      const noms = this._getTopicNominals(room, ti);
      const startNi = ti === afterTi ? afterNi + 1 : 0;
      for (let ni = startNi; ni < noms.length; ni++) {
        if (!isDone(ti, ni)) return { ti, ni };
      }
    }
    return null;
  }

  updateSettings(socketId, { timer, nominals, falstart }) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;

    if (timer !== undefined) room.settings.timer = parseInt(timer) || 7;
    if (falstart !== undefined) room.settings.falstart = !!falstart;
    if (nominals && Array.isArray(nominals)) room.settings.nominals = nominals;

    return { room };
  }

  correctScore(socketId, { playerId, ti, ni }) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;
    if (room.phase !== "playing") return null;

    this._ensureTopicScores(room, ti);
    const topicNoms = this._getTopicNominals(room, ti);
    const nom = topicNoms[ni];
    if (!room.topicScores[ti][playerId]) {
      room.topicScores[ti][playerId] = {};
      topicNoms.forEach(n => { room.topicScores[ti][playerId][n] = null; });
    }

    const current = room.topicScores[ti][playerId][nom];
    const next = current === null ? "correct" : current === "correct" ? "wrong" : null;
    room.topicScores[ti][playerId][nom] = next;

    return { room };
  }

  startGame(socketId) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;
    if (room.phase !== "lobby") return null;
    if (room.players.length < 1) return { error: "Kamida 1 ta o'yinchi kerak" };
    room.phase = "playing";
    room.activeCell = { ti: 0, ni: 0 };
    this._ensureTopicScores(room, 0);
    return { room };
  }

  lockCell(socketId) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;
    if (!room.activeCell) return null;

    room.cellLocked = !room.cellLocked;
    if (room.cellLocked) {
      // Stop timer and clear buzz state when locking
      clearTimeout(room.timerTimeout);
      room.timerEnd = null;
      room.timerStarted = false;
      room.buzzOrder = [];
      room.falstartBlocked = new Set();
    }
    return { room };
  }

  startTimer(socketId, { ti, ni }) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;
    if (room.phase !== "playing") return null;
    if (room.cellLocked) return null;

    // Clear "no_answer" from history so cell can be retried
    const key = `${ti}-${ni}`;
    if (room.cellData[key]) {
      room.cellData[key].history = room.cellData[key].history.filter(h => h.result !== "no_answer");
    }

    room.activeCell = { ti, ni };
    room.cellLocked = false;
    room.buzzOrder = [];
    this._ensureTopicScores(room, ti);
    room.currentTopicIdx = ti;

    const ms = room.settings.timer * 1000;
    room.timerEnd = Date.now() + ms;
    room.timerStarted = true;
    clearTimeout(room.timerTimeout);

    return { room, timerEnd: room.timerEnd, ti, ni, ms };
  }

  handleTimerExpiry(room, ti, ni) {
    room.timerEnd = null;
    room.timerStarted = false;
    const key = `${ti}-${ni}`;
    if (!room.cellData[key]) room.cellData[key] = { history: [] };
    const cell = room.cellData[key];
    if (!cell.history.some(h => h.result === "correct" || h.result === "no_answer")) {
      cell.history.push({ playerId: null, playerName: null, result: "no_answer", nominal: null, ts: Date.now() });
    }
    room.buzzOrder = [];
    room.falstartBlocked = new Set();

    // Auto-advance to next open cell
    const next = this._findNextOpenCell(room, ti, ni);
    if (next) {
      room.activeCell = next;
      if (next.ti !== ti) {
        room.currentTopicIdx = next.ti;
        this._ensureTopicScores(room, next.ti);
      }
    } else {
      room.activeCell = null;
    }
  }

  buzz(socketId) {
    const room = this.getRoomForSocket(socketId);
    if (!room) return null;
    const player = this.getPlayerBySocket(room, socketId);
    if (!player || !player.connected) return null;

    if (room.cellLocked) return null;
    if (room.blockedPlayers.has(player.id)) return null;
    if (room.falstartBlocked.has(player.id)) return null;
    if (room.buzzOrder.some(b => b.playerId === player.id)) return null;

    // Block re-buzz if player already answered wrong on this cell
    if (room.activeCell) {
      const key = `${room.activeCell.ti}-${room.activeCell.ni}`;
      const cell = room.cellData[key];
      if (cell && cell.history.some(h => h.playerId === player.id && h.result === "wrong")) {
        return null;
      }
    }

    // Timer not running yet
    if (!room.timerEnd) {
      // Falstart only applies before timer has ever been started for this cell
      if (!room.timerStarted) {
        if (room.settings.falstart && room.activeCell) {
          room.falstartBlocked.add(player.id);
          return { room, falstart: true, playerId: player.id };
        }
        // Falstart disabled: allow buzz freely (no timer to stop)
      }
      // Timer was started but stopped by first buzz — allow freely
    }

    const effectiveTime = Date.now() - Math.floor(player.latency / 2);
    room.buzzOrder.push({ playerId: player.id, socketId, name: player.name, effectiveTime });
    room.buzzOrder.sort((a, b) => a.effectiveTime - b.effectiveTime);

    // Stop timer on first buzz (only if timer is running)
    if (room.timerEnd && room.buzzOrder.length === 1) {
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
    const topicNoms = this._getTopicNominals(room, ti);
    const nom = topicNoms[ni];

    this._ensureTopicScores(room, ti);
    if (!room.topicScores[ti][playerId]) {
      room.topicScores[ti][playerId] = {};
      topicNoms.forEach(n => { room.topicScores[ti][playerId][n] = null; });
    }
    room.topicScores[ti][playerId][nom] = result;

    // Record in cellData
    const key = `${ti}-${ni}`;
    if (!room.cellData[key]) room.cellData[key] = { history: [] };
    const player = room.players.find(p => p.id === playerId);
    room.cellData[key].history.push({
      playerId, playerName: player?.name || playerId,
      result, nominal: nom, ts: Date.now()
    });

    if (result === "correct") {
      room.buzzOrder = [];
      room.falstartBlocked = new Set();
      clearTimeout(room.timerTimeout);
      room.timerEnd = null;
      room.timerStarted = false;
      // Auto-advance to next open cell (skips already-done cells)
      const next = this._findNextOpenCell(room, ti, ni);
      if (next) {
        room.activeCell = next;
        if (next.ti !== ti) {
          room.currentTopicIdx = next.ti;
          this._ensureTopicScores(room, next.ti);
        }
      } else {
        room.activeCell = null;
      }
    } else {
      room.buzzOrder = room.buzzOrder.filter(b => b.playerId !== playerId);
      // If no one left in buzzOrder, auto-advance to next question
      if (room.buzzOrder.length === 0) {
        room.falstartBlocked = new Set();
        clearTimeout(room.timerTimeout);
        room.timerEnd = null;
        room.timerStarted = false;
        const next = this._findNextOpenCell(room, ti, ni);
        if (next) {
          room.activeCell = next;
          if (next.ti !== ti) {
            room.currentTopicIdx = next.ti;
            this._ensureTopicScores(room, next.ti);
          }
        } else {
          room.activeCell = null;
        }
      }
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
    room.timerStarted = false;
    room.buzzOrder = [];
    room.falstartBlocked = new Set();

    // Auto-advance to next open cell (skips already-done cells)
    const next = this._findNextOpenCell(room, ti, ni);
    if (next) {
      room.activeCell = next;
      if (next.ti !== ti) {
        room.currentTopicIdx = next.ti;
        this._ensureTopicScores(room, next.ti);
      }
    } else {
      room.activeCell = null;
    }

    return { room };
  }

  setAttachment(socketId, { ti, ni, type, content }) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;
    const key = `${ti}-${ni}`;
    const existing = room.attachments[key] || {};
    if (type === "text") {
      existing.text = content;
    } else if (type === "image") {
      existing.image = content;
    }
    room.attachments[key] = existing;
    return { room };
  }

  removeAttachment(socketId, { ti, ni, type }) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;
    const key = `${ti}-${ni}`;
    if (type && room.attachments[key]) {
      delete room.attachments[key][type];
      if (!room.attachments[key].text && !room.attachments[key].image) {
        delete room.attachments[key];
      }
    } else {
      delete room.attachments[key];
    }
    return { room };
  }

  resetCell(socketId, { ti, ni }) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;
    if (room.phase !== "playing") return null;

    const key = `${ti}-${ni}`;
    // Clear history
    room.cellData[key] = { history: [] };

    // Null out scores for all players at this nominal
    const nom = this._getTopicNominals(room, ti)[ni];
    if (room.topicScores[ti]) {
      for (const playerId of Object.keys(room.topicScores[ti])) {
        if (room.topicScores[ti][playerId] && room.topicScores[ti][playerId][nom] !== undefined) {
          room.topicScores[ti][playerId][nom] = null;
        }
      }
    }

    // Re-activate this cell
    room.activeCell = { ti, ni };
    room.currentTopicIdx = ti;
    clearTimeout(room.timerTimeout);
    room.timerEnd = null;
    room.timerStarted = false;
    room.buzzOrder = [];
    room.falstartBlocked = new Set();
    room.cellLocked = false;

    return { room };
  }

  addTopic(socketId, { name }) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;
    const topicName = name || `${room.topicNames.length + 1}-mavzu`;
    room.topicNames.push(topicName);
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
    const player = room.players.find((p) => p.id === playerId);
    room.players = room.players.filter(p => p.id !== playerId);
    room.buzzOrder = room.buzzOrder.filter(b => b.playerId !== playerId);
    room.blockedPlayers.delete(playerId);
    room.falstartBlocked.delete(playerId);
    if (player?.socketId) {
      this.socketToRoom.delete(player.socketId);
    }
    return { room, removedSocketId: player?.socketId || null };
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
      players: room.players.map(p => ({ id: p.id, name: p.name })),
      nominals: room.settings.nominals,
      topicNominals: room.topicNominals,
      date: new Date().toISOString(),
    };

    // Clean up socketToRoom entries
    this.socketToRoom.delete(room.hostSocketId);
    room.players.forEach(p => this.socketToRoom.delete(p.socketId));

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
      this.socketToRoom.delete(socketId);
      room.hostConnected = false;
      return { room, hostDisconnected: true };
    }

    const player = this.getPlayerBySocket(room, socketId);
    if (player) player.connected = false;
    if (player) {
      room.buzzOrder = room.buzzOrder.filter(b => b.playerId !== player.id);
    }
    this.socketToRoom.delete(socketId);

    return { room, playerDisconnected: player?.id || socketId };
  }

  getGameState(room) {
    return {
      code: room.code,
      hostName: room.hostName,
      hostSocketId: room.hostSocketId,
      hostConnected: room.hostConnected !== false,
      settings: { ...room.settings },
      topicNames: [...room.topicNames],
      topicNominals: [...room.topicNominals],
      players: room.players.map(p => ({
        id: p.id, socketId: p.socketId, name: p.name,
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
      timerStarted: room.timerStarted || false,
      buzzOrder: room.buzzOrder.map(b => ({ playerId: b.playerId, socketId: b.socketId, name: b.name, effectiveTime: b.effectiveTime })),
      falstartBlocked: [...room.falstartBlocked],
      cellLocked: room.cellLocked || false,
    };
  }
}
