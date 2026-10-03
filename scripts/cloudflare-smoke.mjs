import assert from 'node:assert/strict';
const base = process.argv[2] || 'http://localhost:8787';
const clients = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
class Client {
  constructor(code) {
    this.events = [];
    this.ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws?code=${code}`);
    this.ws.addEventListener('message', ({data}) => {
      const msg = JSON.parse(data);
      if (msg.event === 'ping-latency') this.send('pong-latency', msg.data);
      this.events.push(msg);
    });
    clients.push(this);
  }
  send(event, data) { this.ws.send(JSON.stringify({event, data})); }
  async wait(event, predicate = () => true, timeout = 10000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const i = this.events.findIndex(e => e.event === event && predicate(e.data));
      if (i >= 0) return this.events.splice(i, 1)[0].data;
      await pause(15);
    }
    throw new Error(`Timed out: ${event}; received: ${this.events.map(e=>e.event).join(',')}`);
  }
  clear() { this.events.length = 0; }
  close() { this.ws.close(); }
}
try {
  const response = await fetch(`${base}/api/rooms`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({hostName:'Migration smoke test', topics:['Smoke'], nominals:[10,20,30], timer:2, falstart:true, latencyCompensation:false})});
  assert.equal(response.status, 201);
  const {code, hostToken} = await response.json();
  assert.match(code, /^\d{4}$/);
  const host = new Client(code); await host.wait('connected');
  host.send('join-room', {code, playerName:'Migration smoke test', isHost:true, hostToken});
  await host.wait('room-created'); await host.wait('game-state');
  const player = new Client(code); await player.wait('connected');
  player.send('join-room', {code, playerName:'Smoke Player'});
  const joined = await player.wait('game-state', s=>s.players.length===1);
  const playerId = joined.players[0].id;
  host.send('start-game'); await host.wait('game-state',s=>s.phase==='playing');
  player.send('buzz'); await host.wait('falstart-caught');
  host.send('reset-cell',{ti:0,ni:0}); await host.wait('game-state',s=>!s.cellLocked && s.falstartBlocked.length===0);
  host.send('start-timer',{ti:0,ni:0}); await host.wait('timer-started');
  player.send('buzz'); await host.wait('buzz-update',s=>s.buzzOrder.length===1);
  host.send('judge',{playerId,result:'correct'});
  await host.wait('game-state',s=>s.topicScores[0][playerId]?.[10]==='correct');
  player.close(); await host.wait('game-state',s=>s.players[0].connected===false);
  const reconnect = new Client(code); await reconnect.wait('connected');
  reconnect.send('join-room',{code,playerName:'Smoke Player'});
  const resumed=await reconnect.wait('game-state',s=>s.players[0].connected);
  assert.equal(resumed.players[0].id,playerId); assert.equal(resumed.topicScores[0][playerId][10],'correct');
  host.clear(); host.send('start-timer',{ti:0,ni:1}); await host.wait('timer-started');
  host.send('pause-timer'); await host.wait('game-state',s=>s.timerPausedRemaining>0);
  await pause(2200); assert.equal(host.events.some(e=>e.event==='timer-expired'),false);
  host.send('resume-timer'); await host.wait('timer-started'); await host.wait('timer-expired');
  host.send('set-attachment',{ti:0,ni:2,type:'text',content:'Migration attachment'});
  await reconnect.wait('attachment-update',s=>s.data?.text==='Migration attachment');
  // An idle interval allows the runtime to hibernate the room before reconnect.
  await pause(11000);
  const late = new Client(code); await late.wait('connected'); late.send('join-room',{code,playerName:'Late Player'});
  await late.wait('attachments-sync',s=>s['0-2']?.text==='Migration attachment');
  const lateState=await late.wait('game-state'); assert.equal(lateState.topicScores[0][playerId][10],'correct');
  const intruder = new Client(code); await intruder.wait('connected');
  intruder.send('join-room',{code,playerName:'Migration smoke test',isHost:true,hostToken:'wrong'}); await intruder.wait('error');
  host.send('finish-game'); const {finalResult}=await host.wait('game-finished');
  const stored = await fetch(`${base}/api/results/${finalResult.id}`); assert.equal(stored.status,200);
  const result = await stored.json(); assert.equal(result.topicScores[0][playerId][10],'correct');
  console.log(JSON.stringify({ok:true,code,resultId:finalResult.id,checks:['join','falstart','buzz','score','reconnect','pause','resume','timer-expiry','attachments','idle-rejoin','host-auth','persisted-result']}));
} finally {
  for (const client of clients) client.close();
}
