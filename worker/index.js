import { DurableObject } from 'cloudflare:workers';
import { GameManager } from '../server/GameManager.js';

const TTL = 3 * 60 * 60 * 1000;
const MAX_MESSAGE = 10_000_000;
const CODE = /^\d{4}$/;
const bad = (message = "So'rov noto'g'ri", status = 400) => Response.json({ error: message }, { status });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const name = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
function settingsValid(data) {
  return object(data) && (data.wrongAnswerLimit === undefined || (Number.isInteger(Number(data.wrongAnswerLimit)) && Number(data.wrongAnswerLimit) >= 1 && Number(data.wrongAnswerLimit) <= 250)) && (data.timer === undefined || (Number.isFinite(Number(data.timer)) && Number(data.timer) >= 1 && Number(data.timer) <= 3600)) &&
    (data.nominals === undefined || (Array.isArray(data.nominals) && data.nominals.length > 0 && data.nominals.length <= 50 && data.nominals.every(n => Number.isSafeInteger(n) && n > 0 && n <= 1000000)));
}
function createValid(data) {
  return settingsValid(data) && name(data.hostName) &&
    (data.topics === undefined || (Array.isArray(data.topics) && data.topics.length <= 100 && data.topics.every(name))) &&
    (data.rounds === undefined || (Number.isInteger(Number(data.rounds)) && Number(data.rounds) >= 0 && Number(data.rounds) <= 100));
}
function stub(env, code) { return env.ROOMS.get(env.ROOMS.idFromName(code)); }

export async function initializeWithRetry(env, code, data, creationId, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await stub(env, code).initialize(code, data, creationId); } catch (error) {
      // An RPC can commit before its response is lost. The same ID makes retry safe.
      if (!error?.retryable || error.overloaded || attempt === 2) throw error;
      await pause(100 * (2 ** attempt));
    }
  }
}


export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return Response.json({ ok: true });
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) return bad('Forbidden', 403);
      if (Number(request.headers.get('content-length')) > 32_000) return bad();
      let data;
      try { const text = await request.text(); if (text.length > 32_000) return bad(); data = JSON.parse(text); } catch { return bad(); }
      if (!createValid(data)) return bad();
      const creationId = crypto.randomUUID();
      for (let i = 0; i < 100; i++) {
        const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');
        let result;
        try { result = await initializeWithRetry(env, code, data, creationId); } catch (error) {
          console.error(JSON.stringify({ event: 'room_creation_failed', retryable: error?.retryable === true, overloaded: error?.overloaded === true }));
          return Response.json({ error: 'Xona yaratib bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.' }, { status: 503, headers: { 'Retry-After': '1' } });
        }
        if (result) return Response.json(result, { status: 201 });
      }
      return bad('Bo‘sh xona topilmadi', 503);
    }
    if (url.pathname === '/ws') {
      const code = url.searchParams.get('code');
      if (!CODE.test(code || '')) return bad();
      if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) return bad('Forbidden', 403);
      return stub(env, code).fetch(request);
    }
    if (url.pathname === '/api/results' && request.method === 'GET') {
      const limit = Math.max(1, Math.min(Number.parseInt(url.searchParams.get('limit'), 10) || 50, 200));
      const { results } = await env.DB.prepare('SELECT id, host_name AS hostName, player_count AS playerCount, created_at AS createdAt FROM game_results ORDER BY created_at DESC LIMIT ?').bind(limit).all();
      return Response.json(results);
    }
    if (url.pathname.startsWith('/api/results/') && request.method === 'GET') {
      const id = url.pathname.slice('/api/results/'.length);
      if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return bad();
      const row = await env.DB.prepare('SELECT * FROM game_results WHERE id = ?').bind(id).first();
      return row ? Response.json({ id: row.id, hostName: row.host_name, playerCount: row.player_count, createdAt: row.created_at, ...JSON.parse(row.data) }) : bad('Natija topilmadi', 404);
    }
    if (url.pathname.startsWith('/api/')) return bad('Not found', 404);
    return env.ASSETS.fetch(request);
  },
};

