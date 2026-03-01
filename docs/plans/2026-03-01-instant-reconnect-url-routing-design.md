# Instant Reconnect + Hash URL Routing

## Problems

1. **Landing screen flash:** When a player/host refreshes the page, they briefly see the landing screen before being restored to the game screen (~200-500ms flash).
2. **No URL change:** The URL stays the same (`/`) during an active game — no indication of game state in the address bar.

## Solution: Instant Screen Restore + Hash Routing

### URL Format

```
Landing:     https://example.com/
Active game: https://example.com/#game/1234
Results:     https://example.com/#results/abc123
```

Hash is for the user's own session only — opening `#game/1234` in another browser without a matching `sessionStorage` entry shows the landing screen.

### Instant Restore Flow

**Current flow (has flash):**
```
Refresh → Landing screen (0ms)
        → Socket connects (~100ms)
        → join-room → game-state (~200ms)
        → App.jsx sees game-state while on landing → switch screen
```

**New flow (no flash):**
```
Refresh → App.jsx checks hash + sessionStorage → instant screen restore (0ms)
        → Socket connects in background (~100ms)
        → join-room → game-state → full data available (~200ms)
        → Components show "ulanmoqda..." until gameState arrives
```

### App.jsx Initial State Logic

```js
const [screen, setScreen] = useState(() => {
  const hash = window.location.hash;
  if (hash.startsWith("#results/")) return "results";
  if (hash.startsWith("#game/")) {
    const session = JSON.parse(sessionStorage.getItem("game-session") || "null");
    if (session?.roomCode) {
      return session.isHost ? "hostGame" : "playerGame";
    }
    // No session — clear invalid hash, show landing
    window.location.hash = "";
  }
  return "landing";
});
```

### Component Changes

**HostGameScreen / PlayerGameScreen:**
- When `gameState === null` → show a brief "Serverga ulanmoqda..." state
- Once `gameState` arrives → render normally

### Hash Update Points

| Event | Hash Action |
|-------|-------------|
| `room-created` | Set `#game/{code}` |
| Player receives first `game-state` | Set `#game/{code}` |
| `game-finished` | Set `#results/{id}` |
| Restart / Leave / Player removed | Clear hash to `` |

### Error Recovery

- Server restart (room gone) → server emits `error` → clear sessionStorage + hash → landing
- Corrupted sessionStorage → landing, clear hash
- Hash present but no session → landing, clear hash
- Socket fails to connect → components show "ulanmoqda..." indefinitely (existing behavior)

## Files to Change

1. **`src/App.jsx`** — Initial state from hash+session, set hash on events
2. **`src/components/HostGameScreen.jsx`** — Handle `gameState === null` (connecting state)
3. **`src/components/PlayerGameScreen.jsx`** — Handle `gameState === null` (connecting state)
4. **`src/components/LandingScreen.jsx`** — Set hash after joining (minor)

## Out of Scope

- URL sharing for other users to join (would need join form with pre-filled code)
- Path-based routing (would need server-side fallback config)
- React Router or any routing library
