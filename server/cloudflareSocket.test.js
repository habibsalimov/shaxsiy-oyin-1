import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudflareSocket } from '../src/socket.js';

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function setup(t, session = null) {
  const originals = new Map();
  const replace = (name, value) => {
    if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  const timeouts = new Map();
  const intervals = new Map();
  let timerId = 0;
  replace('setTimeout', (fn, delay) => { const id = ++timerId; timeouts.set(id, { fn, delay }); return id; });
  replace('clearTimeout', id => timeouts.delete(id));
  replace('setInterval', (fn, delay) => { const id = ++timerId; intervals.set(id, { fn, delay }); return id; });
  replace('clearInterval', id => intervals.delete(id));
  replace('window', { location: { href: 'https://game.example/' } });
  const storage = new Map(session ? [['game-session', JSON.stringify(session)]] : []);
  replace('sessionStorage', { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) });
  replace('fetch', async () => ({ ok: true }));
  const sockets = [];
  class MockWebSocket {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 1; this.sent = []; sockets.push(this); }
    send(data) { this.sent.push(data); }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(); }
    receive(event, data) { this.onmessage?.({ data: JSON.stringify({ event, data }) }); }
    envelopes() { return this.sent.filter(s => s !== '__ping').map(s => JSON.parse(s)); }
  }
  replace('WebSocket', MockWebSocket);
  const client = new CloudflareSocket();
  t.after(() => {
    client.stopConnection();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  return { client, sockets, timeouts, intervals, replace, runTimeout(delay) {
    const entry = [...timeouts].find(([, timer]) => timer.delay === delay);
    assert.ok(entry, `Expected timeout at ${delay}ms`);
    timeouts.delete(entry[0]); entry[1].fn();
  } };
}

test('landing readiness follows health status and retries a failed request', async t => {
  const env = setup(t);
  env.replace('fetch', async () => ({ ok: false }));
  await flush();
  assert.equal(env.client.connected, false);
  assert.equal(env.sockets.length, 0);
  env.replace('fetch', async () => ({ ok: true }));
  env.runTimeout(5000);
  await flush();
  assert.equal(env.client.connected, true);
});

test('unexpected close rejoins once with the stored host credentials and a new socket ID', async t => {
  const session = { roomCode: '1234', playerName: 'Host', isHost: true, hostToken: 'test-token' };
  const env = setup(t, session);
  await flush();
  const first = env.sockets[0];
  first.receive('connected', { id: 'first' });
  first.receive('game-state', { code: '1234' });
  first.close();
  assert.equal(env.client.connected, false);
  env.runTimeout(1000);
  const second = env.sockets[1];
  second.receive('connected', { id: 'second' });
  assert.equal(env.client.id, 'second');
  assert.deepEqual(second.envelopes(), [{ event: 'join-room', data: {
    code: '1234', playerName: 'Host', isHost: true, hostToken: 'test-token',
  } }]);
  first.receive('connected', { id: 'stale' });
  assert.equal(env.client.id, 'second');
});

for (const event of ['game-finished', 'player-removed']) {
  test(`${event} dispatches with current identity then cancels reconnect and heartbeat`, async t => {
    const env = setup(t);
    await flush();
    env.client.join({ code: '1234', playerName: 'Player' });
    const ws = env.sockets[0];
    ws.receive('connected', { id: 'player' });
    ws.receive('game-state', { code: '1234' });
    let observedId;
    env.client.on(event, () => { observedId = env.client.id; });
    ws.receive(event, { socketId: 'player', finalResult: {} });
    assert.equal(observedId, 'player');
    assert.equal(env.client.joinData, null);
    assert.equal(ws.readyState, 3);
    assert.equal(env.intervals.size, 0);
    assert.equal(env.timeouts.size, 0);
    await flush();
    assert.equal(env.client.connected, true);
    assert.equal(env.sockets.length, 1);
  });
}

test('rejected join delivers server error and never reconnects to the rejected room', async t => {
  const env = setup(t);
  await flush();
  let error;
  env.client.on('error', value => { error = value; });
  env.client.join({ code: '9999', playerName: 'Player' });
  const ws = env.sockets[0];
  ws.receive('connected', { id: 'player' });
  ws.receive('error', { message: 'Room does not exist' });
  await flush();
  assert.equal(error.message, 'Room does not exist');
  assert.equal(env.client.joinData, null);
  assert.equal(env.timeouts.size, 0);
  assert.equal(env.intervals.size, 0);
});

test('late room creation response cannot replace a newer explicit room join', async t => {
  const env = setup(t);
  await flush();
  let resolveRequest;
  env.replace('fetch', () => new Promise(resolve => { resolveRequest = resolve; }));
  let created = false;
  env.client.on('room-created', () => { created = true; });
  const creating = env.client.createRoom({ hostName: 'Host' });
  env.client.join({ code: '5678', playerName: 'Player' });
  resolveRequest({ ok: true, json: async () => ({ code: '1234', hostToken: 'obsolete' }) });
  await creating;
  assert.equal(created, false);
  assert.equal(env.sockets.length, 1);
  assert.equal(env.client.joinData.code, '5678');
  env.sockets[0].receive('connected', { id: 'current' });
  assert.equal(env.sockets[0].envelopes()[0].data.code, '5678');
});


test('confirmed player session is available before game-state subscribers route the UI', async t => {
  const env = setup(t);
  await flush();
  env.client.join({ code: '1234', playerName: 'Player' });
  const ws = env.sockets[0];
  ws.receive('connected', { id: 'player-socket' });
  let observedSession;
  env.client.on('game-state', () => {
    observedSession = JSON.parse(sessionStorage.getItem('game-session'));
  });
  ws.receive('game-state', { code: '1234', players: [{ socketId: 'someone-else' }] });
  assert.equal(observedSession, null);
  ws.receive('game-state', { code: '1234', players: [{ socketId: 'player-socket' }] });
  assert.deepEqual(observedSession, { roomCode: '1234', isHost: false, playerName: 'Player' });
});

test('HTTP creation and host handshake produce only one room-created notification', async t => {
  const env = setup(t);
  await flush();
  env.replace('fetch', async () => ({ ok: true, json: async () => ({ code: '1234', hostToken: 'token' }) }));
  let notifications = 0;
  env.client.on('room-created', () => { notifications++; });
  await env.client.createRoom({ hostName: 'Host' });
  const ws = env.sockets[0];
  ws.receive('connected', { id: 'host' });
  ws.receive('room-created', { code: '1234', hostToken: 'token' });
  assert.equal(notifications, 1);
});
