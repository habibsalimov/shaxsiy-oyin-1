# Database Persistence Design

## Goal

Add SQLite database to persist game results so they survive server restarts and can be shared via permanent URLs.

## Scope

- **In scope:** Save finished game results to DB, serve via REST API, update frontend to read from API
- **Out of scope:** Persisting active game state, player profiles, game history/analytics

## Architecture

Active games remain fully in-memory via `GameManager`. Only when a game finishes does the result get written to SQLite. This is a write-once, read-many pattern — no updates or deletes needed.

### Database

- **Engine:** SQLite via `better-sqlite3` (synchronous, zero-config, single file)
- **Location:** `server/data/shaxsiy-oyin.db` (gitignored)
- **Schema:** Single table with JSON data column

```sql
CREATE TABLE IF NOT EXISTS game_results (
  id           TEXT PRIMARY KEY,
  host_name    TEXT NOT NULL,
  data         TEXT NOT NULL,
  player_count INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

The `data` column stores the full result JSON (topicScores, topicNames, players, nominals, date). This avoids normalization overhead while keeping results queryable by id, host_name, and date.

### New File: `server/db.js`

Exports 3 functions:
- `saveResult(id, hostName, data)` — INSERT result
- `getResult(id)` — SELECT by id, returns parsed object or null
- `listResults(limit)` — Recent games summary (id, host_name, player_count, created_at)

### Server Integration (`server/index.js`)

1. Import `db.js`
2. In `finish-game` handler: generate id, call `saveResult()`, include id in `game-finished` event payload
3. Add REST endpoints:
   - `GET /api/results/:id` — returns full result JSON (or 404)
   - `GET /api/results` — returns recent games list

No changes to `GameManager.js`.

### Frontend Integration

**`ResultsScreen.jsx`** loading priority:
1. `gameResult` prop (game just finished) → use directly
2. URL hash `#results/{id}` → `fetch(/api/results/{id})` from API
3. API fails → fallback to `localStorage` (backward compat with old saved results)

**`App.jsx`**: continues writing to localStorage as backup; `game-finished` handler now receives `id` from server.

### Data Flow

```
Game finishes → GameManager.finishGame() returns result
             → server/index.js generates id, calls db.saveResult()
             → emits "game-finished" with { id, ...result } to all clients
             → clients save to localStorage (backup) and navigate to results screen

User opens shared URL → ResultsScreen reads hash
                      → fetches GET /api/results/:id
                      → renders result (or falls back to localStorage)
```

## Dependencies

- `better-sqlite3` added to `server/package.json`

## Files Changed

- Create: `server/db.js`
- Modify: `server/index.js` (import db, save on finish, add REST routes)
- Modify: `server/package.json` (add better-sqlite3)
- Modify: `src/components/ResultsScreen.jsx` (fetch from API)
- Modify: `src/App.jsx` (use server-generated id)
- Modify: `.gitignore` (add server/data/)
