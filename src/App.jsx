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

import { useState } from "react";
import { DEFAULT_NOMINALS, T } from './utils/constants.js';
import { LandingScreen } from './components/LandingScreen.jsx';
import { HostGameScreen } from './components/HostGameScreen.jsx';
import { PlayerGameScreen } from './components/PlayerGameScreen.jsx';
import { ResultsScreen } from './components/ResultsScreen.jsx';

// ─── NAV TABS & APP ───────────────────────────────────────────────────────────
const SCREENS = [
  { id: "landing",    label: "Bosh sahifa" },
  { id: "hostGame",   label: "Boshlovchi panel" },
  { id: "playerGame", label: `O${T}yinchi ekrani` },
  { id: "results",    label: "Natijalar" },
];

function genId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function App() {
  const [screen, setScreen]         = useState("landing");
  const [gameNominals, setGameNominals] = useState(DEFAULT_NOMINALS);
  const [gameSettings, setGameSettings] = useState({ timer: "7", selectedPreset: 0, falstart: false });
  const [gameTopics, setGameTopics]   = useState("");
  const [gameRounds, setGameRounds]   = useState("5");
  const [gameResult, setGameResult]   = useState(null);
  const [archiveId, setArchiveId]     = useState(null);

  const handleFinish = async (data) => {
    const id = genId();
    const record = { id, ...data };
    try {
      await window.storage.set(`results:${id}`, JSON.stringify(record), true);
    } catch(e) { console.warn("Storage save failed", e); }
    setArchiveId(id);
    setGameResult(record);
    setScreen("results");
  };

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

      <div style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {screen === "landing" && (
          <LandingScreen
            onHost={(cfg) => { setGameNominals(cfg.nominals || DEFAULT_NOMINALS); setGameSettings(cfg.settings || gameSettings); setGameTopics(cfg.topics || ""); setGameRounds(cfg.rounds || "5"); setScreen("hostGame"); }}
            onPlayer={() => setScreen("playerGame")}
          />
        )}
        {screen === "hostGame" && <HostGameScreen onFinish={handleFinish} nominals={gameNominals} initialSettings={gameSettings} initTopics={gameTopics} initRounds={gameRounds} />}
        {screen === "playerGame" && <PlayerGameScreen />}
        {screen === "results" && <ResultsScreen gameResult={gameResult} archiveId={archiveId} onRestart={() => setScreen("landing")} />}
      </div>
    </div>
  );
}
