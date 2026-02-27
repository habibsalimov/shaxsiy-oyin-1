# Database Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist finished game results to SQLite so they survive server restarts and can be shared via permanent URLs.

**Architecture:** Game results are saved to a single SQLite table with a JSON data column when `finish-game` fires. Two REST endpoints serve results. Frontend fetches from API with localStorage fallback. Active game state stays fully in-memory — GameManager is untouched.

**Tech Stack:** better-sqlite3 (SQLite driver), Express REST routes, existing React frontend

---

### Task 1: Install better-sqlite3 and update .gitignore

**Files:**
- Modify: `server/package.json`
- Modify: `.gitignore`

**Step 1: Install better-sqlite3**

Run:
```bash
cd /home/ailabs/private_game/server && npm install better-sqlite3
```

Expected: `better-sqlite3` added to `server/package.json` dependencies.

**Step 2: Update .gitignore**

Add to `.gitignore`:
```
server/data/
```

This prevents the SQLite database file from being committed to git.

**Step 3: Create the data directory**

Run:
```bash
mkdir -p /home/ailabs/private_game/server/data
```

**Step 4: Commit**

```bash
cd /home/ailabs/private_game
git add server/package.json server/package-lock.json .gitignore
git commit -m "chore: add better-sqlite3 dependency, gitignore server/data"
```

---

### Task 2: Create database module (server/db.js)

**Files:**
- Create: `server/db.js`

**Step 1: Create server/db.js with full implementation**

```js
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "shaxsiy-oyin.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS game_results (
    id           TEXT PRIMARY KEY,
    host_name    TEXT NOT NULL,
    data         TEXT NOT NULL,
    player_count INTEGER NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const insertStmt = db.prepare(
  "INSERT OR IGNORE INTO game_results (id, host_name, data, player_count) VALUES (?, ?, ?, ?)"
);

const selectStmt = db.prepare(
  "SELECT id, host_name, data, player_count, created_at FROM game_results WHERE id = ?"
);

const listStmt = db.prepare(
  "SELECT id, host_name, player_count, created_at FROM game_results ORDER BY created_at DESC LIMIT ?"
);

export function saveResult(id, hostName, data) {
  const json = typeof data === "string" ? data : JSON.stringify(data);
  const playerCount = typeof data === "string" ? JSON.parse(data).players?.length || 0 : data.players?.length || 0;
  insertStmt.run(id, hostName, json, playerCount);
}

export function getResult(id) {
  const row = selectStmt.get(id);
  if (!row) return null;
  return {
    id: row.id,
    hostName: row.host_name,
    playerCount: row.player_count,
    createdAt: row.created_at,
    ...JSON.parse(row.data),
  };
}

export function listResults(limit = 50) {
  return listStmt.all(limit).map(row => ({
    id: row.id,
    hostName: row.host_name,
    playerCount: row.player_count,
    createdAt: row.created_at,
  }));
}
```

**Step 2: Verify it loads without errors**

Run:
```bash
cd /home/ailabs/private_game && node -e "import('./server/db.js').then(m => { console.log('OK', typeof m.saveResult, typeof m.getResult, typeof m.listResults) })"
```

Expected: `OK function function function`

**Step 3: Commit**

```bash
git add server/db.js
git commit -m "feat: add SQLite database module for game results"
```

---

### Task 3: Add REST API endpoints and save results on game finish

**Files:**
- Modify: `server/index.js:1-24` (imports and routes)
- Modify: `server/index.js:137-141` (finish-game handler)

**Step 1: Add db import at top of server/index.js**

Add after line 6 (`import { GameManager } from "./GameManager.js";`):

```js
import { saveResult, getResult, listResults } from "./db.js";
```

**Step 2: Add REST routes before the catch-all route**

The current code at lines 20-24 is:
```js
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});
```

Replace with:
```js
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));

// REST API for game results
app.get("/api/results", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  res.json(listResults(limit));
});

app.get("/api/results/:id", (req, res) => {
  const result = getResult(req.params.id);
  if (!result) return res.status(404).json({ error: "Natija topilmadi" });
  res.json(result);
});

// SPA catch-all (must be after API routes)
app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});
```

**Step 3: Update finish-game handler to save to DB**

The current handler at lines 137-141 is:
```js
  socket.on("finish-game", () => {
    const result = gm.finishGame(socket.id);
    if (!result) return;
    io.to(result.room.code).emit("game-finished", { finalResult: result.result });
  });
```

