import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

// Node 22+ supplies native WebSocket. Defaults intentionally target local Wrangler.
const options = { url: 'http://localhost:8787', rooms: 5, players: 20, rounds: 3 };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]?.replace(/^--/, '');
  assert.ok(Object.hasOwn(options, key) && process.argv[i + 1], 'Use --url URL --rooms N --players N --rounds N');
  options[key] = key === 'url' ? process.argv[i + 1] : Number(process.argv[i + 1]);
}
const base = new URL(options.url);
assert.ok(['http:', 'https:'].includes(base.protocol), 'URL must use HTTP(S)');
assert.ok(!base.username && !base.password && !base.search && !base.hash, 'Use a plain origin URL');
for (const key of ['rooms', 'players', 'rounds']) assert.ok(Number.isInteger(options[key]) && options[key] > 0, `${key} must be a positive integer`);
assert.ok(options.rooms <= 10 && options.players <= 100 && options.rooms * options.players <= 300 && options.rounds <= 10, 'Limits: 10 rooms, 100 players/room, 300 total players, 10 rounds');
assert.equal(typeof WebSocket, 'function', 'Node 22+ with native WebSocket is required');
const origin = base.origin;
const runId = `Load-${Date.now()}`;
const clients = [];
const createdRooms = [];
const resultIds = [];
const samples = new Map();
const counts = { joined: 0, reconnected: 0, finished: 0, fetchedResults: 0 };
const timeoutMs = 30000;
const started = performance.now();
function record(label, since) {
  if (!samples.has(label)) samples.set(label, []);
  samples.get(label).push(performance.now() - since);
}
async function request(path, init) {
  return fetch(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
class Client {
  constructor(code, prefix) {
    this.code = code;
    this.prefix = prefix;
    this.latest = new Map();
    this.waiters = new Set();
    this.intentionalClose = false;
    this.ws = new WebSocket(`${origin.replace(/^http/, 'ws')}/ws?code=${code}`);
    clients.push(this);
    this.ws.addEventListener('message', ({ data }) => {
      try {
        const message = JSON.parse(data);
        if (message.event === 'ping-latency') return this.send('pong-latency', message.data);
        if (message.event === 'error') throw new Error(`Server error: ${JSON.stringify(message.data)}`);
        if (message.event === 'game-state') {
          assert.equal(message.data.code, code, 'Cross-room state leak');
          assert.ok(message.data.players.every(player => player.name.startsWith(prefix)), 'Cross-room player leak');
        }
        if (message.event === 'buzz-update') assert.ok(message.data.buzzOrder.every(player => player.name.startsWith(prefix)), 'Cross-room buzz leak');
        this.latest.set(message.event, message.data);
        for (const waiter of [...this.waiters]) if (waiter.event === message.event && waiter.predicate(message.data)) waiter.resolve(message.data);
      } catch (error) { this.fail(error); }
    });
    this.ws.addEventListener('error', () => this.fail(new Error(`WebSocket error in room ${code}`)));
    this.ws.addEventListener('close', () => { if (!this.intentionalClose) this.fail(new Error(`Unexpected disconnect in room ${code}`)); });
  }
  fail(error) { this.failure ||= error; for (const waiter of [...this.waiters]) waiter.reject(this.failure); }
  send(event, data) { if (this.failure) throw this.failure; this.ws.send(JSON.stringify({ event, data })); }
  wait(event, predicate = () => true) {
    if (this.failure) return Promise.reject(this.failure);
    if (this.latest.has(event) && predicate(this.latest.get(event))) return Promise.resolve(this.latest.get(event));
    return new Promise((resolve, reject) => {
      const done = (callback, value) => { clearTimeout(timer); this.waiters.delete(waiter); callback(value); };
      const waiter = { event, predicate, resolve: value => done(resolve, value), reject: error => done(reject, error) };
      const timer = setTimeout(() => waiter.reject(new Error(`Timed out waiting for ${event} in ${this.code}`)), timeoutMs);
      this.waiters.add(waiter);
    });
  }
  close() { this.intentionalClose = true; this.ws.close(); }
}
async function roomScenario(index) {
  const prefix = `${runId}-R${index}-`;
  const hostName = `${prefix}Host`;
  const nominals = Array.from({ length: options.rounds }, (_, i) => (i + 1) * 10);
  let since = performance.now();
  const response = await request('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostName, topics: ['Bounded load test'], nominals, timer: 30, falstart: true, queuedAnswers: true, latencyCompensation: false }) });
  if (response.status !== 201) {
    const body = await response.text();
    const diagnostic = body.slice(0, 512).replace(/(token|authorization|password|secret)[\s\":=]+[^\s,}]+/gi, '$1=[redacted]').replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]');
    throw new Error(`Room create failed: HTTP ${response.status}; cf-ray=${response.headers.get('cf-ray') || 'none'}; body=${JSON.stringify(diagnostic)}`);
  }
  const { code, hostToken } = await response.json();
  createdRooms.push(code);
  record('createRoomHttp', since);
  const host = new Client(code, prefix);
  await host.wait('connected');
  host.send('join-room', { code, playerName: hostName, isHost: true, hostToken });
  await host.wait('room-created');
  const players = await Promise.all(Array.from({ length: options.players }, async (_, playerIndex) => {
    const joinStart = performance.now();
    const client = new Client(code, prefix);
    client.name = `${prefix}P${playerIndex}`;
    await client.wait('connected');
    client.send('join-room', { code, playerName: client.name });
    const state = await client.wait('game-state', state => state.players.some(player => player.name === client.name));
    client.id = state.players.find(player => player.name === client.name).id;
    counts.joined++;
    record('connectAndJoin', joinStart);
    return client;
  }));
  const all = () => [host, ...players];
  await Promise.all(all().map(client => client.wait('game-state', state => state.players.length === options.players)));
  host.send('start-game');
  await Promise.all(all().map(client => client.wait('game-state', state => state.phase === 'playing')));
  const expectedScores = {};
  for (let round = 0; round < options.rounds; round++) {
    since = performance.now();
    host.send('start-timer', { ti: 0, ni: round });
    await Promise.all(all().map(client => client.wait('timer-started', timer => timer.ti === 0 && timer.ni === round)));
    record('timerCommandToAllClients', since);
    // Clear prior round messages; each retained event occupies one bounded slot.
    all().forEach(client => client.latest.delete('buzz-update'));
    since = performance.now();
    const firstBuzz = host.wait('buzz-update', update => update.buzzOrder.length > 0).then(() => record('buzzBurstToFirstHostUpdate', since));
    const acknowledgements = players.map(client => {
      const sentAt = performance.now();
      const acknowledged = client.wait('buzz-update', update => update.buzzOrder.some(buzz => buzz.playerId === client.id));
      client.send('buzz');
      return acknowledged.then(() => record('buzzToOwnAcknowledgement', sentAt));
    });
    await Promise.all([firstBuzz, ...acknowledgements]);
    const orders = await Promise.all(all().map(client => client.wait('buzz-update', update => update.buzzOrder.length === options.players)));
    record('buzzBurstToAllClients', since);
    const order = orders[0].buzzOrder.map(buzz => buzz.playerId);
    assert.equal(new Set(order).size, options.players, 'Duplicate buzzer');
    assert.deepEqual(new Set(order), new Set(players.map(player => player.id)), 'Unexpected buzzer');
    for (const update of orders) assert.deepEqual(update.buzzOrder.map(buzz => buzz.playerId), order, 'Clients disagree on buzz order');
    const winner = order[0];
    expectedScores[winner] ||= {};
    expectedScores[winner][nominals[round]] = 'correct';
    since = performance.now();
    host.send('judge', { playerId: winner, result: 'correct' });
    const scored = await Promise.all(all().map(client => client.wait('game-state', state => state.topicScores[0]?.[winner]?.[nominals[round]] === 'correct')));
    for (const state of scored) assert.deepEqual(state.topicScores, scored[0].topicScores, 'Clients disagree on scores');
    record('judgeCommandToAllClients', since);
  }
  const previous = players[0];
  previous.close();
  await host.wait('game-state', state => state.players.find(player => player.id === previous.id)?.connected === false);
  since = performance.now();
  const replacement = new Client(code, prefix);
  replacement.name = previous.name;
  replacement.id = previous.id;
  await replacement.wait('connected');
  replacement.send('join-room', { code, playerName: previous.name });
  const resumed = await replacement.wait('game-state', state => state.players.find(player => player.id === previous.id)?.connected === true);
  assert.equal(resumed.players.length, options.players, 'Reconnect created a duplicate player');
  assert.equal(resumed.players.find(player => player.name === previous.name)?.id, previous.id, 'Reconnect changed identity');
  for (const [id, scores] of Object.entries(expectedScores)) for (const [nominal, value] of Object.entries(scores)) assert.equal(resumed.topicScores[0][id][nominal], value, 'Reconnect lost score');
  players[0] = replacement;
  counts.reconnected++;
  record('reconnect', since);
  since = performance.now();
  host.send('finish-game');
  const finished = await Promise.all(all().map(client => client.wait('game-finished')));
  const result = finished[0].finalResult;
  resultIds.push(result.id);
  // Print immediately, so a later failed room still leaves targeted cleanup evidence.
  console.log(JSON.stringify({ event: 'saved-result', runId, code, resultId: result.id }));
  for (const clientResult of finished) assert.deepEqual(clientResult.finalResult, result, 'Clients disagree on final result');
  counts.finished++;
  record('finishToAllClients', since);
  since = performance.now();
  const storedResponse = await request(`/api/results/${encodeURIComponent(result.id)}`);
  assert.equal(storedResponse.status, 200);
  const stored = await storedResponse.json();
  assert.equal(stored.id, result.id);
  assert.equal(stored.players.length, options.players);
  assert.deepEqual(stored.topicScores, result.topicScores);
  counts.fetchedResults++;
  record('fetchSavedResultHttp', since);
  all().forEach(client => client.close());
}
function measurements() {
  return Object.fromEntries([...samples].map(([name, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const round = n => Math.round(n * 100) / 100;
    const middle = Math.floor(sorted.length / 2);
    return [name, { count: sorted.length, medianMs: round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2), p95Ms: round(sorted[Math.ceil(sorted.length * 0.95) - 1]), maxMs: round(sorted.at(-1)) }];
  }));
}
let failure;
try {
  // All rooms start together, including their player bursts.
  const outcomes = await Promise.allSettled(Array.from({ length: options.rooms }, (_, index) => roomScenario(index)));
  const errors = outcomes.filter(outcome => outcome.status === 'rejected');
  if (errors.length) throw new AggregateError(errors.map(outcome => outcome.reason), `${errors.length} room scenarios failed`);
  for (const client of clients) if (client.failure) throw client.failure;
} catch (error) {
  failure = error;
  console.error(error);
  process.exitCode = 1;
} finally {
  clients.forEach(client => client.close());
  console.log(JSON.stringify({ ok: !failure, runId, origin, configuration: options, elapsedMs: Math.round(performance.now() - started), counts, createdRooms, resultIds, measurements: measurements(), measurementScope: 'Client-observed HTTP/WebSocket elapsed time, including network, runtime, serialization, and load-generator scheduling; not server-only latency.' }, null, 2));
}
