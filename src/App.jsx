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

import { useState, useEffect, useRef } from "react";
import { T } from './utils/constants.js';
import { getSocket, onEvent, emitEvent } from './socket.js';
import { LandingScreen } from './components/LandingScreen.jsx';
import { HostGameScreen } from './components/HostGameScreen.jsx';
import { PlayerGameScreen } from './components/PlayerGameScreen.jsx';
import { ResultsScreen } from './components/ResultsScreen.jsx';
import { playGameSound } from './utils/sounds.js';

const IS_DEV = false;

const DEV_SCREENS = [
  { id: "landing", label: "Bosh sahifa" },
  { id: "hostGame", label: "Boshlovchi panel" },
  { id: "playerGame", label: `O${T}yinchi ekrani` },
  { id: "results", label: "Natijalar" },
];

function genId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function App() {
  const [screen, setScreen] = useState(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#results/")) return "results";
    if (hash.startsWith("#game/")) {
      try {
        const s = JSON.parse(sessionStorage.getItem("game-session") || "null");
        if (s?.roomCode) return s.isHost ? "hostGame" : "playerGame";
      } catch { }
    }
    return "landing";
  });
  const [gameState, setGameState] = useState(null);
  const [attachments, setAttachments] = useState({});
  const [roomCode, setRoomCode] = useState(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem("game-session") || "null");
      return s?.roomCode || null;
    } catch { return null; }
  });
  const [isHost, setIsHost] = useState(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem("game-session") || "null");
      return s?.isHost || false;
    } catch { return false; }
  });
  const [connected, setConnected] = useState(false);
  const [gameResult, setGameResult] = useState(null);
  const [archiveId, setArchiveId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const gameStateRef = useRef(null);

  useEffect(() => {
    const socket = getSocket();
    setConnected(socket.connected);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    if (window.location.hash.startsWith("#game/") && !sessionStorage.getItem("game-session")) {
      window.location.hash = "";
    }

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
      } catch (e) { }
      sessionStorage.setItem("game-session", JSON.stringify({ roomCode: code, isHost: true, playerName: hostName }));
    });

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
            }
            return "playerGame";
          }
        }
        return prev;
      });
    });

    const unsub3 = onEvent("game-finished", ({ finalResult }) => {
      const id = finalResult.id || genId();
      try { window.storage.set(`results:${id}`, JSON.stringify(finalResult), true); } catch (e) { }
      setArchiveId(id);
      setGameResult(finalResult);
      setScreen("results");
      gameStateRef.current = null;
      window.location.hash = `results/${id}`;
      sessionStorage.removeItem("game-session");
    });

    const unsub6 = onEvent("attachment-update", ({ key, data }) => {
      setAttachments(prev => {
        const next = { ...prev };
        if (data) next[key] = data; else delete next[key];
        return next;
      });
    });

    const unsub7 = onEvent("attachments-sync", (allAttachments) => {
      setAttachments(allAttachments);
    });

    const unsub8 = onEvent("buzz-update", ({ buzzOrder }) => {
      if (!buzzOrder || buzzOrder.length === 0) return;
      playGameSound(gameStateRef.current?.settings?.buzzerSound || "pop");
    });

    const unsub11 = onEvent("timer-started", () => {
      playGameSound(gameStateRef.current?.settings?.timerStartSound || "gudok");
    });

    const unsub9 = onEvent("timer-expired", () => {
      playGameSound(gameStateRef.current?.settings?.timerEndSound || "ding");
    });

    const unsub10 = onEvent("falstart-caught", () => {
      playGameSound(gameStateRef.current?.settings?.falstartSound || "error");
    });

    const unsub4 = onEvent("error", ({ message }) => {
      console.error("Server error:", message);
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(null), 4000);
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

    const unsub5 = onEvent("player-removed", ({ socketId }) => {
      if (socketId && socketId === getSocket().id) {
        setScreen("landing");
        setGameState(null);
        setRoomCode(null);
        setIsHost(false);
        gameStateRef.current = null;
        window.location.hash = "";
        sessionStorage.removeItem("game-session");
        setErrorMsg("Siz o'yindan chiqarildingiz");
        setTimeout(() => setErrorMsg(null), 4000);
      }
    });

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); unsub7(); unsub8(); unsub9(); unsub10(); unsub11();
    };
  }, []);

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: "var(--bg)", color: "var(--text)",
      fontFamily: "'Montserrat', 'Segoe UI', sans-serif", position: "relative",
      overflow: "hidden", transition: "background 0.3s, color 0.3s",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=Montserrat:wght@400;500;600;700;900&family=Noto+Color+Emoji&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); font-family: 'Montserrat', 'Segoe UI', sans-serif, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji'; transition: background 0.3s; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse  { from { opacity:1; } to { opacity:0.55; } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: var(--scrollbar-track); }
        ::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 3px; }
      `}</style>

      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", backgroundImage: "linear-gradient(var(--grid-line) 1px, transparent 1px),linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)", backgroundSize: "56px 56px" }} />

      {errorMsg && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, background: "var(--red)", color: "#fff", padding: "10px 20px",
          borderRadius: 6, fontSize: 13, fontWeight: 600, fontFamily: "inherit",
          boxShadow: "0 4px 20px rgba(230,57,70,0.4)", animation: "fadeIn 0.2s ease both",
          maxWidth: "90vw", textAlign: "center",
        }}>
          {errorMsg}
        </div>
      )}

      {IS_DEV && (
        <div style={{ flexShrink: 0, zIndex: 200, background: "var(--header-bg)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--border)", display: "flex", gap: 0, overflowX: "auto", padding: "0 8px" }}>
          {DEV_SCREENS.map(s => (
            <button key={s.id} onClick={() => setScreen(s.id)} style={{
              background: "none", border: "none", cursor: "pointer", padding: "12px 14px",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
              color: screen === s.id ? "var(--accent)" : "var(--text-secondary)",
              borderBottom: screen === s.id ? "2px solid var(--accent)" : "2px solid transparent",
              whiteSpace: "nowrap", fontFamily: "inherit", transition: "color 0.15s",
            }}>{s.label}</button>
          ))}
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {screen === "landing" && (
          <LandingScreen
            connected={connected}
            onHostCreated={() => { }}
            onPlayerJoined={() => {
              setScreen("playerGame");
              try {
                const s = JSON.parse(sessionStorage.getItem("game-session") || "null");
                if (s?.roomCode) window.location.hash = `game/${s.roomCode}`;
              } catch { }
            }}
            errorMsg={errorMsg}
          />
        )}
        {screen === "hostGame" && (
          <HostGameScreen
            gameState={gameState}
            roomCode={roomCode}
            attachments={attachments}
            onFinish={() => emitEvent("finish-game")}
          />
        )}
        {screen === "playerGame" && (
          <PlayerGameScreen gameState={gameState} attachments={attachments} />
        )}
        {screen === "results" && (
          <ResultsScreen
            gameResult={gameResult}
            archiveId={archiveId}
            onRestart={() => {
              gameStateRef.current = null;
              setScreen("landing");
              setGameState(null);
              setRoomCode(null);
              setIsHost(false);
              window.location.hash = "";
              sessionStorage.removeItem("game-session");
            }}
          />
        )}
      </div>
    </div>
  );
}
