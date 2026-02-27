# Shaxsiy O'yin Bug Fix & Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all known bugs, remove broken UI stubs, and polish the UX across the entire app.

**Architecture:** Server-side fixes in GameManager.js and index.js for correctScore, falstart, disconnect handling, and memory leaks. Client-side fixes in App.jsx (remove dev tab bar, add error toast, handle player-removed), HostGameScreen.jsx (wire correctScore, remove fake edit UI), PlayerGameScreen.jsx (fix phase text, apostrophe, undefined guard), and socket.js (reconnect fix). No new files created.

**Tech Stack:** Node.js, Express 5, Socket.IO 4, React 18

---

## Task 0: Add `correctScore` method to GameManager

**Files:**
- Modify: `server/GameManager.js:96-105` (add method after `_ensureTopicScores`)

**Step 1: Add `correctScore` method to `GameManager` class**

Insert after `_ensureTopicScores` method (after line 105) in `server/GameManager.js`:

```js
  correctScore(socketId, { playerId, ti, ni }) {
    const room = this.getRoomForSocket(socketId);
    if (!room || room.hostSocketId !== socketId) return null;
    if (room.phase !== "playing") return null;

    this._ensureTopicScores(room, ti);
    const nom = room.settings.nominals[ni];
    if (!room.topicScores[ti][playerId]) {
      room.topicScores[ti][playerId] = {};
      room.settings.nominals.forEach(n => { room.topicScores[ti][playerId][n] = null; });
    }

    const current = room.topicScores[ti][playerId][nom];
    // Cycle: null -> "correct" -> "wrong" -> null
    const next = current === null ? "correct" : current === "correct" ? "wrong" : null;
    room.topicScores[ti][playerId][nom] = next;

    return { room };
  }
```

**Step 2: Add `correct-score` socket event in `server/index.js`**

Insert after the `judge` handler (after line 99) in `server/index.js`:

```js
  socket.on("correct-score", (data) => {
    const result = gm.correctScore(socket.id, data);
    if (!result) return;
    broadcastState(result.room);
  });
```

**Step 3: Verify server starts**

Run: `cd /home/ailabs/private_game && node server/index.js`
Expected: "Server running on port 3010" with no errors. Ctrl+C to stop.

**Step 4: Commit**

```bash
git add server/GameManager.js server/index.js
git commit -m "feat: add correctScore method for manual score editing"
```

---

## Task 1: Wire correctScore in HostGameScreen UI

**Files:**
- Modify: `src/components/HostGameScreen.jsx:552-555` (onCellClick handler)
- Modify: `src/components/HostGameScreen.jsx:567` (hint text)

**Step 1: Wire the `onCellClick` handler**

In `src/components/HostGameScreen.jsx`, find the `onCellClick` prop on the ScoreBoard (around line 552):

Replace:
```jsx
                      onCellClick={(sid, n) => {
                        // Manual score editing via socket is not yet implemented;
                        // for now this is a visual-only feature
                      }}
```

With:
```jsx
                      onCellClick={(sid, n) => {
                        const ni = activeNominals.indexOf(n);
                        if (ni === -1) return;
                        emitEvent("correct-score", { playerId: sid, ti: scorePanelTi, ni });
                      }}
```

Note: `scorePanelTi` is already in scope from the enclosing `.map()` closure (line 532).

**Step 2: Verify the build compiles**

Run: `cd /home/ailabs/private_game && npx vite build`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```bash
git add src/components/HostGameScreen.jsx
git commit -m "feat: wire correctScore to ScoreBoard cell clicks"
```

---

## Task 2: Fix falstart enforcement on the server

