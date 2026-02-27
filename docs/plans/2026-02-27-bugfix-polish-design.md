# Shaxsiy O'yin — Bug Fix & Polish Design

**Date:** 2026-02-27
**Scope:** Fix all known bugs, remove broken UI stubs, polish UX

---

## Approach

Priority-based: critical game mechanic bugs first, then socket/data fixes, then UI/UX polish. Each group is a separate commit.

---

## Bölüm 1: Kritik Mekanik Düzeltmeler

### A. correctScore (Manuel Puan Düzeltme)

**Problem:** `onCellClick` in HostGameScreen is a stub. UI shows "click to edit" tooltip but nothing happens.

**Solution:**
- Add `correctScore(socketId, { playerId, ti, ni })` to `GameManager.js`
- Cycle cell value: `null → "correct" → "wrong" → null`
- Add `correct-score` socket event in `server/index.js`
- Wire `onCellClick` in `HostGameScreen.jsx` to `emitEvent("correct-score", ...)`
- Only host socket allowed, only during `playing` phase

### B. Falstart

**Problem:** `falstartBlocked` Set is never populated. The `buzz()` method already blocks all buzzes when `!room.timerEnd`, making falstart toggle meaningless.

**Solution:**
- When falstart is enabled and timer hasn't started: buzzing adds the player to `falstartBlocked` (penalized for that round)
- When falstart is disabled and timer hasn't started: buzz silently rejected (current behavior)
- `buzz()` method: `if (!room.timerEnd && room.settings.falstart)` → add to `falstartBlocked`, emit `falstart-caught`; `if (!room.timerEnd && !room.settings.falstart)` → return null
- On `startTimer()`: do NOT clear `falstartBlocked` — blocked players stay blocked for that cell
- On next cell (`judge("correct")` or `skipQuestion` advancing): `falstartBlocked` is cleared
- Host UI: "FALSTART" panel renders correctly from `gameState.falstartBlocked`

### C. Dev Tab Bar Removal

**Problem:** SCREENS tab bar shown to all users, allowing players to navigate to host panel.

**Solution:**
- Remove `SCREENS` array and tab bar rendering from `App.jsx`
- Screen transitions driven entirely by socket events and state:
  - `room-created` → hostGame
  - `game-state` (as player) → playerGame
  - `game-finished` → results
  - Manual "back" button or error → landing

### D. Error Handling

**Problem:** `error` socket events only go to `console.error`. Users see nothing.

**Solution:**
- Add `errorMsg` state to `App.jsx`
- On `error` event: `setErrorMsg(message)`, auto-clear after 4 seconds
- Render a toast/banner at the top of the screen (fixed position, red background)
- Pass `errorMsg` to `LandingScreen` — show below join form as inline error

---

## Bölüm 2: Socket Protokol & Veri Düzeltmeleri

### E. `player-removed` Event Handling

**Problem:** Server emits `player-removed` but no client handles it. Removed player stays on stale screen.

**Solution:**
- Subscribe to `player-removed` in `App.jsx`
- If `data.playerId === getSocketId()`: navigate to landing, clear sessionStorage, show error toast
- Other players: no action needed (they get updated `game-state`)

### F. Host Disconnect

**Problem:** `hostDisconnected: true` flag from `handleDisconnect` is ignored. Host's `socketToRoom` entry leaks.

**Solution:**
- In `server/index.js` disconnect handler: if `result.hostDisconnected`, delete host's `socketToRoom` entry
- Add `hostConnected` field to `getGameState()` output
- `PlayerGameScreen`: show "Host bağlantısı kesildi" warning when `hostConnected === false`

### G. Reconnect Fixes

**Problem 1:** Auto-rejoin fires on initial connect (not just reconnect).
**Fix:** Check `socket.recovered` or track a `hasConnectedBefore` flag.

**Problem 2:** `LandingScreen` game-state listener leaks if join fails.
**Fix:** Return cleanup function from `useEffect`.

**Problem 3:** Host reconnect may send `playerName: "Host"` if disconnect happens before `room-created`.
**Fix:** Also store session in `game-session-pending` and check both on reconnect.

### H. Memory Leak Fixes

**Problem:** `socketToRoom` entries not cleaned after `finishGame` or host disconnect.

**Solution:**
- In `finishGame()`: iterate `room.players` and delete all `socketToRoom` entries
- In `handleDisconnect()`: always delete `this.socketToRoom.delete(socketId)` for both host and player

---

## Bölüm 3: UI/UX Polish

### I. Remove Broken UI Stubs

- **Topic name editing:** Remove `editingTopic`/`editValue` state and inline edit logic from `HostGameScreen`
- **"Mavzu qo'shish" button:** Remove entirely
- **Settings panel:** Keep read-only summary, clarify text that settings are locked

### J. PlayerGameScreen Fixes

- Fix ASCII apostrophe → `T` (U+2018) on line 85
- Add `getSocketId() || ""` fallback for first-render undefined
- Fix phase text: when `buzzOrder.length > 0 && !myBuzzed`, show "Javob kutilmoqda..." not "Host hazırlanıyor"
- Show "X buzz bosdi" info when someone has buzzed

### K. Minor Fixes

- Remove unused second arg from `window.storage.get()` call
- Defer `URL.revokeObjectURL` in CSV download with `setTimeout(..., 100)`
- Call `rebuildSnapshots` in ScoreBoard or optimize inline grand total calculation
