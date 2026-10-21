const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const SOUND_OPTIONS = new Set(["off", "button", "ding", "game-menu", "happy", "join", "notification", "paper-fold", "pop", "error", "beep", "gudok"]);
const LATE_BUZZ_WINDOW_MS = 100;
const MAX_ATTACHMENT_TEXT_LENGTH = 2000;
const MAX_ATTACHMENT_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_ROOM_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const JOIN_ATTEMPT_WINDOW_MS = 60 * 1000;
const JOIN_ATTEMPT_BLOCK_MS = 60 * 1000;
const JOIN_ATTEMPT_LIMIT = 10;
const ROOM_INACTIVE_TTL_MS = 3 * 60 * 60 * 1000;

function normalizeSound(value, fallback) {
  return SOUND_OPTIONS.has(value) ? value : fallback;
}

function normalizeWrongAnswerLimit(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, parsed);
}

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

function estimateDataUrlBytes(value) {
  if (typeof value !== "string") return 0;
  const base64 = value.includes(",") ? value.split(",").pop() : value;
  return Math.ceil((base64.length * 3) / 4);
}

function getAttachmentSize(attachment = {}) {
  const textBytes = attachment.text ? Buffer.byteLength(String(attachment.text), "utf8") : 0;
  const imageBytes = attachment.image ? estimateDataUrlBytes(attachment.image) : 0;
  return textBytes + imageBytes;
}

function getRoomAttachmentSize(room) {
  return Object.values(room.attachments || {}).reduce((sum, attachment) => sum + getAttachmentSize(attachment), 0);
}

export class GameManager {
  constructor({ scheduleCleanup = (...args) => setTimeout(...args) } = {}) {
    this.scheduleCleanup = scheduleCleanup;
    this.rooms = new Map();
    this.socketToRoom = new Map();
    this.joinAttempts = new Map();
  }

  _touchRoom(room, now = Date.now()) {
    if (room) room.lastActivityAt = now;
  }

  _joinAttemptKeys({ code, address, socketId }) {
    const keys = [];
    const identity = address || socketId;
    if (identity) keys.push(`identity:${identity}`);
    if (code) keys.push(`code:${String(code).trim().toUpperCase()}`);
    return keys;
  }

  _getJoinBucket(key, now) {
    const bucket = this.joinAttempts.get(key);
    if (!bucket || now - bucket.windowStart > JOIN_ATTEMPT_WINDOW_MS) {
      const fresh = { count: 0, windowStart: now, blockedUntil: 0 };
      this.joinAttempts.set(key, fresh);
      return fresh;
    }
    return bucket;
  }

  isJoinBlocked({ code, address, socketId, now = Date.now() }) {
    return this._joinAttemptKeys({ code, address, socketId }).some((key) => {
      const bucket = this._getJoinBucket(key, now);
      return bucket.blockedUntil > now;
    });
  }

  recordJoinFailure({ code, address, socketId, now = Date.now() }) {
    this._joinAttemptKeys({ code, address, socketId }).forEach((key) => {
      const bucket = this._getJoinBucket(key, now);
      bucket.count += 1;
      if (bucket.count > JOIN_ATTEMPT_LIMIT) {
        bucket.blockedUntil = now + JOIN_ATTEMPT_BLOCK_MS;
      }
    });
  }

  cleanupInactiveRooms(now = Date.now(), ttl = ROOM_INACTIVE_TTL_MS) {
    const removed = [];
    for (const [code, room] of this.rooms.entries()) {
      const lastActivityAt = room.lastActivityAt || now;
      if (now - lastActivityAt <= ttl) continue;

      clearTimeout(room.timerTimeout);
      this.socketToRoom.delete(room.hostSocketId);
      room.players.forEach((player) => this.socketToRoom.delete(player.socketId));
      this.rooms.delete(code);
      removed.push(code);
    }
    return removed;
  }