**Files:**
- Modify: `server/GameManager.js:107-123` (startTimer — don't clear falstartBlocked)
- Modify: `server/GameManager.js:137-158` (buzz — add falstart detection)
- Modify: `server/GameManager.js:184-204` (judge — clear falstartBlocked on advance)
- Modify: `server/GameManager.js:206-230` (skipQuestion — clear falstartBlocked on advance)

**Step 1: Modify `startTimer` — stop clearing `falstartBlocked` on every start**

In `server/GameManager.js`, in the `startTimer` method, replace line 113:

```js
    room.falstartBlocked = new Set();
```

With nothing — delete that line entirely. The `falstartBlocked` set should persist across the active cell; it's only cleared when advancing to the next cell.

**Step 2: Modify `buzz` — detect early buzzes when falstart is enabled**

In `server/GameManager.js`, replace the `buzz` method (lines 137-158) entirely:

```js
  buzz(socketId) {
    const room = this.getRoomForSocket(socketId);
    if (!room) return null;
    if (room.blockedPlayers.has(socketId)) return null;
    if (room.falstartBlocked.has(socketId)) return null;
    if (room.buzzOrder.some(b => b.socketId === socketId)) return null;

    const player = room.players.find(p => p.socketId === socketId);
    if (!player || !player.connected) return null;

    // Timer not running yet
    if (!room.timerEnd) {
      // Falstart enabled: penalize this player for the current cell
      if (room.settings.falstart && room.activeCell) {
        room.falstartBlocked.add(socketId);
        return { room, falstart: true };
      }
      // Falstart disabled: silently reject
      return null;
    }

    const effectiveTime = Date.now() - Math.floor(player.latency / 2);
    room.buzzOrder.push({ socketId, name: player.name, effectiveTime });
    room.buzzOrder.sort((a, b) => a.effectiveTime - b.effectiveTime);

    // Stop timer on first buzz
    if (room.buzzOrder.length === 1) {
      clearTimeout(room.timerTimeout);
      room.timerEnd = null;
    }

    return { room };
  }
```

**Step 3: Clear `falstartBlocked` when advancing to next cell in `judge`**

In `server/GameManager.js`, in the `judge` method, after line 184 (`if (result === "correct") {`), add `room.falstartBlocked = new Set();` right after `room.buzzOrder = [];`:

Replace:
```js
    if (result === "correct") {
      room.buzzOrder = [];
      clearTimeout(room.timerTimeout);
```

With:
```js
    if (result === "correct") {
      room.buzzOrder = [];
      room.falstartBlocked = new Set();
      clearTimeout(room.timerTimeout);
```

**Step 4: Clear `falstartBlocked` in `skipQuestion`**

In `server/GameManager.js`, in the `skipQuestion` method, after `room.buzzOrder = [];` (line 216), add:

```js
    room.falstartBlocked = new Set();
```

**Step 5: Clear `falstartBlocked` in `handleTimerExpiry`**

Keep the existing `room.falstartBlocked = new Set();` in `handleTimerExpiry` (line 134) — this is correct since when the timer expires and no one answered, we advance to the next state.

**Step 6: Handle falstart result in `server/index.js`**

In `server/index.js`, replace the `buzz` handler (lines 88-93):

```js
  socket.on("buzz", () => {
    const result = gm.buzz(socket.id);
    if (!result) return;
    if (result.falstart) {
      io.to(result.room.code).emit("falstart-caught", { playerId: socket.id });
    }
    if (result.room.buzzOrder.length > 0) {
      io.to(result.room.code).emit("buzz-update", { buzzOrder: result.room.buzzOrder });
    }
    broadcastState(result.room);
  });
```

**Step 7: Verify server starts**

Run: `cd /home/ailabs/private_game && node server/index.js`
Expected: "Server running on port 3010" with no errors. Ctrl+C.

**Step 8: Commit**

```bash
git add server/GameManager.js server/index.js
git commit -m "fix: implement falstart enforcement on server"
```

---

## Task 3: Remove dev tab bar from App.jsx

**Files:**
- Modify: `src/App.jsx:40-46` (remove SCREENS array)
- Modify: `src/App.jsx:146-156` (remove tab bar render)

**Step 1: Remove the SCREENS constant**

In `src/App.jsx`, delete lines 40-46:

```js
const SCREENS = [
  { id: "landing",    label: "Bosh sahifa" },
  { id: "hostGame",   label: "Boshlovchi panel" },
  { id: "playerGame", label: `O${T}yinchi ekrani` },
  { id: "results",    label: "Natijalar" },
];
```

**Step 2: Remove the tab bar rendering**

In `src/App.jsx`, delete the entire tab bar `<div>` (lines 146-156):

```jsx
      <div style={{ flexShrink: 0, zIndex: 200, background: "rgba(10,14,26,0.97)", backdropFilter: "blur(8px)", borderBottom: "1px solid #1e2940", display: "flex", gap: 0, overflowX: "auto", padding: "0 8px" }}>
        {SCREENS.map(s => (
          <button key={s.id} onClick={() => setScreen(s.id)} style={{
            background: "none", border: "none", cursor: "pointer", padding: "12px 14px",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
            color: screen === s.id ? "#f5c800" : "#8899aa",
            borderBottom: screen === s.id ? "2px solid #f5c800" : "2px solid transparent",
            whiteSpace: "nowrap", fontFamily: "inherit", transition: "color 0.15s",
          }}>{s.label}</button>
        ))}
      </div>
```

**Step 3: Remove unused `T` import if only used in SCREENS**

Check if `T` is used elsewhere in App.jsx. It's imported on line 33 but SCREENS was the only usage. Remove the import:

Replace:
```js
import { T } from './utils/constants.js';
```
With nothing — delete that line.

**Step 4: Verify the build compiles**

Run: `cd /home/ailabs/private_game && npx vite build`
Expected: Build succeeds with no errors.

**Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "fix: remove dev tab bar from production UI"
```

---

## Task 4: Add error toast to App.jsx

**Files:**
- Modify: `src/App.jsx` — add `errorMsg` state, update error handler, render toast

**Step 1: Add `errorMsg` state**

In `src/App.jsx`, after the existing state declarations (around line 59), add:

```js
  const [errorMsg, setErrorMsg]     = useState(null);
```

**Step 2: Update the error event handler**

Replace the error handler (around line 115-117):

```js
    const unsub4 = onEvent("error", ({ message }) => {
      console.error("Server error:", message);
    });
```

With:

```js
    const unsub4 = onEvent("error", ({ message }) => {
      console.error("Server error:", message);
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(null), 4000);
    });