const methods = {
  'start-game': 'startGame', 'start-timer': 'startTimer', 'pause-timer': 'pauseTimer',
  'resume-timer': 'resumeTimer', buzz: 'buzz', judge: 'judge', 'correct-score': 'correctScore',
  'skip-question': 'skipQuestion', 'set-attachment': 'setAttachment', 'remove-attachment': 'removeAttachment',
  'lock-cell': 'lockCell', 'reset-cell': 'resetCell', 'reset-all-scores': 'resetAllScores',
  'update-settings': 'updateSettings', 'update-host-name': 'updateHostName', 'add-topic': 'addTopic',
  'rename-topic': 'renameTopic', 'lock-room': 'lockRoom', 'block-player': 'blockPlayer', 'remove-player': 'removePlayer',
};
const cellEvents = new Set(['start-timer', 'correct-score', 'skip-question', 'set-attachment', 'remove-attachment', 'reset-cell']);

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.gm = new GameManager({ scheduleCleanup: () => {} });
    this.room = null;
    this.queue = Promise.resolve();
    this.scheduledAlarmAt = null;
    this.pendingStateTimer = null;
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS state_chunks (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS attachment_chunks (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
    const chunks = ctx.storage.sql.exec('SELECT data FROM state_chunks ORDER BY id').toArray();
    if (chunks.length) {
      const saved = JSON.parse(chunks.map(c => c.data).join(''));
      this.room = saved.room;
      const attachments = ctx.storage.sql.exec('SELECT data FROM attachment_chunks ORDER BY id').toArray();
      this.room.attachments = attachments.length ? JSON.parse(attachments.map(c => c.data).join('')) : (this.room.attachments || {});
      this.room.blockedPlayers = new Set(this.room.blockedPlayers);
      this.room.falstartBlocked = new Set(this.room.falstartBlocked);
      this.gm.rooms.set(this.room.code, this.room);
      this.gm.socketToRoom = new Map(saved.sockets);
      this.gm.joinAttempts = new Map(saved.attempts);
    }
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('__ping', '__pong'));
  }

  // Serialize events across D1 writes without holding blockConcurrencyWhile over I/O.
  serial(fn) {
    const next = this.queue.then(fn);
    this.queue = next.catch(() => {});
    return next;
  }

  persist(attachmentsChanged = false) {
    const data = this.room ? JSON.stringify({ room: { ...this.room, attachments: undefined, timerTimeout: null, blockedPlayers: [...this.room.blockedPlayers], falstartBlocked: [...this.room.falstartBlocked] }, sockets: [...this.gm.socketToRoom], attempts: [...this.gm.joinAttempts].filter(([, b]) => Date.now() - b.windowStart < 120000) }) : '';
    const writeChunks = (table, value) => {
      this.ctx.storage.sql.exec(`DELETE FROM ${table}`);
      for (let i = 0, index = 0; i < value.length; index++) {
        let end = Math.min(i + 64_000, value.length);
        if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1])) end--;
        this.ctx.storage.sql.exec(`INSERT INTO ${table} (id, data) VALUES (?, ?)`, index, value.slice(i, end));
        i = end;
      }
    };
    this.ctx.storage.transactionSync(() => {
      writeChunks('state_chunks', data);
      if (attachmentsChanged || !this.room) writeChunks('attachment_chunks', this.room ? JSON.stringify(this.room.attachments) : '');
    });
  }

  async schedule() {
    if (!this.room) { this.scheduledAlarmAt = null; return this.ctx.storage.deleteAlarm(); }
    const room = this.room;
    let deadline = room.cleanupAt || room.lastActivityAt + TTL;
    if (room.timerEnd) deadline = Math.min(deadline, room.timerEnd);
    if (room.pendingResult) deadline = Math.min(deadline, Date.now() + 10000);
    deadline = Math.max(Date.now() + 1, deadline);
    // Keeping an earlier alarm is safe: it rechecks the authoritative deadlines.
    if (this.scheduledAlarmAt !== null && this.scheduledAlarmAt <= deadline) return;
    await this.ctx.storage.setAlarm(deadline);
    this.scheduledAlarmAt = deadline;
  }

  initialize(code, data, creationId) {
    return this.serial(async () => {
      if (creationId && this.room?.creationId === creationId) {
        await this.schedule();
        return { code: this.room.code, hostToken: this.room.hostToken };
      }
      if (this.room && (this.room.pendingResult || Date.now() < (this.room.cleanupAt || this.room.lastActivityAt + TTL))) return null;
      if (!CODE.test(code) || !createValid(data)) throw new Error('Invalid room');
      this.clearRoom();
      const created = this.gm.createRoom('pending-host', data);
      this.gm.rooms.delete(created.code);
      this.room = created.room;
      this.room.code = code;
      this.room.creationId = creationId;
      this.room.hostToken = crypto.randomUUID();
      this.room.hostConnected = false;
      this.gm.rooms.set(code, this.room);
      this.gm.socketToRoom.clear();
      this.persist(true);
      await this.schedule();
      return { code, hostToken: this.room.hostToken };
    });
  }

  fetch(request) {
    return this.serial(async () => {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return bad('WebSocket required', 426);
      if (!this.room || (!this.room.pendingResult && Date.now() >= (this.room.cleanupAt || this.room.lastActivityAt + TTL))) return bad('Xona topilmadi', 404);
      if (this.ctx.getWebSockets().length >= 300) return bad('Xona to‘la', 429);
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ id: crypto.randomUUID(), address: request.headers.get('CF-Connecting-IP') || 'unknown', joined: false });
      this.send(server, 'connected', { id: server.deserializeAttachment().id });
      return new Response(null, { status: 101, webSocket: client });
    });
  }

  send(ws, event, data) {
    try { ws.send(JSON.stringify({ event, data })); } catch { /* Close event removes the connection. */ }
  }
  broadcast(event, data) {
    const encoded = JSON.stringify({ event, data });
    for (const ws of this.ctx.getWebSockets()) {
      if (!ws.deserializeAttachment()?.joined) continue;
      try { ws.send(encoded); } catch { /* Close event removes the connection. */ }
    }
  }
  cancelPendingState() {
    if (this.pendingStateTimer !== null) clearTimeout(this.pendingStateTimer);
    this.pendingStateTimer = null;
  }
  state() {
    this.cancelPendingState();
    if (this.room) this.broadcast('game-state', this.gm.getGameState(this.room));
  }
  queueState() {
    if (this.pendingStateTimer !== null) return;
    // Only burst updates use this short timer; idle rooms still hibernate.
    this.pendingStateTimer = setTimeout(() => {
      this.pendingStateTimer = null;
      this.serial(() => this.state()).catch(() => {});
    }, 20);
  }
  error(ws, message = "So'rov noto'g'ri") { this.send(ws, 'error', { message }); }
  ping(ws) {
    const meta = ws.deserializeAttachment();
    meta.pingAt = Date.now();
    ws.serializeAttachment(meta);
    this.send(ws, 'ping-latency', meta.pingAt);
  }

  valid(event, data) {
    const room = this.room;
    if (!object(data)) return false;
    if (cellEvents.has(event) && (!Number.isInteger(data.ti) || data.ti < 0 || data.ti >= room.topicNames.length || !Number.isInteger(data.ni) || data.ni < 0 || data.ni >= this.gm._getTopicNominals(room, data.ti).length)) return false;
    if (['judge', 'correct-score', 'remove-player', 'block-player'].includes(event) && !room.players.some(p => p.id === data.playerId)) return false;
    if (event === 'judge' && !['correct', 'wrong'].includes(data.result)) return false;
    if (event === 'update-settings' && !settingsValid(data)) return false;
    if (event === 'update-host-name' && !name(data.hostName)) return false;
    if (event === 'rename-topic' && !name(data.name)) return false;
    if (event === 'add-topic' && data.name !== undefined && !name(data.name)) return false;
    if (event === 'add-topic' && room.topicNames.length >= 100) return false;
    if (event === 'set-attachment' && !['text', 'image'].includes(data.type)) return false;
    if (event === 'remove-attachment' && data.type !== undefined && !['text', 'image'].includes(data.type)) return false;
    return true;
  }

  webSocketMessage(ws, raw) {
    return this.serial(async () => {
      if (typeof raw !== 'string' || raw.length > MAX_MESSAGE) return this.error(ws);
      let message;
      try { message = JSON.parse(raw); } catch { return this.error(ws); }
      if (!object(message) || typeof message.event !== 'string' || !this.room) return this.error(ws);
      const { event } = message;
      const data = message.data === undefined ? {} : message.data;
      const meta = ws.deserializeAttachment();
      const room = this.room;
      if (room.timerEnd && room.timerEnd <= Date.now()) { this.expireTimer(); await this.schedule(); }
      if (event === 'join-room') {
        if (!object(data) || data.code !== room.code || !name(data.playerName)) return this.error(ws);
        const guard = { code: room.code, address: meta.address, socketId: meta.id };
        if (this.gm.isJoinBlocked(guard)) return this.error(ws, "Juda ko'p urinish bo'ldi. Birozdan keyin qayta urinib ko'ring.");
        if (data.isHost && data.hostToken !== room.hostToken) {
          this.gm.recordJoinFailure(guard); this.persist(); return this.error(ws, "Xonaga qo'shilib bo'lmadi");
        }
        if (room.phase === 'finished') {
          if (room.pendingResult && (data.isHost || room.players.some(p => p.name === data.playerName))) {
            meta.joined = true; ws.serializeAttachment(meta);
            if (data.isHost) this.send(ws, 'room-created', { code: room.code, hostToken: room.hostToken });
            this.send(ws, 'game-state', this.gm.getGameState(room));
            return;
          }
          if (room.finalResult && (data.isHost || room.players.some(p => p.name === data.playerName))) this.send(ws, 'game-finished', { finalResult: room.finalResult });
          else this.error(ws, 'O‘yin tugagan');
          return;
        }
        if (meta.joined) return;
        if (room.players.length >= 250 && !data.isHost && !room.players.some(p => p.name === data.playerName && !p.connected)) return this.error(ws, 'Xona to‘la');
        const result = this.gm.joinRoom(meta.id, data);
        if (result.error) { this.gm.recordJoinFailure(guard); this.persist(); return this.error(ws, "Xonaga qo'shilib bo'lmadi"); }
        meta.joined = true; ws.serializeAttachment(meta);
        this.persist(); await this.schedule();
        if (result.isHost) this.send(ws, 'room-created', { code: room.code, hostToken: room.hostToken });
        this.send(ws, 'attachments-sync', room.attachments);
        this.ping(ws); this.state(); return;
      }
      if (!meta.joined || !this.gm.socketToRoom.has(meta.id)) return;
      if (event === 'pong-latency') {
        if (data !== meta.pingAt) return;
        const player = room.players.find(p => p.socketId === meta.id);
        if (player) player.latency = Math.max(0, Math.min(1000, Date.now() - meta.pingAt));
        delete meta.pingAt; ws.serializeAttachment(meta); this.persist(); return;
      }
      if (event === 'finish-game') {
        if (meta.id !== room.hostSocketId) return;
        this.cancelPendingState();
        const result = this.gm.finishGame(meta.id);
        if (!result) return;
        room.pendingResult = { id: crypto.randomUUID(), ...result.result };
        room.cleanupAt = Date.now() + 5 * 60 * 1000;
        this.persist(); await this.schedule();
        await this.saveFinished(); return;
      }
      const method = Object.hasOwn(methods, event) ? methods[event] : null;
      if (!method || room.phase === 'finished' || !this.valid(event, data)) return this.error(ws);
      if (room.timerEnd && room.timerEnd <= Date.now()) this.expireTimer();
      const hadBuzz = room.buzzOrder.length > 0;
      const result = this.gm[method](meta.id, data);
      if (!result) return;
      if (result.error) return this.error(ws, result.error);
      this.persist(event === 'set-attachment' || event === 'remove-attachment'); await this.schedule();
      if (event === 'set-attachment' || event === 'remove-attachment') {
        const key = `${data.ti}-${data.ni}`;
        this.broadcast('attachment-update', { key, data: room.attachments[key] || null }); return;
      }
      if (result.timerEnd) {
        this.broadcast('timer-started', { ti: result.ti, ni: result.ni, timerEnd: result.timerEnd });
        for (const peer of this.ctx.getWebSockets()) if (peer.deserializeAttachment()?.joined) this.ping(peer);
      }
      if (result.falstart) this.broadcast('falstart-caught', { playerId: result.playerId });
      if (event === 'buzz' && room.buzzOrder.length) this.broadcast('buzz-update', { buzzOrder: room.buzzOrder });
      if (event === 'remove-player') this.broadcast('player-removed', { playerId: data.playerId, socketId: result.removedSocketId || null });
      if (event === 'buzz' && hadBuzz && !result.falstart) this.queueState();
      else this.state();
    }).catch(() => this.error(ws, 'Amal bajarilmadi. Qayta urinib ko‘ring.'));
  }

  expireTimer() {
    const { ti, ni } = this.room.activeCell;
    this.gm.handleTimerExpiry(this.room, ti, ni);
    this.persist();
    this.broadcast('timer-expired', { ti, ni });
    this.state();
  }

  async saveFinished() {
    const room = this.room;
    if (!room?.pendingResult) return;
    const { id, ...result } = room.pendingResult;
    await this.env.DB.prepare('INSERT OR IGNORE INTO game_results (id, host_name, data, player_count) VALUES (?, ?, ?, ?)').bind(id, room.hostName, JSON.stringify(result), result.players.length).run();
    room.finalResult = room.pendingResult;
    delete room.pendingResult;
    this.persist(); await this.schedule();
    this.broadcast('game-finished', { finalResult: room.finalResult });
  }

  clearRoom() {
    this.cancelPendingState();
    this.scheduledAlarmAt = null;
    for (const ws of this.ctx.getWebSockets()) { try { ws.close(1000, 'Room expired'); } catch {} }
    this.room = null; this.gm.rooms.clear(); this.gm.socketToRoom.clear(); this.gm.joinAttempts.clear();
  }

  alarm() {
    return this.serial(async () => {
      this.scheduledAlarmAt = null;
      if (!this.room) return;
      if (this.room.pendingResult) {
        try { await this.saveFinished(); } catch {
          // Explicitly rearm: platform alarm retries are bounded, the outbox is not.
          this.scheduledAlarmAt = Date.now() + 10000;
          await this.ctx.storage.setAlarm(this.scheduledAlarmAt);
          return;
        }
      }
      if (Date.now() >= (this.room.cleanupAt || this.room.lastActivityAt + TTL)) { this.clearRoom(); this.persist(); await this.schedule(); return; }
      if (this.room.timerEnd && this.room.timerEnd <= Date.now()) this.expireTimer();
      await this.schedule();
    });
  }

  webSocketClose(ws) {
    return this.serial(async () => {
      const meta = ws.deserializeAttachment();
      if (!meta) return;
      this.gm.handleDisconnect(meta.id);
      this.persist(); await this.schedule(); this.state();
    });
  }
  webSocketError(ws) { return this.webSocketClose(ws); }
}
