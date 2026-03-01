# Instant Reconnect + Hash URL Routing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate landing screen flash on page refresh and add hash-based URL routing for active games.

**Architecture:** On mount, App.jsx reads `#game/XXXX` hash + sessionStorage to instantly restore the correct screen. Hash is set on game events and cleared on exit. Both HostGameScreen and PlayerGameScreen already handle `gameState === null` with loading states — no changes needed there.

**Tech Stack:** React useState lazy initializers, window.location.hash, sessionStorage

---

### Task 1: Instant screen restore from hash + sessionStorage

**Files:**
- Modify: `src/App.jsx:53-66` (initial state declarations)

**Step 1: Replace the screen/roomCode/isHost initial state**

Replace lines 53–65 (the useState declarations for screen, gameState, attachments, roomCode, isHost, connected):

```jsx
export default function App() {
  const [screen, setScreen]         = useState(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#results/")) return "results";
    if (hash.startsWith("#game/")) {
      try {
        const s = JSON.parse(sessionStorage.getItem("game-session") || "null");
        if (s?.roomCode) return s.isHost ? "hostGame" : "playerGame";
      } catch {}
    }
    return "landing";
  });
  const [gameState, setGameState]   = useState(null);
  const [attachments, setAttachments] = useState({});
  const [roomCode, setRoomCode]     = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("game-session") || "null")?.roomCode || null; }
    catch { return null; }
  });
  const [isHost, setIsHost]         = useState(() => {
    try { return !!JSON.parse(sessionStorage.getItem("game-session") || "null")?.isHost; }
    catch { return false; }
  });
  const [connected, setConnected]   = useState(false);
```

Keep the remaining useState declarations (gameResult, archiveId, errorMsg) unchanged.

**Step 2: Add a gameState ref for error recovery**

After the useState declarations (after line 65), add:

```jsx
  const gameStateRef = useRef(null);
```

And add `useRef` to the React import at line 32:

```jsx
import { useState, useEffect, useRef } from "react";
```

**Step 3: Clean up invalid hash on mount**

At the start of the existing useEffect (after `socket.on("disconnect", onDisconnect);` at line 74), add:

```jsx
    // Clean up invalid hash (e.g. #game/ without valid session)
    if (window.location.hash.startsWith("#game/") && !sessionStorage.getItem("game-session")) {
      window.location.hash = "";
    }
```

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: restore screen instantly from hash + sessionStorage on mount"
```

---

### Task 2: Set hash on game events

**Files:**
- Modify: `src/App.jsx` (event handlers inside useEffect)

**Step 1: Set hash in room-created handler**

In the `room-created` handler (line 76–88), add hash setting after `setScreen("hostGame")`:

```jsx
    const unsub1 = onEvent("room-created", ({ code }) => {
      setRoomCode(code);
      setIsHost(true);
      setScreen("hostGame");
      window.location.hash = `game/${code}`;
      // Grab host name from pending session if available
      let hostName = "Host";
      try {
        const pending = JSON.parse(sessionStorage.getItem("game-session-pending") || "null");
        if (pending && pending.playerName) hostName = pending.playerName;
        sessionStorage.removeItem("game-session-pending");
      } catch (e) {}
      sessionStorage.setItem("game-session", JSON.stringify({ roomCode: code, isHost: true, playerName: hostName }));
    });
```

**Step 2: Set hash in game-state reconnect handler**

In the `game-state` handler (line 90–109), add hash setting when restoring from landing and keep gameStateRef in sync:

```jsx
    const unsub2 = onEvent("game-state", (state) => {
      gameStateRef.current = state;
      setGameState(state);
      setScreen(prev => {
        if (prev === "landing") {
          const session = JSON.parse(sessionStorage.getItem("game-session") || "null");
          if (session) {
            window.location.hash = `game/${state.code}`;
            if (session.isHost) {
              setRoomCode(state.code);
              setIsHost(true);
              return "hostGame";
            } else {
              return "playerGame";
            }
          }
        }
        return prev;
      });
    });
