// ─── localStorage adapter (window.storage o'rniga) ───────────────────────────
if (!window.storage) {
  window.storage = {
    async get(key) {
      try {
        const val = localStorage.getItem(key)
        return val ? { key, value: val } : null
      } catch { return null }
    },
    async set(key, value) {
      try {
        const v = typeof value === 'string' ? value : JSON.stringify(value)
        localStorage.setItem(key, v)
        return { key, value: v }
      } catch { return null }
    },
    async delete(key) {
      try {
        localStorage.removeItem(key)
        return { key, deleted: true }
      } catch { return null }
    },
    async list(prefix = '') {
      try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix))
        return { keys }
      } catch { return { keys: [] } }
    }
  }
}

import { useState, useEffect } from "react";
import { getSocket, onEvent, emitEvent } from './socket.js';
import { LandingScreen } from './components/LandingScreen.jsx';
import { HostGameScreen } from './components/HostGameScreen.jsx';
import { PlayerGameScreen } from './components/PlayerGameScreen.jsx';
import { ResultsScreen } from './components/ResultsScreen.jsx';

function genId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function App() {
  const [screen, setScreen]         = useState("landing");
  const [gameState, setGameState]   = useState(null);
  const [roomCode, setRoomCode]     = useState(null);
  const [isHost, setIsHost]         = useState(false);
  const [connected, setConnected]   = useState(false);
  const [gameResult, setGameResult] = useState(null);
  const [archiveId, setArchiveId]   = useState(null);

  useEffect(() => {
    const socket = getSocket();
    setConnected(socket.connected);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    const unsub1 = onEvent("room-created", ({ code }) => {
      setRoomCode(code);
      setIsHost(true);
      setScreen("hostGame");
      // Grab host name from pending session if available
      let hostName = "Host";
      try {
        const pending = JSON.parse(sessionStorage.getItem("game-session-pending") || "null");
        if (pending && pending.playerName) hostName = pending.playerName;
        sessionStorage.removeItem("game-session-pending");
      } catch (e) {}
      sessionStorage.setItem("game-session", JSON.stringify({ roomCode: code, isHost: true, playerName: hostName }));
    });

    const unsub2 = onEvent("game-state", (state) => {
      setGameState(state);
      // If we're on landing and receive game-state, we were reconnected — restore screen
      // Use a function setter to get current screen value
      setScreen(prev => {
        if (prev === "landing") {
          const session = JSON.parse(sessionStorage.getItem("game-session") || "null");
          if (session) {
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

    const unsub3 = onEvent("game-finished", ({ finalResult }) => {
      const id = genId();
      const record = { id, ...finalResult };
      try { window.storage.set(`results:${id}`, JSON.stringify(record), true); } catch(e) {}
      setArchiveId(id);
      setGameResult(record);
      setScreen("results");
      sessionStorage.removeItem("game-session");
    });

    const unsub4 = onEvent("error", ({ message }) => {
      console.error("Server error:", message);
    });

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      unsub1(); unsub2(); unsub3(); unsub4();
    };
  }, []);

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: "#0a0e1a", color: "#f0f4ff",
      fontFamily: "'Montserrat', 'Segoe UI', sans-serif", position: "relative",
      overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=Montserrat:wght@400;500;600;700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0e1a; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse  { from { opacity:1; } to { opacity:0.55; } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #111827; }
        ::-webkit-scrollbar-thumb { background: #1e2940; border-radius: 3px; }
      `}</style>

      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", backgroundImage: "linear-gradient(rgba(245,200,0,0.025) 1px, transparent 1px),linear-gradient(90deg, rgba(245,200,0,0.025) 1px, transparent 1px)", backgroundSize: "56px 56px" }} />

      <div style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {screen === "landing" && (
          <LandingScreen
            connected={connected}
            onHostCreated={() => {}}
            onPlayerJoined={() => setScreen("playerGame")}
          />
        )}
        {screen === "hostGame" && (
          <HostGameScreen
            gameState={gameState}
            roomCode={roomCode}
            onFinish={() => emitEvent("finish-game")}
          />
        )}
        {screen === "playerGame" && (
          <PlayerGameScreen gameState={gameState} />
        )}
        {screen === "results" && (
          <ResultsScreen
            gameResult={gameResult}
            archiveId={archiveId}
            onRestart={() => {
              setScreen("landing");
              setGameState(null);
              setRoomCode(null);
              setIsHost(false);
              sessionStorage.removeItem("game-session");
            }}
          />
        )}
      </div>
    </div>
  );
}
