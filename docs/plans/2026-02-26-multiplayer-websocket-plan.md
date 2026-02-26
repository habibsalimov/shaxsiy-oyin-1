# Shaxsiy O'yin Multiplayer WebSocket Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the mock-based single-player quiz app into a real-time multiplayer game with Socket.IO.

**Architecture:** Node.js/Express backend with Socket.IO manages game rooms in-memory. Existing React frontend refactored from monolithic App.jsx into components, with mock data replaced by live socket events. Vite proxies WebSocket in dev; Express serves static files in production.

**Tech Stack:** Node.js, Express 5, Socket.IO 4, React 18, Vite 5

---

## Task 0: Fix file names and bootstrap the project

**Files:**
- Rename: `package-json.json` → `package.json`
- Rename: `index-html.html` → `index.html`
- Rename: `vite-config.js` → `vite.config.js`

**Step 1: Rename files**

```bash
cd /home/ailabs/private_game
mv package-json.json package.json
mv index-html.html index.html
mv vite-config.js vite.config.js
```

**Step 2: Install dependencies and verify dev server starts**

```bash
npm install
npm run dev
```

Expected: Vite starts on port 5173, app loads in browser.

**Step 3: Commit**

```bash
git init
git add -A
git commit -m "chore: fix file names and initialize project"
```

---

## Task 1: Extract shared constants and utilities

**Files:**
- Create: `src/utils/constants.js`
- Create: `src/utils/scoring.js`
- Create: `src/hooks/useTimer.js`
- Create: `src/hooks/useWindowWidth.js`
- Modify: `src/App.jsx` — remove extracted code, add imports

**Step 1: Create `src/utils/constants.js`**

```js
export const NOMINAL_PRESETS = [
  [10, 20, 30, 40, 50],
  [20, 40, 60, 80, 100],
  [30, 60, 90, 120, 150],
  [100, 200, 300, 400, 500],
  [200, 400, 600, 800, 1000],
  [300, 600, 900, 1200, 1500],
];
export const DEFAULT_NOMINALS = NOMINAL_PRESETS[0];
export const T = '\u2018';
```

**Step 2: Create `src/utils/scoring.js`**

Extract `getTotal`, `rebuildSnapshots`, `initScores` from App.jsx lines 79-134. Functions must import `DEFAULT_NOMINALS` from constants.

```js
import { DEFAULT_NOMINALS } from './constants.js';

export function getTotal(scores, id, nominals) {
  if (!scores[id]) return 0;
  const noms = nominals || DEFAULT_NOMINALS;
  return noms.reduce((acc, n) => {
    const r = scores[id][n];
    if (r === "correct") return acc + n;
    if (r === "wrong")   return acc - n;
    return acc;
  }, 0);
}

export function rebuildSnapshots(topicScores, nominals) {
  const result = topicScores.map(ts => ({ ...ts }));
  const playerIds = Object.keys(result[0] || {}).filter(k => k !== '__snapshot');
  for (let i = 0; i < result.length; i++) {
    const snapshot = {};
    playerIds.forEach(pid => {
      snapshot[pid] = result
        .slice(0, i + 1)
        .reduce((sum, ts) => sum + getTotal(ts, pid, nominals), 0);
    });
    result[i] = { ...result[i], __snapshot: snapshot };
  }
  return result;
}

export function initScores(players, nominals) {
  const s = {};
  players.forEach(p => {
    s[p.socketId] = {};
    nominals.forEach(n => { s[p.socketId][n] = null; });
  });
  return s;
}
```

**Step 3: Create `src/hooks/useTimer.js`**

Extract from App.jsx lines 115-125.

```js
import { useState, useEffect } from "react";

export function useTimer(timerEnd, timerSec) {
  const [rem, setRem] = useState(timerSec);
  useEffect(() => {
    if (!timerEnd) { setRem(timerSec); return; }
    const tick = () => setRem(Math.max(0, (timerEnd - Date.now()) / 1000));
    tick();
    const iv = setInterval(tick, 80);
    return () => clearInterval(iv);
  }, [timerEnd, timerSec]);
  return rem;
}
```

**Step 4: Create `src/hooks/useWindowWidth.js`**

Extract from App.jsx lines 105-113.

```js
import { useState, useEffect } from "react";

export function useWindowWidth() {
  const [w, setW] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return w;
}
```