```

**Step 3: Render error toast**

Inside the return JSX, right after the `<style>` block and the grid background div (before the main content `<div>`), add:

```jsx
      {errorMsg && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, background: "#e63946", color: "#fff", padding: "10px 20px",
          borderRadius: 6, fontSize: 13, fontWeight: 600, fontFamily: "inherit",
          boxShadow: "0 4px 20px rgba(230,57,70,0.4)", animation: "fadeIn 0.2s ease both",
          maxWidth: "90vw", textAlign: "center",
        }}>
          {errorMsg}
        </div>
      )}
```

**Step 4: Pass errorMsg to LandingScreen**

Update the LandingScreen usage to pass errorMsg:

Replace:
```jsx
          <LandingScreen
            connected={connected}
            onHostCreated={() => {}}
            onPlayerJoined={() => setScreen("playerGame")}
          />
```

With:
```jsx
          <LandingScreen
            connected={connected}
            onHostCreated={() => {}}
            onPlayerJoined={() => setScreen("playerGame")}
            errorMsg={errorMsg}
          />
```

**Step 5: Show error inline in LandingScreen**

In `src/components/LandingScreen.jsx`, add `errorMsg` to the destructured props (line 7):

Replace:
```jsx
export function LandingScreen({ connected, onHostCreated, onPlayerJoined }) {
```

With:
```jsx
export function LandingScreen({ connected, onHostCreated, onPlayerJoined, errorMsg }) {
```

Then add error display in the player join card, right before the `QO'SHILISH` button (around line 172-174). Replace:

```jsx
          {playerError && <div style={{ fontSize: 11, color: "#e63946", marginBottom: 8 }}>⚠ {playerError}</div>}
```

With:

```jsx
          {playerError && <div style={{ fontSize: 11, color: "#e63946", marginBottom: 8 }}>⚠ {playerError}</div>}
          {errorMsg && <div style={{ fontSize: 11, color: "#e63946", marginBottom: 8, padding: "6px 10px", background: "rgba(230,57,70,0.1)", borderRadius: 4, border: "1px solid rgba(230,57,70,0.3)" }}>⚠ {errorMsg}</div>}
```

**Step 6: Verify build**

Run: `cd /home/ailabs/private_game && npx vite build`

**Step 7: Commit**

```bash
git add src/App.jsx src/components/LandingScreen.jsx
git commit -m "feat: add error toast for server error messages"
```

---

## Task 5: Handle `player-removed` event and host disconnect

**Files:**
- Modify: `src/App.jsx` — subscribe to `player-removed`
- Modify: `server/index.js:132-137` — handle host disconnect cleanup
- Modify: `server/GameManager.js:284-298` — delete host socketToRoom on disconnect
- Modify: `server/GameManager.js:300-322` — add `hostConnected` to getGameState

**Step 1: Subscribe to `player-removed` in App.jsx**

In `src/App.jsx`, inside the `useEffect`, after the `unsub4` declaration, add:

```js
    const unsub5 = onEvent("player-removed", ({ playerId }) => {
      if (playerId === getSocket().id) {
        setScreen("landing");
        setGameState(null);
        setRoomCode(null);
        setIsHost(false);
        sessionStorage.removeItem("game-session");
        setErrorMsg("Siz o'yindan chiqarildingiz");
        setTimeout(() => setErrorMsg(null), 4000);
      }
    });
```

Update the cleanup return to include `unsub5`:

Replace:
```js
      unsub1(); unsub2(); unsub3(); unsub4();
```

With:
```js
      unsub1(); unsub2(); unsub3(); unsub4(); unsub5();
```

**Step 2: Fix host disconnect in GameManager**

In `server/GameManager.js`, in the `handleDisconnect` method (lines 284-298), add `socketToRoom.delete` for host too:

Replace:
```js
    if (room.hostSocketId === socketId) {
      return { room, hostDisconnected: true };
    }
```

With:
```js
    if (room.hostSocketId === socketId) {
      this.socketToRoom.delete(socketId);
      return { room, hostDisconnected: true };
    }
```

**Step 3: Add `hostConnected` to `getGameState`**

In `server/GameManager.js`, in the `getGameState` method, add a `hostConnected` field. Find the method and add after `hostSocketId`:

Replace:
```js
      hostSocketId: room.hostSocketId,
```

With:
```js
      hostSocketId: room.hostSocketId,
      hostConnected: !!Array.from(require("socket.io") || []).length, // placeholder
```

Actually, we need a different approach. Track host connected status on the room itself. In `handleDisconnect`, set a flag:

Replace the entire `handleDisconnect` method:

```js
  handleDisconnect(socketId) {
    const room = this.getRoomForSocket(socketId);
    if (!room) return null;

    if (room.hostSocketId === socketId) {
      this.socketToRoom.delete(socketId);
      room.hostConnected = false;
      return { room, hostDisconnected: true };
    }

    const player = room.players.find(p => p.socketId === socketId);
    if (player) player.connected = false;
    room.buzzOrder = room.buzzOrder.filter(b => b.socketId !== socketId);
    this.socketToRoom.delete(socketId);

    return { room, playerDisconnected: socketId };
  }
```

And in `createRoom`, add `hostConnected: true` to the room object (after `hostName` on line 32):

Add this field to the room creation (after `hostName,`):
```js
      hostConnected: true,
```

In `joinRoom`, when host reconnects (lines 58-63), set `hostConnected: true`:

Replace:
```js
    if (isHost && room.hostName === playerName) {
      const oldHostId = room.hostSocketId;
      this.socketToRoom.delete(oldHostId);
      room.hostSocketId = socketId;
      this.socketToRoom.set(socketId, code);
      return { room, reconnected: true, isHost: true };
    }
```

With:
```js
    if (isHost && room.hostName === playerName) {
      const oldHostId = room.hostSocketId;
      this.socketToRoom.delete(oldHostId);
      room.hostSocketId = socketId;
      room.hostConnected = true;
      this.socketToRoom.set(socketId, code);
      return { room, reconnected: true, isHost: true };
    }
```

In `getGameState`, add `hostConnected`:

Replace:
```js
      hostSocketId: room.hostSocketId,
```

With:
```js
      hostSocketId: room.hostSocketId,
      hostConnected: room.hostConnected !== false,
```

**Step 4: Show host disconnect warning in PlayerGameScreen**

In `src/components/PlayerGameScreen.jsx`, after the `roomCode` derivation (around line 23), add:

```js
  const hostConnected = gameState?.hostConnected !== false;
```

Then in the JSX, right after the topbar `<div>` close tag (after line 93), add:

```jsx
      {!hostConnected && (
        <div style={{ background: "rgba(243,156,18,0.12)", borderBottom: "1px solid rgba(243,156,18,0.3)", padding: "8px 16px", textAlign: "center", fontSize: 12, color: "#f39c12", fontWeight: 600 }}>
          ⚠ Boshlovchi bilan aloqa uzildi. Qayta ulanishini kuting...
        </div>
      )}
```

**Step 5: Verify server and build**

Run: `cd /home/ailabs/private_game && node server/index.js` (verify no errors, Ctrl+C)
Run: `cd /home/ailabs/private_game && npx vite build`

**Step 6: Commit**

```bash
git add server/GameManager.js server/index.js src/App.jsx src/components/PlayerGameScreen.jsx
git commit -m "fix: handle player-removed event and host disconnect"
```

---

## Task 6: Fix reconnect logic in socket.js

**Files:**
- Modify: `src/socket.js:20-35` — only auto-rejoin on actual reconnect

**Step 1: Track initial connection to avoid double-join**

Replace the `socket.on("connect", ...)` handler in `src/socket.js` (lines 20-35):

```js
    // Auto-rejoin room on reconnect (not initial connect)
    let hasConnectedBefore = false;
    socket.on("connect", () => {
      if (!hasConnectedBefore) {
        hasConnectedBefore = true;
        return;
      }
      const raw = sessionStorage.getItem("game-session");
      if (!raw) return;
      try {
        const session = JSON.parse(raw);
        if (session && session.roomCode) {
          socket.emit("join-room", {
            code: session.roomCode,
            playerName: session.playerName || "Host",
            isHost: !!session.isHost,
          });
        }
      } catch (e) {
        // Corrupt session data, ignore
      }
    });
```

**Step 2: Verify build**

Run: `cd /home/ailabs/private_game && npx vite build`

**Step 3: Commit**

```bash
git add src/socket.js
git commit -m "fix: only auto-rejoin on actual reconnect, not initial connect"
```

---

## Task 7: Fix LandingScreen listener leak

**Files:**
- Modify: `src/components/LandingScreen.jsx:36-48` — use useEffect cleanup for game-state listener

**Step 1: Fix the `handlePlayer` function's game-state listener**

In `src/components/LandingScreen.jsx`, the current implementation registers a listener that's never cleaned up on unmount. Refactor `handlePlayer`:

Replace:
```js
  const handlePlayer = () => {
    if (!playerName.trim()) { setPlayerError("Ismingizni kiriting"); return; }
    if (gameCode.length < 4) { setPlayerError(`O${T}yin kodini kiriting`); return; }
    setPlayerError("");
    emitEvent("join-room", { code: gameCode, playerName: playerName.trim() });
    // Listen for first game-state to confirm join success
    const unsub = onEvent("game-state", () => {
      unsub();
      // Store player session for reconnect
      sessionStorage.setItem("game-session", JSON.stringify({ roomCode: gameCode, isHost: false, playerName: playerName.trim() }));
      onPlayerJoined();
    });
  };
```

With:
```js
  const [joinPending, setJoinPending] = useState(false);

  const handlePlayer = () => {
    if (!playerName.trim()) { setPlayerError("Ismingizni kiriting"); return; }
    if (gameCode.length < 4) { setPlayerError(`O${T}yin kodini kiriting`); return; }
    setPlayerError("");
    setJoinPending(true);
    emitEvent("join-room", { code: gameCode, playerName: playerName.trim() });
  };
```

Note: `joinPending` state is declared alongside other state declarations at the top.

Then add a `useEffect` that listens for `game-state` only when `joinPending` is true. Add this after the `handlePlayer` function. We need to import `useEffect` — it's not currently imported. Update the import:

Replace:
```js
import { useState } from "react";
```

With:
```js
import { useState, useEffect } from "react";
```

Add the useEffect:

```js
  useEffect(() => {
    if (!joinPending) return;
    const unsub = onEvent("game-state", () => {
      unsub();
      setJoinPending(false);
      sessionStorage.setItem("game-session", JSON.stringify({ roomCode: gameCode, isHost: false, playerName: playerName.trim() }));
      onPlayerJoined();
    });
    return () => { unsub(); setJoinPending(false); };
  }, [joinPending, gameCode, playerName, onPlayerJoined]);
```

**Step 2: Verify build**

Run: `cd /home/ailabs/private_game && npx vite build`

**Step 3: Commit**

```bash
git add src/components/LandingScreen.jsx
git commit -m "fix: clean up game-state listener on LandingScreen unmount"
```

---

## Task 8: Fix memory leaks in finishGame

**Files:**
- Modify: `server/GameManager.js:260-282` — clean up socketToRoom entries

**Step 1: Delete all socketToRoom entries in `finishGame`**

In `server/GameManager.js`, in the `finishGame` method, before the `setTimeout` (around line 276), add cleanup:

Replace:
```js
    // Schedule room cleanup after 5 minutes
    setTimeout(() => {
      this.rooms.delete(room.code);
    }, 5 * 60 * 1000);
```

With:
```js
    // Clean up socketToRoom entries
    this.socketToRoom.delete(room.hostSocketId);
    room.players.forEach(p => this.socketToRoom.delete(p.socketId));

    // Schedule room cleanup after 5 minutes
    setTimeout(() => {
      this.rooms.delete(room.code);
    }, 5 * 60 * 1000);
```

**Step 2: Verify server starts**

Run: `cd /home/ailabs/private_game && node server/index.js`
Expected: No errors. Ctrl+C.

**Step 3: Commit**

```bash
git add server/GameManager.js
git commit -m "fix: clean up socketToRoom entries on game finish"
```

---

## Task 9: Remove broken UI stubs from HostGameScreen

**Files:**
- Modify: `src/components/HostGameScreen.jsx` — remove topic editing, "Mavzu qo'shish" button

**Step 1: Remove topic name editing state and UI**

In `src/components/HostGameScreen.jsx`, remove the state variables on lines 11-12:

```js
  const [editingTopic, setEditingTopic] = useState(null);
  const [editValue, setEditValue]     = useState("");
```

Then replace the topic name rendering block (lines 327-343) that contains the `editingTopic` conditional:

Replace:
```jsx
                    {editingTopic === ti ? (
                      <input autoFocus value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => {
                          if (e.key === "Enter") { setEditingTopic(null); }
                          if (e.key === "Escape") setEditingTopic(null);
                        }}
                        onBlur={() => { setEditingTopic(null); }}
                        style={{ background: "#1e2940", border: "1px solid #f5c800", color: "#f0f4ff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, borderRadius: 3, padding: "4px 8px", outline: "none", flex: 1 }}
                      />
                    ) : (
                      <span onClick={e => { e.stopPropagation(); setEditingTopic(ti); setEditValue(topicName); }}
                        style={{ fontFamily: "'Anton', sans-serif", fontSize: 14, letterSpacing: "0.04em", color: isTopicActive ? "#f5c800" : "#f0f4ff", flex: 1 }}>
                        {ti + 1}. {topicName}
                      </span>
                    )}
```

With:
```jsx
                    <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 14, letterSpacing: "0.04em", color: isTopicActive ? "#f5c800" : "#f0f4ff", flex: 1 }}>
                      {ti + 1}. {topicName}
                    </span>
```

**Step 2: Remove "Mavzu qo'shish" button**

Delete the entire block (lines 506-517):

```jsx
            <div style={{ padding: "10px 12px 16px" }}>
              <button onClick={() => {
                // Adding topics is a local-only action for now; topic names come from server
              }} style={{
                width: "100%", background: "transparent", border: "1px dashed #2a3a52", borderRadius: 4,
                padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", color: "#445566",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", transition: "all 0.15s",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#f5c800"; e.currentTarget.style.color = "#f5c800"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a3a52"; e.currentTarget.style.color = "#445566"; }}
              >+ Mavzu qo{T}shish</button>
            </div>
```

**Step 3: Update the hint text below scoreboards**

Replace line 567:
```jsx
              <div style={{ fontSize: 11, color: "#445566", marginTop: 4 }}>{`Katakchani bosib natijani o${T}zgartirish mumkin`}</div>
```

With:
```jsx
              <div style={{ fontSize: 11, color: "#445566", marginTop: 4 }}>{`Katakchani bosib natijani o\u2018zgartirish mumkin (null \u2192 to\u2018g\u2018ri \u2192 noto\u2018g\u2018ri \u2192 null)`}</div>
```

**Step 4: Verify build**

Run: `cd /home/ailabs/private_game && npx vite build`

**Step 5: Commit**

```bash
git add src/components/HostGameScreen.jsx
git commit -m "fix: remove broken topic editing and add-topic button stubs"
```

---

## Task 10: Fix PlayerGameScreen issues

**Files:**
- Modify: `src/components/PlayerGameScreen.jsx`

**Step 1: Fix ASCII apostrophe**

On line 85, replace:
```jsx
          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 20, letterSpacing: "0.1em", color: "#f5c800" }}>{`SHAXSIY O'YIN`}</span>
```

With:
```jsx
          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 20, letterSpacing: "0.1em", color: "#f5c800" }}>{`SHAXSIY O${T}YIN`}</span>
