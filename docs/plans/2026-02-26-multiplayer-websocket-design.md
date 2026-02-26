# Shaxsiy O'yin — Multiplayer WebSocket Design

**Date:** 2026-02-26
**Status:** Approved

## Goal

Transform the single-player mock-based quiz game into a real-time multiplayer application where a host creates a room, players join via a 4-digit code, and all game interactions happen over WebSocket.

## Tech Decisions

- **Backend:** Node.js + Express + Socket.IO
- **Frontend:** Existing React 18 + Vite (refactored)
- **Room system:** 4-digit code, host creates, players join
- **Deployment:** Single VPS — Express serves static + WebSocket
- **UI:** Use `frontend-design` skill during implementation for polished components

## Socket.IO Protocol

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `create-room` | `{ hostName, rounds, topics[], nominals[], timer, falstart }` | Host creates a room |
| `join-room` | `{ code, playerName }` | Player joins a room |
| `start-timer` | `{ ti, ni }` | Host starts the timer |
| `buzz` | `{}` | Player presses buzz button |
| `judge` | `{ playerId, result: "correct"\|"wrong" }` | Host judges an answer |
| `skip-question` | `{ ti, ni }` | Host skips a question |
| `lock-room` | `{}` | Host locks the room |
| `block-player` | `{ playerId }` | Host blocks a player |
| `remove-player` | `{ playerId }` | Host removes a player |
| `next-topic` | `{}` | Host moves to next topic |
| `finish-game` | `{}` | Host ends the game |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `room-created` | `{ code }` | Room code returned |
| `player-joined` | `{ players[] }` | Updated player list |
| `game-state` | `{ topicScores, currentTopic, activeCell, timerEnd, buzzOrder, ... }` | Full state sync (also for reconnect) |
| `timer-started` | `{ ti, ni, timerEnd }` | Timer started |
| `timer-expired` | `{ ti, ni }` | Timer ran out |
| `buzz-update` | `{ buzzOrder[] }` | Someone buzzed |
| `score-update` | `{ topicScores, activeCell }` | Scores changed |
| `player-blocked` | `{ playerId, blocked }` | Player blocked/unblocked |
| `player-removed` | `{ playerId }` | Player removed |
| `game-finished` | `{ finalResult }` | Game over with results |
| `error` | `{ message }` | Error message |

### Key Protocol Rules

- Timer is server-authoritative. Client receives `timerEnd` timestamp and renders countdown locally.
- Buzz order computed server-side: `effectiveTime = serverReceiveTime - (latency / 2)`.
- `game-state` provides full sync for reconnecting players.

## Server Architecture

### GameManager (in-memory)

`Map<roomCode, GameRoom>` where:

```
GameRoom = {
  code, hostSocketId, hostName,
  settings: { timer, nominals[], falstart },
  topicNames: string[],
  players: [{ socketId, name, connected }],
  locked, blockedPlayers: Set,
  phase: "lobby" | "playing" | "finished",
  topicScores, currentTopicIdx, activeCell, cellData,
  timerEnd, timerTimeout,
  buzzOrder: [{ socketId, name, effectiveTime }]
}
```

### Disconnect Handling

- **Host disconnect:** 60s reconnect window. Game paused while host is away.
- **Player disconnect:** Marked `connected: false`, can rejoin.
- **Room cleanup:** Rooms deleted 5 minutes after game ends or all players leave.

## Frontend Changes

### New Files

- `src/socket.js` — Socket.IO client wrapper (connect, emit, on, reconnect via sessionStorage)

### Refactored from App.jsx

- `src/components/ui/` — Btn, Badge, Card, Input, Toggle, TimerDisplay, Label, SectionToggle
- `src/components/ScoreBoard.jsx`
- `src/components/SettingsPanel.jsx`
- `src/components/LandingScreen.jsx`
- `src/components/HostGameScreen.jsx` — replaces mock data with socket events, removes `simulateBuzz`
- `src/components/PlayerGameScreen.jsx` — replaces hardcoded mock with live game-state
- `src/components/ResultsScreen.jsx`
- `src/utils/scoring.js` — getTotal, rebuildSnapshots, initScores
- `src/utils/constants.js` — NOMINAL_PRESETS, DEFAULT_NOMINALS
- `src/hooks/useTimer.js`, `src/hooks/useWindowWidth.js`

### File Renames (prerequisites)

```
package-json.json  →  package.json
index-html.html    →  index.html
vite-config.js     →  vite.config.js
```

## Project Structure (Final)

```
private_game/
├── package.json
├── index.html
├── vite.config.js            ← proxy /socket.io → backend in dev
├── server/
│   ├── package.json
│   ├── index.js              ← Express + Socket.IO + static serve
│   └── GameManager.js
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── socket.js
│   ├── components/
│   │   ├── ui/
│   │   ├── ScoreBoard.jsx
│   │   ├── SettingsPanel.jsx
│   │   ├── LandingScreen.jsx
│   │   ├── HostGameScreen.jsx
│   │   ├── PlayerGameScreen.jsx
│   │   └── ResultsScreen.jsx
│   ├── utils/
│   │   ├── scoring.js
│   │   └── constants.js
│   └── hooks/
│       ├── useTimer.js
│       └── useWindowWidth.js
└── docs/plans/
```

## Dev Workflow

```bash
npm run dev        # concurrently: vite dev + nodemon server/index.js
npm run build      # vite build
npm start          # node server/index.js (production: static + WebSocket)
```
