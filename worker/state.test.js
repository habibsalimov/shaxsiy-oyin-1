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
const { GameRoom } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function context() {
  const db = new DatabaseSync(':memory:');
  return {
    sockets: [], alarmAt: null,
    storage: {
      sql: { exec(sql, ...values) { const stmt = db.prepare(sql); const rows = stmt.all(...values); return { toArray: () => rows }; } },
      transactionSync(fn) { db.exec('BEGIN'); try { fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
      async setAlarm(time) { this.alarmAt = time; }, async deleteAlarm() { this.alarmAt = null; },
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