Replace with:
```js
  socket.on("finish-game", () => {
    const result = gm.finishGame(socket.id);
    if (!result) return;
    const id = Math.random().toString(36).slice(2, 8).toUpperCase();
    try { saveResult(id, result.room.hostName, result.result); } catch (e) { console.error("DB save error:", e); }
    io.to(result.room.code).emit("game-finished", { finalResult: { id, ...result.result } });
  });
```

Key change: the server now generates the result `id` and includes it in the event payload.

**Step 4: Test the server starts without errors**

Run:
```bash
cd /home/ailabs/private_game && node server/index.js &
sleep 1
curl -s http://localhost:3010/api/results | head -20
kill %1
```

Expected: `[]` (empty array — no results yet)

**Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat: add REST API for results, save to DB on game finish"
```

---

### Task 4: Update frontend ResultsScreen to fetch from API

**Files:**
- Modify: `src/components/ResultsScreen.jsx:13-23` (useEffect loading logic)

**Step 1: Replace the useEffect loading logic**

The current useEffect at lines 13-23 is:
```js
  useEffect(() => {
    if (gameResult) { setData(gameResult); return; }
    const hash = window.location.hash.replace("#results/", "").trim();
    if (hash) {
      window.storage.get(`results:${hash}`)
        .then(r => r ? setData(JSON.parse(r.value)) : setLoadError(true))
        .catch(() => setLoadError(true));
    } else {
      setLoadError(true);
    }
  }, [gameResult]);
```

Replace with:
```js
  useEffect(() => {
    if (gameResult) { setData(gameResult); return; }
    const hash = window.location.hash.replace("#results/", "").trim();
    if (!hash) { setLoadError(true); return; }
    // Try API first, fall back to localStorage for old saved results
    fetch(`/api/results/${hash}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setData(d))
      .catch(() => {
        window.storage.get(`results:${hash}`)
          .then(r => r ? setData(JSON.parse(r.value)) : setLoadError(true))
          .catch(() => setLoadError(true));
      });
  }, [gameResult]);
```

**Step 2: Commit**

```bash
git add src/components/ResultsScreen.jsx
git commit -m "feat: fetch results from API with localStorage fallback"
```

---

### Task 5: Update App.jsx to use server-generated id

**Files:**
- Modify: `src/App.jsx:107-115` (game-finished handler)

**Step 1: Update the game-finished handler**

The current handler at lines 107-115 is:
```js
    const unsub3 = onEvent("game-finished", ({ finalResult }) => {
      const id = genId();
      const record = { id, ...finalResult };
      try { window.storage.set(`results:${id}`, JSON.stringify(record), true); } catch(e) {}
      setArchiveId(id);
      setGameResult(record);
      setScreen("results");
      sessionStorage.removeItem("game-session");
    });
```

Replace with:
```js
    const unsub3 = onEvent("game-finished", ({ finalResult }) => {
      const id = finalResult.id || genId();
      try { window.storage.set(`results:${id}`, JSON.stringify(finalResult), true); } catch(e) {}
      setArchiveId(id);
      setGameResult(finalResult);
      setScreen("results");
      sessionStorage.removeItem("game-session");
    });
```

Key changes:
- Uses `finalResult.id` from server (falls back to `genId()` if missing)
- No longer wraps in a new `record` object — `finalResult` already has `id`
- Still saves to localStorage as backup

**Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: use server-generated result id from game-finished event"
```

---

### Task 6: Build, deploy, and verify end-to-end

**Step 1: Build frontend**

Run:
```bash
cd /home/ailabs/private_game && npm run build
```

Expected: Successful build in `dist/`

**Step 2: Restart server**

Run:
```bash
pm2 restart shaxsiy-oyin-server
```

**Step 3: Verify API endpoint is accessible**

Run:
```bash
curl -s https://shaxsiy.ishlar.app/api/results | head -20
```

Expected: `[]` (empty array)

**Step 4: Verify 404 for non-existent result**

Run:
```bash
curl -s -w "\n%{http_code}" https://shaxsiy.ishlar.app/api/results/NONEXIST
```

Expected: `{"error":"Natija topilmadi"}` with HTTP 404

**Step 5: Verify SPA still works (catch-all not broken)**

Run:
```bash
curl -s https://shaxsiy.ishlar.app/ | grep "<title>"
```

Expected: `<title>Shaxsiy O'yin</title>`

**Step 6: Commit all remaining changes if any**

```bash
git add -A && git status
# If clean, no commit needed
```
