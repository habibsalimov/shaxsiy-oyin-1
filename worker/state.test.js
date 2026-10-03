import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

// Test the real event handlers with synchronous SQLite and hibernation attachments.
// The workerd smoke suite separately exercises the Cloudflare runtime bindings.
const source = (await readFile(new URL('./index.js', import.meta.url), 'utf8'))
  .replace("import { DurableObject } from 'cloudflare:workers';", 'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }')
  .replace("'../server/GameManager.js'", JSON.stringify(new URL('../server/GameManager.js', import.meta.url).href));
globalThis.WebSocketRequestResponsePair = class { constructor(request, response) { this.request = request; this.response = response; } };
const { GameRoom, initializeWithRetry, default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function context() {
  const db = new DatabaseSync(':memory:');
  return {
    sockets: [], alarmAt: null,
    storage: {
      sql: { exec(sql, ...values) { const stmt = db.prepare(sql); const rows = stmt.all(...values); return { toArray: () => rows }; } },
      transactionSync(fn) { db.exec('BEGIN'); try { fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
      alarmWrites: 0,
      async setAlarm(time) { this.alarmAt = time; this.alarmWrites++; }, async deleteAlarm() { this.alarmAt = null; },
    },
    setWebSocketAutoResponse() {}, getWebSockets() { return this.sockets; },
  };
}
function socket(ctx, id) {
  const ws = {
    meta: { id, address: id, joined: false }, messages: [],
    deserializeAttachment() { return structuredClone(this.meta); },
    serializeAttachment(meta) { this.meta = structuredClone(meta); },
    send(raw) { this.messages.push(JSON.parse(raw)); }, close() {},
  };
  ctx.sockets.push(ws);
  return ws;
}
async function message(room, ws, event, data) { await room.webSocketMessage(ws, JSON.stringify({ event, data })); }
async function setup(env = {}) {
  const ctx = context();
  const room = new GameRoom(ctx, env);
  const creation = await room.initialize('1234', { hostName: 'Host', topics: ['Topic'], timer: 7, nominals: [10, 20] });
  const host = socket(ctx, 'host');
  const player = socket(ctx, 'player');
  await message(room, host, 'join-room', { code: '1234', playerName: 'Host', isHost: true, hostToken: creation.hostToken });
  await message(room, player, 'join-room', { code: '1234', playerName: 'Player' });
  return { ctx, room, host, player, creation };
}

test('SQLite state restores large attachments, sets and live socket mappings after eviction', async () => {
  const { ctx, room, host, player } = await setup();
  await message(room, host, 'set-attachment', { ti: 0, ni: 0, type: 'image', content: `data:image/png;base64,${'A'.repeat(2_500_000)}` });
  const writesBefore = ctx.storage.sql.exec('SELECT total_changes() AS count').toArray()[0].count;
  await message(room, host, 'block-player', { playerId: room.room.players[0].id });
  const writesAfter = ctx.storage.sql.exec('SELECT total_changes() AS count').toArray()[0].count;
  assert(writesAfter - writesBefore < 10, 'ordinary events must not rewrite attachment chunks');
  const restored = new GameRoom(ctx, {});
  assert.equal(restored.room.attachments['0-0'].image.length, 2_500_022);
  assert(restored.room.blockedPlayers.has(room.room.players[0].id));
  assert.equal(restored.gm.socketToRoom.get(player.meta.id), '1234');
  assert.equal(restored.room.hostToken, room.room.hostToken);
  assert(ctx.storage.sql.exec('SELECT * FROM attachment_chunks').toArray().length > 30);
});

test('an overdue durable timer expires once after eviction and schedules room cleanup', async () => {
  const { ctx, room, host } = await setup();
  await message(room, host, 'start-game');
  await message(room, host, 'start-timer', { ti: 0, ni: 0 });
  room.room.timerEnd = Date.now() - 10;
  room.persist();
  const restored = new GameRoom(ctx, {});
  await restored.alarm();
  assert.equal(restored.room.timerEnd, null);
  assert.equal(restored.room.cellLocked, true);
  assert.equal(restored.room.cellData['0-0'].history.length, 1);
  await restored.alarm();
  assert.equal(restored.room.cellData['0-0'].history.length, 1);
  assert(ctx.storage.alarmAt > Date.now());
});

test('failed D1 result is durable and retries before game-finished is emitted', async () => {
  let fails = true;
  const saved = [];
  const env = { DB: { prepare() { return { bind(...values) { return { async run() { if (fails) throw new Error('offline'); saved.push(values); } }; } }; } } };
  const { ctx, room, host } = await setup(env);
  await message(room, host, 'finish-game');
  assert(room.room.pendingResult);
  assert(!host.messages.some(m => m.event === 'game-finished'));
  const id = room.room.pendingResult.id;
  fails = false;
  const restored = new GameRoom(ctx, env);
  await restored.alarm();
  assert.equal(saved.length, 1);
  assert.equal(saved[0][0], id);
  assert.equal(restored.room.pendingResult, undefined);
  assert.equal(restored.room.finalResult.id, id);
  assert(host.messages.some(m => m.event === 'game-finished'));
});

test('host name cannot replace token and malformed indexes cannot mutate state', async () => {
  const { ctx, room, host } = await setup();
  const attacker = socket(ctx, 'attacker');
  await message(room, attacker, 'join-room', { code: '1234', playerName: 'Host', isHost: true });
  assert.equal(room.room.hostSocketId, 'host');
  await message(room, host, 'start-game');
  await message(room, host, 'start-timer', { ti: 9999999, ni: 0 });
  await message(room, host, 'constructor');
  assert.equal(room.room.timerEnd, null);
  assert.equal(room.room.topicScores.length, 1);
});

test('add-topic without a name retains the host UI default-name behavior', async () => {
  const { room, host } = await setup();
  await message(room, host, 'add-topic', {});
  assert.deepEqual(room.room.topicNames, ['Topic', '2-mavzu']);
  assert(!host.messages.some(m => m.event === 'error'));
});

test('pending results prevent room reuse, rearm failed alarms, and allow reconnect for completion', async () => {
  let fails = true;
  const env = { DB: { prepare() { return { bind() { return { async run() { if (fails) throw new Error('offline'); } }; } }; } } };
  const { ctx, room, host, creation } = await setup(env);
  await message(room, host, 'finish-game');
  room.room.cleanupAt = Date.now() - 1000;
  room.persist();
  const restored = new GameRoom(ctx, env);
  assert.equal(await restored.initialize('1234', { hostName: 'Other' }), null);
  for (let i = 0; i < 8; i++) {
    await restored.alarm();
    assert(ctx.storage.alarmAt >= Date.now() + 9000);
    assert(restored.room.pendingResult);
  }
  const reconnect = socket(ctx, 'new-host');
  await message(restored, reconnect, 'join-room', { code: '1234', playerName: 'Host', isHost: true, hostToken: creation.hostToken });
  assert.equal(reconnect.meta.joined, true);
  assert(!reconnect.messages.some(m => m.event === 'error'));
  fails = false;
  await restored.alarm();
  assert(reconnect.messages.some(m => m.event === 'game-finished'));
});

test('buzz bursts persist every answer, freeze immediately, and coalesce full state fanout', async () => {
  const { ctx, room, host, player } = await setup();
  const players = [player];
  for (let i = 1; i < 20; i++) {
    const peer = socket(ctx, `player-${i}`);
    await message(room, peer, 'join-room', { code: '1234', playerName: `Player ${i}` });
    players.push(peer);
  }
  await message(room, host, 'update-settings', { queuedAnswers: true });
  await message(room, host, 'start-game');
  await message(room, host, 'start-timer', { ti: 0, ni: 0 });
  host.messages.length = 0;
  const alarmsBefore = ctx.storage.alarmWrites;
  await message(room, players[0], 'buzz');
  const first = host.messages.find(m => m.event === 'game-state').data;
  assert.equal(first.timerEnd, null);
  assert.equal(first.timerHeldByBuzz, true);
  assert.equal(first.buzzOrder.length, 1);
  for (const peer of players.slice(1)) await message(room, peer, 'buzz');
  assert.equal(host.messages.filter(m => m.event === 'game-state').length, 1);
  assert.equal(host.messages.filter(m => m.event === 'buzz-update').length, 20);
  assert.equal(new GameRoom(ctx, {}).room.buzzOrder.length, 20, 'coalescing must not defer durable game state');
  assert.equal(ctx.storage.alarmWrites, alarmsBefore, 'a burst keeps the existing earlier alarm');
  await new Promise(resolve => setTimeout(resolve, 40));
  const states = host.messages.filter(m => m.event === 'game-state');
  assert.equal(states.length, 2);
  assert.equal(states[1].data.buzzOrder.length, 20);
  assert.deepEqual(states[1].data.buzzOrder.map(p => p.playerId), room.room.buzzOrder.map(p => p.playerId));
});

test('a host action cancels pending burst state and publishes the newer state immediately', async () => {
  const { ctx, room, host, player } = await setup();
  const second = socket(ctx, 'second');
  await message(room, second, 'join-room', { code: '1234', playerName: 'Second' });
  await message(room, host, 'update-settings', { queuedAnswers: true });
  await message(room, host, 'start-game');
  await message(room, player, 'buzz');
  await message(room, second, 'buzz');
  assert.notEqual(room.pendingStateTimer, null);
  host.messages.length = 0;
  await message(room, host, 'judge', { playerId: room.room.players[0].id, result: 'correct' });
  assert.equal(room.pendingStateTimer, null);
  assert.equal(host.messages.filter(m => m.event === 'game-state').length, 1);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(host.messages.filter(m => m.event === 'game-state').length, 1);
  assert.equal(room.room.buzzOrder.length, 0);
});

test('earlier cached alarms recheck the current cleanup deadline when they fire', async () => {
  const { ctx, room } = await setup();
  const originalDeadline = ctx.storage.alarmAt;
  const writes = ctx.storage.alarmWrites;
  room.room.lastActivityAt += 60000;
  await room.schedule();
  assert.equal(ctx.storage.alarmAt, originalDeadline);
  assert.equal(ctx.storage.alarmWrites, writes);
  await room.alarm();
  assert(ctx.storage.alarmAt > originalDeadline);
  assert.equal(ctx.storage.alarmWrites, writes + 1);
});

test('room initialization is idempotent after a committed response is lost and object evicts', async () => {
  const ctx = context();
  const room = new GameRoom(ctx, {});
  const creationId = crypto.randomUUID();
  const first = await room.initialize('4321', { hostName: 'Original' }, creationId);
  const restored = new GameRoom(ctx, {});
  const retry = await restored.initialize('4321', { hostName: 'Ignored retry data' }, creationId);
  assert.deepEqual(retry, first);
  assert.equal(restored.room.hostName, 'Original');
  assert.equal(await restored.initialize('4321', { hostName: 'Another' }, crypto.randomUUID()), null);
  assert.equal(restored.gm.getGameState(restored.room).creationId, undefined);
});

function creationEnv(errors) {
  const attempts = [];
  let stubs = 0;
  return {
    attempts,
    get stubs() { return stubs; },
    ROOMS: {
      idFromName(code) { return code; },
      get(code) {
        const stubId = ++stubs;
        return { async initialize(...args) {
          attempts.push({ code, stubId, args });
          const error = errors.shift();
          if (error) throw error;
          return { code, hostToken: 'secret' };
        } };
      },
    },
  };
}

test('retryable creation RPCs use three fresh stubs, one creation ID, and bounded backoff', async () => {
  const retryable = Object.assign(new Error('temporary'), { retryable: true });
  const env = creationEnv([retryable, retryable]);
  const delays = [];
  const result = await initializeWithRetry(env, '1234', { hostName: 'Host' }, 'creation-id', async ms => delays.push(ms));
  assert.equal(result.code, '1234');
  assert.deepEqual(delays, [100, 200]);
  assert.equal(env.stubs, 3);
  assert(env.attempts.every(attempt => attempt.args[2] === 'creation-id'));
  const exhausted = creationEnv([retryable, retryable, retryable]);
  await assert.rejects(initializeWithRetry(exhausted, '1234', {}, 'same-id', async () => {}));
  assert.equal(exhausted.stubs, 3);
});

test('permanent and overloaded creation failures never retry', async () => {
  for (const flags of [{}, { retryable: true, overloaded: true }]) {
    const env = creationEnv([Object.assign(new Error('failure'), flags)]);
    await assert.rejects(initializeWithRetry(env, '1234', {}, 'id', async () => assert.fail('must not delay')));
    assert.equal(env.stubs, 1);
  }
});

test('creation failure returns JSON503 with Retry-After and logs only safe flags', async () => {
  const env = creationEnv([Object.assign(new Error('sensitive internal message'), { overloaded: true })]);
  const logs = [];
  const original = console.error;
  console.error = value => logs.push(JSON.parse(value));
  try {
    const response = await worker.fetch(new Request('https://example.com/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostName: 'Private Host' }) }), env);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Retry-After'), '1');
    assert((await response.json()).error);
    assert.deepEqual(logs, [{ event: 'room_creation_failed', retryable: false, overloaded: true }]);
  } finally { console.error = original; }
});

test('idempotent creation retry repairs an alarm write that failed after state persisted', async () => {
  const ctx = context();
  const room = new GameRoom(ctx, {});
  const creationId = crypto.randomUUID();
  const setAlarm = ctx.storage.setAlarm;
  ctx.storage.setAlarm = async () => { throw Object.assign(new Error('temporary'), { retryable: true }); };
  await assert.rejects(room.initialize('4321', { hostName: 'Host' }, creationId));
  const committedToken = room.room.hostToken;
  ctx.storage.setAlarm = setAlarm;
  const restored = new GameRoom(ctx, {});
  const retried = await restored.initialize('4321', { hostName: 'Host' }, creationId);
  assert.equal(retried.hostToken, committedToken);
  assert(ctx.storage.alarmAt > Date.now());
});

test('latency-adjusted buzz reorder is retained in the coalesced state', async () => {
  const { ctx, room, host, player } = await setup();
  const second = socket(ctx, 'second');
  await message(room, second, 'join-room', { code: '1234', playerName: 'Second' });
  await message(room, host, 'update-settings', { queuedAnswers: true });
  await message(room, host, 'start-game');
  room.room.players[1].latency = 1000;
  await message(room, player, 'buzz');
  await message(room, second, 'buzz');
  await new Promise(resolve => setTimeout(resolve, 40));
  const last = host.messages.filter(m => m.event === 'game-state').at(-1).data;
  assert.equal(last.buzzOrder[0].socketId, 'second');
});