```

**Step 2: Add `getSocketId()` undefined guard**

On line 13, replace:
```js
  const myId = getSocketId();
```

With:
```js
  const myId = getSocketId() || "";
```

**Step 3: Fix phase text when someone else has buzzed**

On line 117, the "waiting" phase message shows "Boshlovchi savolni tayyorlamoqda..." even when someone has buzzed. Replace:

```jsx
        {phase === "waiting" && <div style={{ textAlign: "center", color: "#8899aa", fontSize: 13, marginBottom: 12 }}>{"\u23F3"} Boshlovchi savolni tayyorlamoqda...</div>}
```

With:
```jsx
        {phase === "waiting" && (
          <div style={{ textAlign: "center", color: "#8899aa", fontSize: 13, marginBottom: 12 }}>
            {!activeCell ? "\u23F3 Boshlovchi savolni tayyorlamoqda..." : "\u23F3 Javob kutilmoqda..."}
          </div>
        )}
```

**Step 4: Fix phase derivation — show "answering" state when someone buzzed but I haven't**

On line 31, the current derivation is confusing. Replace:

```js
  const phase = !activeCell ? "waiting" : timerEnd ? "active" : myBuzzed ? "buzzed" : buzzOrder.length > 0 ? "buzzed" : "waiting";
```

With:
```js
  const phase = !activeCell ? "waiting" : timerEnd ? "active" : myBuzzed ? "buzzed" : buzzOrder.length > 0 ? "answering" : "waiting";