  createRoom(socketId, { hostName, rounds, topics, nominals, timer, falstart, wrongAnswerLimit, queuedAnswers, latencyCompensation, timerStartSound, buzzerSound, timerEndSound, falstartSound }) {
    const code = generateCode(new Set(this.rooms.keys()));
    const topicNames = (Array.isArray(topics) && topics.length > 0)
      ? topics
      : Array.from({ length: parseInt(rounds) || 5 }, (_, i) => `${i + 1}-mavzu`);

    const room = {
      code,
      hostSocketId: socketId,
      hostToken: generatePlayerId(),
      hostName,
      hostConnected: true,
      settings: {
        timer: parseInt(timer) || 7,
        nominals: nominals || [10,20,30,40,50],
        wrongAnswerLimit: normalizeWrongAnswerLimit(wrongAnswerLimit),
        queuedAnswers: !!queuedAnswers,
        falstart: !!falstart,
        latencyCompensation: latencyCompensation !== false,
        timerStartSound: normalizeSound(timerStartSound, "gudok"),
        buzzerSound: normalizeSound(buzzerSound, "pop"),
        timerEndSound: normalizeSound(timerEndSound, "ding"),
        falstartSound: normalizeSound(falstartSound, "error"),
      },
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
      timerPausedRemaining: null,
      timerHeldByBuzz: false,
      timerTimeout: null,
      buzzOrder: [],
      falstartBlocked: new Set(),
      timerStarted: false,
      cellLocked: false,
      lastActivityAt: Date.now(),
    };
    this.rooms.set(code, room);
    this.socketToRoom.set(socketId, code);
    return { code, room, hostToken: room.hostToken };
  }

  joinRoom(socketId, { code, playerName, isHost, hostToken }) {
    const room = this.rooms.get(code);
    if (!room) return { error: "Xona topilmadi" };

    // Host reconnection: update hostSocketId
    if (isHost && (room.hostToken === hostToken || room.hostName === playerName)) {
      const oldHostId = room.hostSocketId;
      this.socketToRoom.delete(oldHostId);
      room.hostSocketId = socketId;
      room.hostConnected = true;
      this.socketToRoom.set(socketId, code);
      this._touchRoom(room);
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
      this._touchRoom(room);
      return { room, reconnected: true };
    }

    const player = { id: generatePlayerId(), socketId, name: playerName, connected: true, latency: 0 };
    room.players.push(player);
    this.ensurePlayerScoreEntries(room, player);
    this.socketToRoom.set(socketId, code);
    this._touchRoom(room);
    return { room };
  }

  getRoomForSocket(socketId) {
    const code = this.socketToRoom.get(socketId);
    const room = code ? this.rooms.get(code) : null;
    if (room) this._touchRoom(room);
    return room;
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

  _hasEligibleBuzzers(room, ti, ni) {
    const key = `${ti}-${ni}`;
    const history = room.cellData[key]?.history || [];
    return room.players.some((player) => (
      player.connected &&
      !room.blockedPlayers.has(player.id) &&
      !history.some(h => h.playerId === player.id && (h.result === "wrong" || h.result === "falstart"))
    ));
  }

  updateSettings(socketId, { timer, nominals, falstart, wrongAnswerLimit, queuedAnswers, latencyCompensation, timerStartSound, buzzerSound, timerEndSound, falstartSound }) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;

    if (timer !== undefined) room.settings.timer = parseInt(timer) || 7;
    if (wrongAnswerLimit !== undefined) room.settings.wrongAnswerLimit = normalizeWrongAnswerLimit(wrongAnswerLimit);
    if (queuedAnswers !== undefined) room.settings.queuedAnswers = !!queuedAnswers;
    if (falstart !== undefined) room.settings.falstart = !!falstart;
    if (latencyCompensation !== undefined) room.settings.latencyCompensation = !!latencyCompensation;
    if (timerStartSound !== undefined) room.settings.timerStartSound = normalizeSound(timerStartSound, room.settings.timerStartSound);
    if (buzzerSound !== undefined) room.settings.buzzerSound = normalizeSound(buzzerSound, room.settings.buzzerSound);
    if (timerEndSound !== undefined) room.settings.timerEndSound = normalizeSound(timerEndSound, room.settings.timerEndSound);
    if (falstartSound !== undefined) room.settings.falstartSound = normalizeSound(falstartSound, room.settings.falstartSound);
    if (nominals && Array.isArray(nominals)) room.settings.nominals = nominals;

    this._touchRoom(room);
    return { room };
  }

  updateHostName(socketId, { hostName }) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;

    const nextName = String(hostName || "").trim();
    if (!nextName) return { room };

    room.hostName = nextName;
    this._touchRoom(room);
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
      room.timerPausedRemaining = null;
      room.timerHeldByBuzz = false;
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
    if (room.buzzOrder.length > 0) return null;

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
    room.timerPausedRemaining = null;
    room.timerHeldByBuzz = false;
    room.timerStarted = true;
    clearTimeout(room.timerTimeout);

