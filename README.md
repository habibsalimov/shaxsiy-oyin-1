# Shaxsiy O'yin

Real-time multiplayer quiz game for running individual rounds at Zakovat intellectual clubs. A host creates a game room, players join via a 4-digit code, buzz in to answer questions, and scores are tracked live across topics.

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9

## Quick Start

```bash
# Clone the repository
git clone https://github.com/habibsalimov/shaxsiy-oyin.git
cd shaxsiy-oyin

# Install frontend dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Start development (frontend + backend)
npm run dev
```

The app will be available at **http://localhost:5173**.

## Development Setup

`npm run dev` starts two processes in parallel via [concurrently](https://www.npmjs.com/package/concurrently):

| Process | Command | Port | Description |
|---------|---------|------|-------------|
| Frontend | `vite` | 5173 | React dev server with HMR |
| Backend | `nodemon server/index.js` | 3010 | Express + Socket.IO server (auto-restarts on file changes) |

Vite proxies all `/socket.io` requests to the backend at `localhost:3010`, so WebSocket connections work seamlessly in development without CORS issues.

### How It Connects

```
Browser (:5173)  ──HTTP/HMR──>  Vite Dev Server (:5173)
                 ──/socket.io──>  proxy ──>  Express + Socket.IO (:3010)
```

## Project Structure

```
├── index.html                 HTML entry point
├── package.json               Root package (frontend deps + dev scripts)
├── vite.config.js             Vite config with Socket.IO proxy
│
├── server/
│   ├── package.json           Server-only dependencies
│   ├── index.js               Express + Socket.IO server, event handlers
│   ├── GameManager.js         In-memory room & game state management
│   └── db.js                  SQLite storage for finished game results
│
└── src/
    ├── main.jsx               React root mount
    ├── App.jsx                Root component, socket event hub, screen routing
    ├── socket.js              Socket.IO client (connect, emit, on/off, reconnect)
    ├── utils/
    │   ├── constants.js       Uzbek apostrophe (T), nominal presets, mock data
    │   └── scoring.js         Score calculation, snapshot rebuilding
    ├── hooks/
    │   ├── useTimer.js        Countdown timer (server-authoritative)
    │   └── useWindowWidth.js  Responsive breakpoint detection
    └── components/
        ├── LandingScreen.jsx  Host creation + player join forms
        ├── HostGameScreen.jsx Lobby, topic nav, question flow, buzz judging
        ├── PlayerGameScreen.jsx  Buzz-in button, timer, personal score
        ├── ResultsScreen.jsx  Final rankings, per-topic breakdowns
        ├── ScoreBoard.jsx     Responsive score table
        ├── SettingsPanel.jsx  Timer, nominals, falstart settings
        └── ui/               Reusable UI primitives (Btn, Card, Input, etc.)
```

## Architecture Overview

The server is the single source of truth for all game state:

- **Game state** is held in memory by `GameManager`. Each room is a self-contained object with players, scores, timer, and buzz state.
- **Communication** is entirely via Socket.IO. The server broadcasts the full `game-state` object to all room members after every state change.
- **Results persistence** uses SQLite (`better-sqlite3`) -- only finished game results are saved to disk. Active games live purely in memory.
- **No authentication** -- rooms are identified by 4-digit codes, players by name.

### Client Screens

The app has four main screens, routed via React state (no router library):

1. **LandingScreen** -- Create a game (host) or join one (player)
2. **HostGameScreen** -- Manage the game: navigate topics, start timers, judge answers, edit scores
3. **PlayerGameScreen** -- Buzz in, see timer, view personal score
4. **ResultsScreen** -- Final rankings and per-topic score breakdowns

## Socket.IO Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `create-room` | `{ hostName, topics, nominals, timer, falstart }` | Host creates a new game room |
| `join-room` | `{ code, playerName }` | Player joins by room code |
| `start-game` | -- | Host starts the game from lobby |
| `start-timer` | `{ ti, ni }` | Host starts timer for topic `ti`, nominal `ni` |
| `buzz` | -- | Player buzzes in |
| `judge` | `{ playerId, result }` | Host marks answer correct/wrong |
| `skip-question` | `{ ti, ni }` | Host skips current question |
| `correct-score` | `{ playerId, ti, ni }` | Host manually cycles a score cell |
| `lock-room` | -- | Host locks room to prevent new joins |
| `block-player` | `{ playerId }` | Host blocks a player |
| `remove-player` | `{ playerId }` | Host removes a player from the game |
| `finish-game` | -- | Host ends the game |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `room-created` | `{ code }` | Confirms room creation |
| `game-state` | Full state object | Authoritative state broadcast to all members |
| `timer-started` | `{ ti, ni, timerEnd }` | Timer started for a cell |
| `timer-expired` | `{ ti, ni }` | Timer ran out |
| `buzz-update` | `{ buzzOrder }` | Updated buzz order |
| `falstart-caught` | `{ playerId }` | Player buzzed before timer started |
| `player-removed` | `{ playerId }` | Player was removed |
| `game-finished` | `{ finalResult }` | Final results payload |
| `error` | `{ message }` | Error message |

## Key Concepts

- **Room codes**: 4-digit numeric codes generated by the server. Players join by entering the code on the landing screen.
- **Nominals**: Point values per question (e.g., `[10, 20, 30, 40, 50]`). Six preset tiers are available, or the host can customize.
- **Topic scores**: Each topic has a score grid mapping `playerId → { nominal → "correct" | "wrong" | null }`.
- **Snapshots**: Cumulative grand totals (`__snapshot`) are rebuilt after every score change via `rebuildSnapshots()`.
- **Falstart mode**: When enabled, players cannot buzz until the host starts the timer. Early buzzes result in a penalty.
- **Latency compensation**: The server pings clients to measure round-trip time. Buzz timestamps are adjusted by half the latency.
- **Reconnection**: Session info is stored in `sessionStorage`. On socket reconnect, the client auto-rejoins the room. The server matches players by name.

## Production Build

```bash
# Build the frontend
npm run build

# Start the production server
npm start
```

In production, Express serves the built static files from `dist/` and handles Socket.IO connections on the same port.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3010` | Server port for Express + Socket.IO |

## Tech Stack

- **Frontend**: React 18, Vite 5, Socket.IO Client 4
- **Backend**: Express 5, Socket.IO 4, better-sqlite3
- **Styling**: Inline styles (no CSS framework), Google Fonts (Anton + Montserrat)
- **Language**: All UI text is in Uzbek (Latin script)
- **Dev tools**: concurrently, nodemon