```

Then update the button disabled condition and status text accordingly. The buzz button disable check on line 126:

Replace:
```jsx
              disabled={phase !== "active" || myBuzzed}
```

With:
```jsx
              disabled={phase !== "active"}
```

And the status text below the button (line 141):

Replace:
```jsx
              {phase === "active" && !myBuzzed ? "Bosing yoki SPACE" : myBuzzed ? "Siz bosdingiz!" : "Kutilmoqda..."}
```

With:
```jsx
              {phase === "active" ? "Bosing yoki SPACE" : myBuzzed ? "Siz bosdingiz!" : phase === "answering" ? "Javob kutilmoqda..." : "Kutilmoqda..."}
```

Add an answering phase display after the existing `phase === "buzzed"` blocks. After the `phase === "waiting"` block (line 117 area), no additional JSX needed — the modified waiting text already handles it.

**Step 5: Verify build**

Run: `cd /home/ailabs/private_game && npx vite build`

**Step 6: Commit**

```bash
git add src/components/PlayerGameScreen.jsx
git commit -m "fix: apostrophe consistency, undefined guard, phase text in PlayerGameScreen"
```

---

## Task 11: Minor fixes (ResultsScreen, CSV download)

**Files:**
- Modify: `src/components/ResultsScreen.jsx:17` — remove unused second arg
- Modify: `src/components/ResultsScreen.jsx:65-66` — defer URL.revokeObjectURL

**Step 1: Fix `window.storage.get()` call**

On line 17, replace:
```js
      window.storage.get(`results:${hash}`, true)