    return { room, timerEnd: room.timerEnd, ti, ni, ms };
  }

  pauseTimer(socketId) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;
    if (room.phase !== "playing") return null;
    if (!room.timerEnd) return null;

    const remainingMs = Math.max(0, room.timerEnd - Date.now());
    clearTimeout(room.timerTimeout);
    room.timerEnd = null;
    room.timerPausedRemaining = remainingMs;
    room.timerStarted = true;

    return { room, remainingMs };
  }

  resumeTimer(socketId) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;
    if (room.phase !== "playing") return null;
    if (!room.activeCell) return null;
    if (!room.timerPausedRemaining) return null;
    if (room.cellLocked) return null;

    const ms = room.timerPausedRemaining;
    room.timerEnd = Date.now() + ms;
    room.timerPausedRemaining = null;
    room.timerHeldByBuzz = false;
    room.timerStarted = true;
    clearTimeout(room.timerTimeout);

    return { room, timerEnd: room.timerEnd, ti: room.activeCell.ti, ni: room.activeCell.ni, ms };
  }

  handleTimerExpiry(room, ti, ni) {
    room.timerEnd = null;
    room.timerPausedRemaining = null;
    room.timerHeldByBuzz = false;
    room.timerStarted = false;
    room.activeCell = { ti, ni };
    room.currentTopicIdx = ti;
    room.cellLocked = true;
    const key = `${ti}-${ni}`;
    if (!room.cellData[key]) room.cellData[key] = { history: [] };
    const cell = room.cellData[key];
    if (!cell.history.some(h => h.result === "correct" || h.result === "no_answer")) {
      cell.history.push({ playerId: null, playerName: null, result: "no_answer", nominal: null, ts: Date.now() });
    }
    room.buzzOrder = [];
  }

  buzz(socketId) {
    const room = this.getRoomForSocket(socketId);
    if (!room) return null;
    const player = this.getPlayerBySocket(room, socketId);
    if (!player || !player.connected) return null;

    if (room.cellLocked) return null;
    if (room.timerPausedRemaining) return null;
    if (room.blockedPlayers.has(player.id)) return null;
    if (room.falstartBlocked.has(player.id)) return null;
    if (room.buzzOrder.some(b => b.playerId === player.id)) return null;

    // Block re-buzz if player already answered wrong on this cell
    if (room.activeCell) {
      const key = `${room.activeCell.ti}-${room.activeCell.ni}`;
      const cell = room.cellData[key];
      if (cell && cell.history.some(h => h.playerId === player.id && (h.result === "wrong" || h.result === "falstart"))) {
        return null;
      }
    }

    // Timer not running yet
    if (!room.timerEnd) {
      // Falstart only applies before timer has ever been started for this cell
      if (!room.timerStarted) {
        if (room.settings.falstart && room.activeCell) {
          const key = `${room.activeCell.ti}-${room.activeCell.ni}`;
          if (!room.cellData[key]) room.cellData[key] = { history: [] };
          const history = room.cellData[key].history;
          if (!history.some(h => h.playerId === player.id && h.result === "falstart")) {
            history.push({
              playerId: player.id,
              playerName: player.name,
              result: "falstart",
              nominal: null,
              ts: Date.now(),
            });
          }
          room.falstartBlocked.add(player.id);
          if (!this._hasEligibleBuzzers(room, room.activeCell.ti, room.activeCell.ni)) {
            clearTimeout(room.timerTimeout);
            room.timerEnd = null;
            room.timerPausedRemaining = null;
            room.timerHeldByBuzz = false;
            room.timerStarted = false;
            room.cellLocked = true;
            room.buzzOrder = [];
          }
          return { room, falstart: true, playerId: player.id };
        }
        // Falstart disabled: allow buzz freely (no timer to stop)
      }
      // Timer was started but stopped by first buzz — allow freely
    }

    const latencyOffset = room.settings.latencyCompensation === false ? 0 : Math.floor(player.latency / 2);
    const effectiveTime = Date.now() - latencyOffset;
    if (room.settings.queuedAnswers === false && room.buzzOrder.length > 0) {
      const firstBuzzTime = room.buzzOrder[0].effectiveTime;
      if (effectiveTime > firstBuzzTime + LATE_BUZZ_WINDOW_MS) return null;
    }
    room.buzzOrder.push({ playerId: player.id, socketId, name: player.name, effectiveTime });
    room.buzzOrder.sort((a, b) => a.effectiveTime - b.effectiveTime);

    // Stop timer on first buzz (only if timer is running)
    if (room.timerEnd && room.buzzOrder.length === 1) {
      clearTimeout(room.timerTimeout);
      room.timerEnd = null;
      room.timerPausedRemaining = null;
      room.timerHeldByBuzz = true;
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
      room.timerPausedRemaining = null;
      room.timerHeldByBuzz = false;
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
      const wrongCount = room.cellData[key].history.filter(h => h.result === "wrong").length;
      if (wrongCount >= room.settings.wrongAnswerLimit) {
        clearTimeout(room.timerTimeout);
        room.timerEnd = null;
        room.timerPausedRemaining = null;
        room.timerHeldByBuzz = false;
        room.timerStarted = false;
        room.cellLocked = true;
        room.buzzOrder = [];
        return { room };
      }

      if (room.settings.queuedAnswers === false) {
        room.buzzOrder = [];
        clearTimeout(room.timerTimeout);
        if (room.timerHeldByBuzz && this._hasEligibleBuzzers(room, ti, ni)) {
          const ms = room.settings.timer * 1000;
          room.timerEnd = Date.now() + ms;
          room.timerPausedRemaining = null;
          room.timerHeldByBuzz = false;
          room.timerStarted = true;
          return { room, timerEnd: room.timerEnd, ti, ni, ms };
        }
      } else {
        room.buzzOrder = room.buzzOrder.filter(b => b.playerId !== playerId);
      }

      // If no one left in buzzOrder, auto-advance to next question
      if (room.buzzOrder.length === 0) {
        clearTimeout(room.timerTimeout);
        if (room.timerHeldByBuzz && this._hasEligibleBuzzers(room, ti, ni)) {
          const ms = room.settings.timer * 1000;
          room.timerEnd = Date.now() + ms;
          room.timerPausedRemaining = null;
          room.timerHeldByBuzz = false;
          room.timerStarted = true;
          return { room, timerEnd: room.timerEnd, ti, ni, ms };
        }

        // Timer was never started yet and there are still eligible buzzers:
        // stay on this cell so host can finish reading and start the timer.
        if (!room.timerStarted && this._hasEligibleBuzzers(room, ti, ni)) {
          return { room };
        }

        room.timerEnd = null;
        room.timerPausedRemaining = null;
        room.timerHeldByBuzz = false;
        room.timerStarted = false;
        const next = this._findNextOpenCell(room, ti, ni);
        room.falstartBlocked = new Set();
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
    room.timerPausedRemaining = null;
    room.timerHeldByBuzz = false;
    room.timerStarted = false;
    room.buzzOrder = [];
    room.falstartBlocked = new Set();
    room.cellLocked = false;

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
      const text = String(content || "").trim();
      if (text.length > MAX_ATTACHMENT_TEXT_LENGTH) {
        return { room, error: `Matn ${MAX_ATTACHMENT_TEXT_LENGTH} belgidan oshmasin` };
      }
      existing.text = text;
    } else if (type === "image") {
      if (typeof content !== "string" || !content.startsWith("data:image/")) {
        return { room, error: "Faqat rasm faylini yuklash mumkin" };
      }
      const imageBytes = estimateDataUrlBytes(content);
      if (imageBytes > MAX_ATTACHMENT_IMAGE_BYTES) {
        return { room, error: "Rasm hajmi 2MB dan oshmasin" };
      }
      const currentSize = getRoomAttachmentSize(room) - getAttachmentSize(existing);
      if (currentSize + getAttachmentSize({ ...existing, image: content }) > MAX_ROOM_ATTACHMENT_BYTES) {
        return { room, error: "Xona bo'yicha ilovalar hajmi 5MB dan oshmasin" };
      }
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
    room.timerPausedRemaining = null;
    room.timerHeldByBuzz = false;
    room.timerStarted = false;
    room.buzzOrder = [];
    room.falstartBlocked = new Set();
    room.cellLocked = false;

    return { room };
  }

  resetAllScores(socketId) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;

    clearTimeout(room.timerTimeout);
    room.topicScores = [];
    room.topicNominals = [];
    room.cellData = {};
    room.currentTopicIdx = 0;
    room.activeCell = room.phase === "playing" && room.topicNames.length > 0 ? { ti: 0, ni: 0 } : null;
    room.timerEnd = null;
    room.timerPausedRemaining = null;
    room.timerHeldByBuzz = false;
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

  renameTopic(socketId, { ti, name }) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;

    const idx = Number(ti);
    if (!Number.isInteger(idx) || idx < 0 || idx >= room.topicNames.length) return null;

    const nextName = String(name || "").trim();
    if (!nextName) return { room };

    room.topicNames[idx] = nextName;
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
    room.timerPausedRemaining = null;
    room.timerHeldByBuzz = false;
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
    this.scheduleCleanup(() => {
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
      serverNow: Date.now(),
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
      timerPausedRemaining: room.timerPausedRemaining || null,
      timerHeldByBuzz: room.timerHeldByBuzz || false,
      timerStarted: room.timerStarted || false,
      buzzOrder: room.buzzOrder.map(b => ({ playerId: b.playerId, socketId: b.socketId, name: b.name, effectiveTime: b.effectiveTime })),
      falstartBlocked: [...room.falstartBlocked],
      cellLocked: room.cellLocked || false,
    };
  }
}