**Step 5: Update App.jsx imports**

Replace the extracted sections in App.jsx with:

```js
import { NOMINAL_PRESETS, DEFAULT_NOMINALS, T } from './utils/constants.js';
import { getTotal, rebuildSnapshots, initScores } from './utils/scoring.js';
import { useTimer } from './hooks/useTimer.js';
import { useWindowWidth } from './hooks/useWindowWidth.js';
```

Remove: lines 34-53 (constants), 78-134 (utils/hooks). Keep `MOCK_PLAYERS`, `MOCK_TOPICS`, `LETTERS`, `generateGameCode` in App.jsx for now (they'll be removed later).

**Step 6: Verify the app still works**

```bash
npm run dev
```

Open browser, navigate all screens. Everything should work identically.

**Step 7: Commit**

```bash
git add src/utils/ src/hooks/ src/App.jsx
git commit -m "refactor: extract constants, scoring utils, and hooks"
```

---

## Task 2: Extract UI components

**Files:**
- Create: `src/components/ui/Btn.jsx`
- Create: `src/components/ui/Badge.jsx`
- Create: `src/components/ui/Card.jsx`
- Create: `src/components/ui/Label.jsx`
- Create: `src/components/ui/Input.jsx`
- Create: `src/components/ui/Toggle.jsx`
- Create: `src/components/ui/SectionToggle.jsx`
- Create: `src/components/ui/TimerDisplay.jsx`
- Create: `src/components/ui/index.js` (barrel export)
- Modify: `src/App.jsx`

**Step 1: Create each UI component file**

Extract each component from App.jsx lines 137-282 into its own file. Each file exports a single named export. Use `frontend-design` skill for polished styling.

Example `src/components/ui/Btn.jsx`:
```jsx
export function Btn({ children, variant = "primary", size = "md", onClick, disabled, style = {} }) {
  // ... exact code from App.jsx lines 137-164
}
```

`TimerDisplay.jsx` must import `useTimer` from `../../hooks/useTimer.js`.

**Step 2: Create barrel export `src/components/ui/index.js`**

```js
export { Btn } from './Btn.jsx';
export { Badge } from './Badge.jsx';
export { Card } from './Card.jsx';
export { Label } from './Label.jsx';
export { Input } from './Input.jsx';
export { Toggle } from './Toggle.jsx';
export { SectionToggle } from './SectionToggle.jsx';
export { TimerDisplay } from './TimerDisplay.jsx';
```

**Step 3: Update App.jsx**

Replace component definitions with:
```js
import { Btn, Badge, Card, Label, Input, Toggle, SectionToggle, TimerDisplay } from './components/ui/index.js';
```

Remove: lines 137-282 from App.jsx.

**Step 4: Verify app works**

```bash
npm run dev
```

**Step 5: Commit**

```bash
git add src/components/ui/ src/App.jsx
git commit -m "refactor: extract UI components to src/components/ui/"
```

---

## Task 3: Extract ScoreBoard and SettingsPanel

**Files:**
- Create: `src/components/ScoreBoard.jsx`
- Create: `src/components/SettingsPanel.jsx`
- Modify: `src/App.jsx`

**Step 1: Create `src/components/ScoreBoard.jsx`**

Extract from App.jsx lines 284-397. Imports needed:
```js
import { useState, useEffect, useRef } from "react";
import { getTotal } from '../utils/scoring.js';
import { DEFAULT_NOMINALS } from '../utils/constants.js';
```

**Step 2: Create `src/components/SettingsPanel.jsx`**

Extract from App.jsx lines 399-460. Imports needed:
```js
import { NOMINAL_PRESETS, T } from '../utils/constants.js';
import { Label } from './ui/index.js';
import { Input } from './ui/index.js';
import { Toggle } from './ui/index.js';
```

**Step 3: Update App.jsx — replace with imports**

```js
import { ScoreBoard } from './components/ScoreBoard.jsx';
import { SettingsPanel } from './components/SettingsPanel.jsx';
```

**Step 4: Verify app works, commit**

```bash
git add src/components/ScoreBoard.jsx src/components/SettingsPanel.jsx src/App.jsx
git commit -m "refactor: extract ScoreBoard and SettingsPanel"
```

---

## Task 4: Extract screen components (LandingScreen, HostGameScreen, PlayerGameScreen, ResultsScreen)

**Files:**
- Create: `src/components/LandingScreen.jsx`
- Create: `src/components/HostGameScreen.jsx`
- Create: `src/components/PlayerGameScreen.jsx`
- Create: `src/components/ResultsScreen.jsx`
- Modify: `src/App.jsx` — should reduce to ~80 lines (nav tabs + screen routing + state lifting)

**Step 1: Extract LandingScreen**

From App.jsx lines 462-628. Imports: `Btn, Badge, Label, Input, SectionToggle` from ui, `NOMINAL_PRESETS, T` from constants, `SettingsPanel`.

**Step 2: Extract HostGameScreen**

From App.jsx lines 630-1332. This is the largest component (~700 lines). Imports: all UI components, `ScoreBoard`, `SettingsPanel`, scoring utils, constants, hooks. Keep `MOCK_PLAYERS` reference for now — will be replaced in Task 6.

**Step 3: Extract PlayerGameScreen**

From App.jsx lines 1334-1523.

**Step 4: Extract ResultsScreen**

From App.jsx lines 1524-1649.

**Step 5: Slim down App.jsx**

App.jsx should only contain:
- localStorage adapter (lines 1-30)
- The `SCREENS` constant, `genId()` function
- The `App` component with screen navigation and state lifting
- Imports from extracted screen components

```jsx
// ─── localStorage adapter ───
if (!window.storage) { /* ... keep as-is ... */ }

import { useState } from "react";
import { DEFAULT_NOMINALS, T } from './utils/constants.js';
import { Btn } from './components/ui/index.js';
import { LandingScreen } from './components/LandingScreen.jsx';
import { HostGameScreen } from './components/HostGameScreen.jsx';
import { PlayerGameScreen } from './components/PlayerGameScreen.jsx';
import { ResultsScreen } from './components/ResultsScreen.jsx';

const SCREENS = [
  { id: "landing",    label: "🏠 Bosh sahifa" },
  { id: "hostGame",   label: "📋 Boshlovchi panel" },
  { id: "playerGame", label: `🔴 O${T}yinchi ekrani` },
  { id: "results",    label: "🏆 Natijalar" },
];

function genId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function App() {
  // ... keep exact state and JSX from lines 1662-1727
}
```

**Step 6: Verify all 4 screens work, commit**

```bash
git add src/components/ src/App.jsx
git commit -m "refactor: extract all screen components from App.jsx"
```

---

## Task 5: Create Socket.IO backend server

**Files:**
- Create: `server/package.json`
- Create: `server/index.js`
- Create: `server/GameManager.js`
- Modify: `package.json` (root) — add `concurrently`, update scripts
- Modify: `vite.config.js` — add Socket.IO proxy

**Step 1: Create `server/package.json`**

```json
{
  "name": "shaxsiy-oyin-server",
  "private": true,
  "type": "module",
  "dependencies": {
    "express": "^5.1.0",
    "socket.io": "^4.8.0"
  }
}
```

Run: `cd server && npm install && cd ..`

**Step 2: Create `server/GameManager.js`**

This is the core game logic. Key responsibilities:
- Room creation with unique 4-digit codes
- Player join/leave
- Server-authoritative timer
- Buzz ordering with latency compensation
- Score management
- Disconnect/reconnect handling
- Room cleanup

```js
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
    this.rooms = new Map();       // code → GameRoom
    this.socketToRoom = new Map(); // socketId → code
  }

  createRoom(socketId, { hostName, rounds, topics, nominals, timer, falstart }) {
    const code = generateCode(new Set(this.rooms.keys()));
    const room = {
      code,
      hostSocketId: socketId,
      hostName,
      settings: { timer: parseInt(timer) || 7, nominals, falstart: !!falstart },
      topicNames: topics.length > 0 ? topics : Array.from({ length: parseInt(rounds) || 5 }, (_, i) => `${i + 1}-mavzu`),
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
      hostDisconnectTimeout: null,
    };
    this.rooms.set(code, room);
    this.socketToRoom.set(socketId, code);
    return { code, room };
  }

  joinRoom(socketId, { code, playerName }) {
    const room = this.rooms.get(code);
    if (!room) return { error: "Xona topilmadi" };
    if (room.locked) return { error: "Xona qulflangan" };

    // Check if reconnecting
    const existing = room.players.find(p => p.name === playerName && !p.connected);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      this.socketToRoom.set(socketId, code);
      return { room, reconnected: true, playerId: existing.socketId };
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

  startTimer(socketId, { ti, ni }) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;

    room.activeCell = { ti, ni };
    room.buzzOrder = [];
    room.falstartBlocked = new Set();
    if (room.phase === "lobby") room.phase = "playing";

    // Initialize topic scores if needed
    while (room.topicScores.length <= ti) {
      const s = {};
      room.players.forEach(p => {
        s[p.socketId] = {};
        room.settings.nominals.forEach(n => { s[p.socketId][n] = null; });
      });
      room.topicScores.push(s);
    }

    const ms = room.settings.timer * 1000;
    room.timerEnd = Date.now() + ms;
    clearTimeout(room.timerTimeout);

    room.timerTimeout = setTimeout(() => {
      room.timerEnd = null;
      // Record no_answer in cellData
      const key = `${ti}-${ni}`;
      if (!room.cellData[key]) room.cellData[key] = { history: [] };
      const cell = room.cellData[key];
      if (!cell.history.some(h => h.result === "correct" || h.result === "no_answer")) {
        cell.history.push({ playerId: null, playerName: null, result: "no_answer", nominal: null, ts: Date.now() });
      }
      room.buzzOrder = [];
      return { room, expired: true, ti, ni };
    }, ms);

    return { room, timerEnd: room.timerEnd, ti, ni };
  }

  buzz(socketId) {
    const room = this.getRoomForSocket(socketId);
    if (!room || !room.timerEnd) return null;
    if (room.blockedPlayers.has(socketId)) return null;
    if (room.falstartBlocked.has(socketId)) return null;
    if (room.buzzOrder.some(b => b.socketId === socketId)) return null;

    const player = room.players.find(p => p.socketId === socketId);
    if (!player) return null;

    // Latency-compensated effective time
    const effectiveTime = Date.now() - (player.latency / 2);
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

    // Update topic scores
    if (!room.topicScores[ti]) return null;
    if (!room.topicScores[ti][playerId]) room.topicScores[ti][playerId] = {};
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
      // Remove judged player from buzz order
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

    // Schedule room cleanup
    setTimeout(() => {
      this.rooms.delete(room.code);
    }, 5 * 60 * 1000);

    return { result };
  }

  handleDisconnect(socketId) {
    const room = this.getRoomForSocket(socketId);
    if (!room) return null;

    if (room.hostSocketId === socketId) {
      // Host disconnected — pause game, wait 60s
      room.hostDisconnectTimeout = setTimeout(() => {
        // After 60s, keep room but mark host gone
        room.hostDisconnectTimeout = null;
      }, 60000);
      return { room, hostDisconnected: true };
    }

    // Player disconnected
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
      settings: { ...room.settings, nominals: room.settings.nominals },
      topicNames: room.topicNames,
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
      buzzOrder: room.buzzOrder,
      falstartBlocked: [...room.falstartBlocked],
    };
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
}
```

**Step 3: Create `server/index.js`**

```js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import path from "path";
import { GameManager } from "./GameManager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
  pingInterval: 5000,
  pingTimeout: 10000,
});

const gm = new GameManager();

// Serve static files in production
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// Helper: broadcast game state to entire room
function broadcastState(room) {
  const state = gm.getGameState(room);
  io.to(room.code).emit("game-state", state);
}

io.on("connection", (socket) => {
  console.log(`[connect] ${socket.id}`);

  // Latency tracking
  socket.on("pong-latency", (ts) => {
    const room = gm.getRoomForSocket(socket.id);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (player) player.latency = Date.now() - ts;
  });

  socket.on("create-room", (data) => {
    const { code, room } = gm.createRoom(socket.id, data);
    socket.join(code);
    socket.emit("room-created", { code });
    broadcastState(room);
  });

  socket.on("join-room", (data) => {
    const result = gm.joinRoom(socket.id, data);
    if (result.error) {
      socket.emit("error", { message: result.error });
      return;
    }
    socket.join(result.room.code);
    broadcastState(result.room);
  });

  socket.on("start-timer", (data) => {
    const result = gm.startTimer(socket.id, data);
    if (!result) return;
    io.to(result.room.code).emit("timer-started", {
      ti: result.ti, ni: result.ni, timerEnd: result.timerEnd
    });

    // Handle timer expiry via the timeout set in GameManager
    // We need to re-implement the timeout callback to emit events
    clearTimeout(result.room.timerTimeout);
    const ms = result.room.settings.timer * 1000;
    result.room.timerTimeout = setTimeout(() => {
      result.room.timerEnd = null;
      const { ti, ni } = data;
      const key = `${ti}-${ni}`;
      if (!result.room.cellData[key]) result.room.cellData[key] = { history: [] };
      const cell = result.room.cellData[key];
      if (!cell.history.some(h => h.result === "correct" || h.result === "no_answer")) {
        cell.history.push({ playerId: null, playerName: null, result: "no_answer", nominal: null, ts: Date.now() });
      }
      result.room.buzzOrder = [];
      io.to(result.room.code).emit("timer-expired", { ti, ni });
      broadcastState(result.room);
    }, ms);

    broadcastState(result.room);
  });

  socket.on("buzz", () => {
    const result = gm.buzz(socket.id);
    if (!result) return;
    io.to(result.room.code).emit("buzz-update", { buzzOrder: result.room.buzzOrder });
    broadcastState(result.room);
  });

  socket.on("judge", (data) => {
    const result = gm.judge(socket.id, data);
    if (!result) return;
    broadcastState(result.room);
  });

  socket.on("skip-question", (data) => {
    const result = gm.skipQuestion(socket.id, data);
    if (!result) return;
    broadcastState(result.room);
  });

  socket.on("lock-room", () => {
    const result = gm.lockRoom(socket.id);
    if (!result) return;
    broadcastState(result.room);
  });

  socket.on("block-player", (data) => {
    const result = gm.blockPlayer(socket.id, data);
    if (!result) return;
    broadcastState(result.room);
  });

  socket.on("remove-player", (data) => {
    const result = gm.removePlayer(socket.id, data);
    if (!result) return;
    io.to(result.room.code).emit("player-removed", { playerId: data.playerId });
    broadcastState(result.room);
  });

  socket.on("finish-game", () => {
    const result = gm.finishGame(socket.id);
    if (!result) return;
    const room = gm.getRoomForSocket(socket.id);
    if (room) {
      io.to(room.code).emit("game-finished", { finalResult: result.result });
    }
  });

  socket.on("disconnect", () => {
    console.log(`[disconnect] ${socket.id}`);
    const result = gm.handleDisconnect(socket.id);
    if (!result) return;
    broadcastState(result.room);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

**Step 4: Update root `package.json`**

Add `concurrently` and `nodemon` as dev dependencies, update scripts:

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"nodemon server/index.js\"",
    "build": "vite build",
    "preview": "vite preview",
    "start": "node server/index.js"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.2",
    "concurrently": "^9.1.0",
    "nodemon": "^3.1.0"
  }
}
```

Run: `npm install`

**Step 5: Update `vite.config.js` with proxy**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist'
  },
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      }
    }
  }
})
```

**Step 6: Test server starts**

```bash
cd server && npm install && cd ..
npm run dev
```

Expected: Both Vite (5173) and server (3001) start. No errors.

**Step 7: Commit**

```bash
git add server/ package.json vite.config.js
git commit -m "feat: add Socket.IO backend server with GameManager"
```

---

## Task 6: Create Socket.IO client wrapper

**Files:**
- Create: `src/socket.js`
- Modify: `package.json` — add `socket.io-client` dependency

**Step 1: Install socket.io-client**

```bash
npm install socket.io-client
```

**Step 2: Create `src/socket.js`**

```js
import { io } from "socket.io-client";

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io({
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
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

export function getSocketId() {
  return getSocket().id;
}
```

**Step 3: Commit**

```bash
git add src/socket.js package.json package-lock.json
git commit -m "feat: add Socket.IO client wrapper"
```

---

## Task 7: Connect LandingScreen to Socket.IO

**Files:**
- Modify: `src/components/LandingScreen.jsx`
- Modify: `src/App.jsx`

**Step 1: Update LandingScreen**

Replace the `handleHost` function to emit `create-room` event instead of directly calling `onHost`. Replace `handlePlayer` to emit `join-room`.

Add connection status indicator (replace the hardcoded green dot at line 622-624):
```jsx
import { getSocket, emitEvent, onEvent } from '../socket.js';
import { useState, useEffect } from 'react';

// Inside component:
const [connected, setConnected] = useState(false);
const [joinError, setJoinError] = useState("");

useEffect(() => {
  const socket = getSocket();
  setConnected(socket.connected);
  const onConnect = () => setConnected(true);
  const onDisconnect = () => setConnected(false);
  socket.on("connect", onConnect);
  socket.on("disconnect", onDisconnect);
  return () => { socket.off("connect", onConnect); socket.off("disconnect", onDisconnect); };
}, []);
```

`handleHost` now:
```js
const handleHost = () => {
  if (!hostName.trim()) { setHostError("Ismingizni kiriting"); return; }
  emitEvent("create-room", {
    hostName: hostName.trim(),
    rounds: parseInt(rounds) || 5,
    topics: topics.split("\n").map(s => s.trim()).filter(Boolean),
    nominals: NOMINAL_PRESETS[settings.selectedPreset],
    timer: settings.timer,
    falstart: settings.falstart,
  });
};
```

`handlePlayer` now:
```js
const handlePlayer = () => {
  if (!playerName.trim()) { setPlayerError("Ismingizni kiriting"); return; }
  if (gameCode.length < 4) { setPlayerError(`O${T}yin kodini kiriting`); return; }
  emitEvent("join-room", { code: gameCode, playerName: playerName.trim() });
};
```

**Step 2: Update App.jsx to listen for socket events**

In App component, listen for `room-created` (switch to host screen) and `game-state` (for player join, switch to player screen):

```jsx
import { onEvent, getSocket } from './socket.js';

// In App():
useEffect(() => {
  const unsub1 = onEvent("room-created", ({ code }) => {
    setRoomCode(code);
    setScreen("hostGame");
  });
  const unsub2 = onEvent("game-state", (state) => {
    setGameState(state);
  });
  const unsub3 = onEvent("game-finished", ({ finalResult }) => {
    setGameResult(finalResult);
    setScreen("results");
  });
  const unsub4 = onEvent("error", ({ message }) => {
    console.error("Server error:", message);
  });
  return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
}, []);
```

**Step 3: Verify host can create room, player can join**

Open two browser tabs. Tab 1: create room as host. Tab 2: enter room code and join.

**Step 4: Commit**

```bash
git add src/components/LandingScreen.jsx src/App.jsx
git commit -m "feat: connect LandingScreen to Socket.IO"
```

---

## Task 8: Connect HostGameScreen to Socket.IO

**Files:**
- Modify: `src/components/HostGameScreen.jsx`

**Step 1: Replace mock data with live game state**

The component receives `gameState` as a prop from App.jsx (which gets it from the `game-state` socket event).

Key changes:
- `players` comes from `gameState.players` instead of `MOCK_PLAYERS`
- `topicScores` comes from `gameState.topicScores`
- `activeCell`, `timerEnd`, `buzzOrder` come from `gameState`
- `blockedPlayers` comes from `gameState.blockedPlayers`

**Step 2: Replace local actions with socket emissions**

| Old (local) | New (socket) |
|---|---|
| `startTimer()` sets local state | `emitEvent("start-timer", { ti, ni })` |
| `simulateBuzz()` randomizes | **Remove entirely** — real buzzes come from players |
| `judge("correct"/"wrong")` updates local scores | `emitEvent("judge", { playerId: first.socketId, result })` |
| `surgunPlayer(sid)` removes from local list | `emitEvent("remove-player", { playerId: sid })` |
| `toggleBlock(sid)` toggles local set | `emitEvent("block-player", { playerId: sid })` |
| `setRoomLocked(v => !v)` | `emitEvent("lock-room")` |
| `onFinish(data)` with local data | `emitEvent("finish-game")` |
| Skip button `setCellData(...)` | `emitEvent("skip-question", { ti, ni })` |

**Step 3: Keep local-only UI state**

These remain local (not synced): `settingsOpen`, `playersOpen`, `expandedTopics`, `collapsedScores`, `editingTopic`, `editValue`, `attachMode`, `attachText`, `confirmReset`.

**Step 4: Verify full host flow works**

Open browser, create room, start game, start timer. Verify timer starts and expires correctly.

**Step 5: Commit**

```bash
git add src/components/HostGameScreen.jsx
git commit -m "feat: connect HostGameScreen to Socket.IO"
```

---

## Task 9: Connect PlayerGameScreen to Socket.IO

**Files:**
- Modify: `src/components/PlayerGameScreen.jsx`

**Step 1: Replace all mock data with live game state**

Remove `MOCK_PLAYERS` references, `topicScoresMock`, `topicNamesMock`, `currentTopicIdxMock`. Replace with `gameState` prop from App.jsx.

```jsx
// PlayerGameScreen receives gameState from App via props
export function PlayerGameScreen({ gameState }) {
  const socket = getSocket();
  const myId = socket.id;
  const myPlayer = gameState.players.find(p => p.socketId === myId);
  const nominals = gameState.settings.nominals;
  const topicScores = gameState.topicScores;
  const topicNames = gameState.topicNames;
  const currentTopicIdx = gameState.currentTopicIdx;
  const activeCell = gameState.activeCell;
  const timerEnd = gameState.timerEnd;
  const buzzOrder = gameState.buzzOrder;
  // ...
}
```

**Step 2: Replace buzz simulation with real socket emit**

```js
const handleBuzz = useCallback(() => {
  emitEvent("buzz");
}, []);
```

Remove the fake `setTimeout` that simulated buzz phase transitions. The component now reacts to `gameState` changes from socket events.

**Step 3: Determine phase from game state**

```js
const myBuzzed = buzzOrder.some(b => b.socketId === myId);
const phase = !activeCell ? "waiting" : timerEnd ? "active" : myBuzzed ? "buzzed" : "waiting";
```

**Step 4: Verify two-player flow**

Open two tabs. Tab 1: host. Tab 2: player. Start timer, player buzzes, host judges.

**Step 5: Commit**

```bash
git add src/components/PlayerGameScreen.jsx
git commit -m "feat: connect PlayerGameScreen to Socket.IO"
```

---

## Task 10: Connect ResultsScreen and final cleanup

**Files:**
- Modify: `src/components/ResultsScreen.jsx`
- Modify: `src/App.jsx`
- Delete references to `MOCK_PLAYERS`, `MOCK_TOPICS`, `generateGameCode` from all files

**Step 1: Update ResultsScreen**

`game-finished` event sends `finalResult` which matches the existing data format. Update ResultsScreen to use this directly. Keep localStorage save for persistence.

**Step 2: Remove all MOCK_* references**

Search all files for `MOCK_PLAYERS` and `MOCK_TOPICS`. Remove them entirely. The game now uses real player data from Socket.IO.

**Step 3: Remove `generateGameCode` from frontend**

Code generation now happens server-side in GameManager.

**Step 4: Full end-to-end test**

1. Open Tab 1 → create room as host → note room code
2. Open Tab 2 → join as player with room code
3. Host starts game → starts timer
4. Player buzzes → buzz order appears on host screen
5. Host judges correct → scores update on both screens
6. Continue through multiple topics
7. Host finishes game → results screen appears on both tabs
8. Verify results are saved to localStorage

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: complete multiplayer integration, remove all mock data"
```

---

## Task 11: Polish and production readiness

**Files:**
- Modify: `server/index.js` — add latency ping
- Modify: `src/App.jsx` — add reconnect logic
- Update: `CLAUDE.md`

**Step 1: Add latency measurement**

In server, periodically ping each connected socket:
```js
setInterval(() => {
  io.sockets.sockets.forEach((socket) => {
    socket.emit("ping-latency", Date.now());
  });
}, 5000);
```

Client responds in socket.js:
```js
socket.on("ping-latency", (ts) => {
  socket.emit("pong-latency", ts);
});
```

**Step 2: Add reconnect with sessionStorage**

On room create/join, store `{ roomCode, playerName, isHost }` in sessionStorage. On page reload, auto-rejoin.

**Step 3: Update CLAUDE.md**

Add server commands, new project structure, Socket.IO protocol reference.

**Step 4: Test reconnect**

Join a game, refresh the player's page, verify they rejoin the room.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: add latency tracking, reconnect, update docs"
```