```

With:
```js
      window.storage.get(`results:${hash}`)
```

**Step 2: Fix CSV download URL revocation**

On lines 65-66, replace:
```js
    const a = document.createElement("a"); a.href = url; a.download = "natijalar.csv"; a.click();
    URL.revokeObjectURL(url);
```

With:
```js
    const a = document.createElement("a"); a.href = url; a.download = "natijalar.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
```

**Step 3: Verify build**

Run: `cd /home/ailabs/private_game && npx vite build`

**Step 4: Commit**

```bash
git add src/components/ResultsScreen.jsx
git commit -m "fix: minor fixes in ResultsScreen (storage call, CSV download)"
```

---

## Task 12: Final verification

**Step 1: Run full build**

```bash
cd /home/ailabs/private_game && npx vite build
```

Expected: Build succeeds, no warnings.

**Step 2: Start dev server and verify**

```bash
cd /home/ailabs/private_game && npm run dev
```

Expected: Both Vite and Express start without errors.

**Step 3: Update CLAUDE.md if needed**

Verify the CLAUDE.md still accurately reflects the codebase. No changes needed unless new events were added to the protocol section.

Add `correct-score` and `falstart-caught` to the Socket.IO Protocol section in CLAUDE.md under "Client -> Server events" and "Server -> Client events" respectively.

**Step 4: Commit CLAUDE.md changes**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with new socket events"
```