```

**Step 3: Set hash in onPlayerJoined callback**

Modify the LandingScreen's `onPlayerJoined` prop (line 211) to also set hash:

```jsx
          <LandingScreen
            connected={connected}
            onHostCreated={() => {}}
            onPlayerJoined={() => {
              setScreen("playerGame");
              try {
                const s = JSON.parse(sessionStorage.getItem("game-session") || "null");
                if (s?.roomCode) window.location.hash = `game/${s.roomCode}`;
              } catch {}
            }}
            errorMsg={errorMsg}
          />
```

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: set URL hash to #game/CODE on game events"
```

---

### Task 3: Clear hash on exit events + error recovery

**Files:**
- Modify: `src/App.jsx` (player-removed handler, error handler)

**Step 1: Clear hash in player-removed handler**

In the `player-removed` handler (line 139–148), add hash clearing:

```jsx
    const unsub5 = onEvent("player-removed", ({ playerId }) => {
      if (playerId === getSocket().id) {
        setScreen("landing");
        setGameState(null);
        gameStateRef.current = null;
        setRoomCode(null);
        setIsHost(false);
        sessionStorage.removeItem("game-session");
        window.location.hash = "";
        setErrorMsg("Siz o'yindan chiqarildingiz");
        setTimeout(() => setErrorMsg(null), 4000);
      }
    });
```

**Step 2: Add error recovery for failed reconnect**

In the `error` handler (line 133–137), add reconnect failure detection — if we're on a game screen but never received gameState, the reconnect failed:

```jsx
    const unsub4 = onEvent("error", ({ message }) => {
      console.error("Server error:", message);
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(null), 4000);
      // If restored from hash but reconnect failed (no gameState yet), go to landing
      setScreen(prev => {
        if ((prev === "hostGame" || prev === "playerGame") && !gameStateRef.current) {
          window.location.hash = "";
          sessionStorage.removeItem("game-session");
          setRoomCode(null);
          setIsHost(false);
          return "landing";
        }
        return prev;
      });
    });
```

**Step 3: Clear gameStateRef in game-finished handler**

In the `game-finished` handler (line 111–119), add ref clearing:

```jsx
    const unsub3 = onEvent("game-finished", ({ finalResult }) => {
      const id = finalResult.id || genId();
      try { window.storage.set(`results:${id}`, JSON.stringify(finalResult), true); } catch(e) {}
      setArchiveId(id);
      setGameResult(finalResult);
      setScreen("results");
      gameStateRef.current = null;
      window.location.hash = `results/${id}`;
      sessionStorage.removeItem("game-session");
    });
```

**Step 4: Clear gameStateRef in restart handler**

In the ResultsScreen `onRestart` callback (line 229–235):

```jsx
            onRestart={() => {
              setScreen("landing");
              setGameState(null);
              gameStateRef.current = null;
              setRoomCode(null);
              setIsHost(false);
              window.location.hash = "";
              sessionStorage.removeItem("game-session");
            }}
```

**Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: clear hash on game exit, handle failed reconnect recovery"
```

---

### Task 4: Manual verification

**Step 1: Start the dev server**

```bash
npm run dev
```

**Step 2: Test host reconnect**

1. Create a game → verify URL shows `#game/XXXX`
2. Refresh the page → verify game screen appears instantly (no landing flash)
3. Verify "Yuklanmoqda..." shows briefly, then full game appears

**Step 3: Test player reconnect**

1. Join game in another tab → verify URL shows `#game/XXXX`
2. Refresh → verify player screen appears instantly
3. Verify "Kutilmoqda..." shows briefly, then full game appears

**Step 4: Test error recovery**

1. Join a game, note the URL
2. Stop the server
3. Refresh → game screen shows "Kutilmoqda..."
4. Start server → connection fails (room gone) → should redirect to landing

**Step 5: Test hash clearing**

1. Finish a game → verify URL changes to `#results/XXX`
2. Click restart → verify URL is clean (no hash)
3. Test player removal → verify URL is clean

**Step 6: Test clean visit**

1. Open `/#game/9999` without session → should show landing (hash cleared)
2. Open `/` normally → landing screen as usual

**Step 7: Final commit**

```bash
git add -A
git commit -m "feat: instant reconnect + hash URL routing for active games"
```
