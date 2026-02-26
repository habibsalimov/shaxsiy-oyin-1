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

import { useState, useEffect, useCallback, useRef } from "react";
import { NOMINAL_PRESETS, DEFAULT_NOMINALS, T } from './utils/constants.js';
import { getTotal, rebuildSnapshots, initScores } from './utils/scoring.js';
import { useTimer } from './hooks/useTimer.js';
import { useWindowWidth } from './hooks/useWindowWidth.js';
import { Btn, Badge, Card, Label, Input, Toggle, SectionToggle, TimerDisplay } from './components/ui/index.js';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MOCK_PLAYERS = [
  { socketId: "p1", name: "Alibek",  latency: 12 },
  { socketId: "p2", name: "Nodira",  latency: 34 },
  { socketId: "p3", name: "Jasur",   latency: 8  },
  { socketId: "p4", name: "Malika",  latency: 55 },
];
const MOCK_TOPICS = ["Tarix", "Geografiya", "Fan va texnologiya", "Musiqa", "Sport"];

// ─── GAME CODE GENERATOR ─────────────────────────────────────────────────────
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
function generateGameCode(existingCodes = new Set()) {
  for (let i = 0; i < 200; i++) {
    const code = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    if (!existingCodes.has(code)) return code;
  }
  for (let i = 0; i < 200; i++) {
    const num = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
    const l = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    const code = num + l;
    if (!existingCodes.has(code)) return code;
  }
  for (let i = 0; i < 200; i++) {
    const num = String(Math.floor(Math.random() * 100)).padStart(2, "0");
    const l1 = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    const l2 = LETTERS[Math.floor(Math.random() * LETTERS.length)];
    const code = num + l1 + l2;
    if (!existingCodes.has(code)) return code;
  }
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ─── SCOREBOARD ──────────────────────────────────────────────────────────────
function ScoreBoard({ scores, players, nominals: nominalsProp, currentNominal, isHost, onCellClick, allTopicScores, blockedPlayers: blockedProp }) {
  const nominals = nominalsProp || DEFAULT_NOMINALS;
  const sep = "1px solid #2a3a52";
  const blockedSet = blockedProp || new Set();

  const wrapRef = useRef(null);
  const [contW, setContW] = useState(400);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setContW(e.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const totalCols = nominals.length + 3;
  const nameW = Math.max(52, Math.floor(contW * 0.27));
  const colW  = Math.max(24, Math.floor((contW - nameW) / (totalCols - 1)));

  const hdrFs = colW < 30 ? 8  : colW < 38 ? 9  : 10;
  const numFs = colW < 30 ? 10 : colW < 38 ? 11 : 14;
  const nmFs  = nameW < 68 ? 10 : nameW < 88 ? 11 : 12;
  const pH    = colW < 30 ? 3  : colW < 38 ? 4  : 8;
  const pV    = colW < 30 ? 5  : colW < 38 ? 6  : 9;

  const thS = {
    padding: `${pV}px ${pH}px`, textAlign: "center",
    fontSize: hdrFs, fontWeight: 700, letterSpacing: "0.06em",
    textTransform: "uppercase", color: "#8899aa",
    borderBottom: "1px solid #1e2940", whiteSpace: "nowrap",
  };
  const tdS = {
    padding: `${pV}px ${pH}px`, textAlign: "center",
    borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.1s",
  };

  return (
    <div ref={wrapRef} style={{ overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: nameW }} />
          <col style={{ width: colW }} />
          {nominals.map(n => <col key={n} style={{ width: colW }} />)}
          <col style={{ width: colW }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...thS, textAlign: "left", borderRight: sep }}>
              {nameW < 68 ? "ISM" : `O\u2018yinchi`}
            </th>
            <th style={{ ...thS, color: "#f5c800", borderRight: sep }}>JAMI</th>
            {nominals.map(n => (
              <th key={n} style={{ ...thS, color: n === currentNominal ? "#f5c800" : "#8899aa" }}>{n}</th>
            ))}
            <th style={{ ...thS, color: "#f5c800", borderLeft: sep }}>TUR</th>
          </tr>
        </thead>
        <tbody>
          {players.map(p => {
            const turTotal = getTotal(scores, p.socketId, nominals);
            const grandTotal = (() => {
              if (!allTopicScores) return turTotal;
              const myIdx = allTopicScores.indexOf(scores);
              const isCurrentTopic = myIdx === allTopicScores.length - 1;
              if (isCurrentTopic) {
                return allTopicScores.reduce((sum, ts) => sum + getTotal(ts, p.socketId, nominals), 0);
              } else {
                return scores.__snapshot?.[p.socketId] ?? allTopicScores
                  .slice(0, myIdx + 1)
                  .reduce((sum, ts) => sum + getTotal(ts, p.socketId, nominals), 0);
              }
            })();
            const isBlocked = blockedSet.has(p.socketId);
            return (
              <tr key={p.socketId} style={{ opacity: isBlocked ? 0.45 : 1 }}>
                <td style={{ ...tdS, textAlign: "left", fontWeight: 600, fontSize: nmFs, borderRight: sep, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                  {isBlocked && <span style={{ fontSize: hdrFs, color: "#e63946", marginLeft: 4, fontStyle: "italic" }}>(bloklangan)</span>}
                  {!isBlocked && nameW >= 80 && p.latency > 0 && <span style={{ fontSize: hdrFs - 1, color: "#445566", marginLeft: 3 }}>{p.latency}ms</span>}
                </td>
                <td style={{ ...tdS, borderRight: sep }}>
                  <span style={{ fontFamily: "'Anton', sans-serif", fontSize: numFs, color: grandTotal >= 0 ? "#f5c800" : "#e63946" }}>
                    {grandTotal > 0 ? "+" : ""}{grandTotal}
                  </span>
                </td>
                {nominals.map(n => {
                  const r = scores[p.socketId]?.[n] || null;
                  const cs = r === "correct"
                    ? { background: "rgba(46,204,113,0.12)", color: "#2ecc71", fontWeight: 700 }
                    : r === "wrong"
                    ? { background: "rgba(230,57,70,0.12)", color: "#e63946", fontWeight: 700 }
                    : { color: "#445566" };
                  return (
                    <td key={n}
                      style={{ ...tdS, ...cs, fontSize: numFs, cursor: isHost ? "pointer" : "default" }}
                      onClick={() => isHost && onCellClick && onCellClick(p.socketId, n)}
                      title={isHost ? `Bosib o\u2018zgartirish` : ""}>
                      {r === "correct" ? `+${n}` : r === "wrong" ? `\u2212${n}` : "\xb7"}
                    </td>
                  );
                })}
                <td style={{ ...tdS, borderLeft: sep }}>
                  <span style={{ fontFamily: "'Anton', sans-serif", fontSize: numFs, color: turTotal >= 0 ? "#f5c800" : "#e63946" }}>
                    {turTotal > 0 ? "+" : ""}{turTotal}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── SOZLAMALAR PANEL ─────────────────────────────────────────────────────────
function SettingsPanel({ settings, onChange }) {
  const { timer, selectedPreset, falstart } = settings;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 10, animation: "fadeIn 0.2s ease both" }}>
      <div>
        <Label>Taymer (soniya)</Label>
        <Input
          value={timer}
          onChange={e => onChange({ ...settings, timer: e.target.value })}
          type="number"
          style={{ maxWidth: 160 }}
        />
      </div>

      <div>
        <Label>Ballar to{T}plami</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          {NOMINAL_PRESETS.map((preset, idx) => (
            <button key={idx}
              onClick={() => onChange({ ...settings, selectedPreset: idx })}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: selectedPreset === idx ? "rgba(245,200,0,0.1)" : "transparent",
                border: `1px solid ${selectedPreset === idx ? "#f5c800" : "#1e2940"}`,
                borderRadius: 4, padding: "8px 12px", cursor: "pointer",
                fontFamily: "inherit", textAlign: "left", transition: "all 0.12s",
              }}>
              <span style={{
                width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${selectedPreset === idx ? "#f5c800" : "#445566"}`,
                background: selectedPreset === idx ? "#f5c800" : "transparent",
                display: "inline-block",
              }} />
              <span style={{
                fontFamily: "'Anton', sans-serif", fontSize: 15,
                letterSpacing: "0.04em", color: selectedPreset === idx ? "#f5c800" : "#8899aa",
              }}>
                {preset.join(" / ")}
              </span>
              {idx === 0 && <span style={{ fontSize: 10, color: "#445566", marginLeft: 4 }}>standart</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{ borderTop: "1px solid #1e2940", paddingTop: 14 }}>
        <Toggle
          value={falstart}
          onChange={val => onChange({ ...settings, falstart: val })}
          label="Falstart"
          description={
            falstart
              ? `Yoniq — boshlovchi taymer tugmasini bosmagunicha bilimdon javob bera olmaydi.`
              : `O\u2018chiq (standart) — bilimdonlar savolning birinchi so\u2018zidan keyinoq javob berish tugmasini bosa oladi.`
          }
        />
      </div>
    </div>
  );
}

// ─── 1. LANDING ───────────────────────────────────────────────────────────────
function LandingScreen({ onHost, onPlayer }) {
  const [hostName, setHostName] = useState("");
  const [rounds, setRounds] = useState("5");
  const [topics, setTopics] = useState("");
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({ timer: "7", selectedPreset: 0, falstart: false });
  const [hostError, setHostError] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [gameCode, setGameCode] = useState("");
  const [playerError, setPlayerError] = useState("");

  const topicCount = topics.split("\n").filter(t => t.trim()).length;

  const handleHost = () => {
    if (!hostName.trim()) { setHostError("Ismingizni kiriting"); return; }
    setHostError("");
    onHost({
      name: hostName.trim(), rounds,
      topics, settings,
      nominals: NOMINAL_PRESETS[settings.selectedPreset],
    });
  };

  const handlePlayer = () => {
    if (!playerName.trim()) { setPlayerError("Ismingizni kiriting"); return; }
    if (gameCode.length < 4) { setPlayerError(`O${T}yin kodini kiriting`); return; }
    setPlayerError("");
    onPlayer({ name: playerName.trim(), code: gameCode });
  };

  const card = {
    background: "#111827", border: "1px solid #1e2940", borderRadius: 8,
    padding: "28px 24px", display: "flex", flexDirection: "column", flex: 1, minWidth: 280,
  };

  const settingsSummary = `— taymer: ${settings.timer}s · ${NOMINAL_PRESETS[settings.selectedPreset].join("/")} · falstart: ${settings.falstart ? "yoniq" : `o${T}chiq`}`;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", animation: "fadeIn 0.4s ease both" }}>
      <div style={{ textAlign: "center", padding: "40px 24px 28px" }}>
        <div style={{ marginBottom: 8 }}>
          <Badge color="yellow">Zakovat klubi bilimdonlari uchun</Badge>
        </div>
        <div style={{
          fontFamily: "'Anton', 'Arial Black', sans-serif",
          fontSize: "clamp(42px, 10vw, 80px)", lineHeight: 1.0,
          color: "#f5c800", letterSpacing: "0.06em",
          textShadow: "0 0 80px rgba(245,200,0,0.25)", marginBottom: 8,
        }}>
          {`SHAXSIY O${T}YIN`}
        </div>
        <p style={{ color: "#8899aa", fontSize: 14, letterSpacing: "0.04em" }}>
          Avtomatik hisob-kitob imkoni bilan platforma
        </p>
      </div>

      <div style={{
        flex: 1, display: "flex", alignItems: "stretch", justifyContent: "center",
        padding: "0 24px 40px", gap: 16,
        maxWidth: 880, margin: "0 auto", width: "100%",
        flexWrap: "wrap", boxSizing: "border-box",
      }}>
        <div style={card}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 22, letterSpacing: "0.08em", color: "#f0f4ff", marginBottom: 4 }}>
              {`O${T}YIN YARATISH`}
            </div>
            <div style={{ fontSize: 12, color: "#8899aa" }}>Sozlamalarni kiriting va o{T}yinni boshlang</div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <Label>Boshlovchi ismi <span style={{ color: "#e63946" }}>*</span></Label>
            <Input
              value={hostName}
              onChange={e => { setHostName(e.target.value); if (e.target.value.trim()) setHostError(""); }}
              placeholder="Ismingizni kiriting"
              style={hostError ? { borderColor: "#e63946" } : {}}
            />
            {hostError && <div style={{ fontSize: 11, color: "#e63946", marginTop: 5 }}>⚠ {hostError}</div>}
          </div>

          <div style={{ marginBottom: 12 }}>
            <Label>Raundlar soni</Label>
            <Input value={rounds} onChange={e => setRounds(e.target.value)} type="number" placeholder="0 = cheksiz" />
            <div style={{ fontSize: 10, color: "#8899aa", marginTop: 4 }}>0 = cheksiz o{T}yin</div>
          </div>

          <div style={{ borderTop: "1px solid #1e2940", marginBottom: 4 }}>
            <SectionToggle label="Sozlamalar" extra={settingsSummary} isOpen={settingsOpen} onToggle={() => setSettingsOpen(o => !o)} />
            {settingsOpen && <SettingsPanel settings={settings} onChange={setSettings} />}
          </div>

          <div style={{ borderTop: "1px solid #1e2940", marginBottom: 16 }}>
            <SectionToggle
              label="Mavzular"
              extra={topicCount > 0 ? `— ${topicCount} ta mavzu · ixtiyoriy` : "— ixtiyoriy"}
              isOpen={topicsOpen}
              onToggle={() => setTopicsOpen(o => !o)}
            />
            {topicsOpen && (
              <div style={{ animation: "fadeIn 0.2s ease both" }}>
                <textarea
                  value={topics}
                  onChange={e => setTopics(e.target.value)}
                  placeholder={`Tarix\nGeografiya\nFan va texnologiya\nMusiqa\nSport`}
                  style={{
                    background: "#1e2940", border: "2px solid #445566",
                    color: "#f0f4ff", fontFamily: "inherit", fontSize: 12,
                    borderRadius: 4, padding: "10px 12px", width: "100%",
                    minHeight: 100, resize: "vertical", outline: "none",
                    boxSizing: "border-box", marginTop: 6,
                  }}
                  onFocus={e => (e.target.style.borderColor = "#f5c800")}
                  onBlur={e => (e.target.style.borderColor = "#445566")}
                />
                <div style={{ fontSize: 10, color: "#8899aa", marginTop: 4 }}>Har qatorda bitta mavzu</div>
              </div>
            )}
          </div>

          <div style={{ flex: 1 }} />
          <Btn style={{ width: "100%" }} onClick={handleHost}>🚀 {`O${T}YINNI BOSHLASH`}</Btn>
        </div>

        <div style={card}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 22, letterSpacing: "0.08em", color: "#f0f4ff", marginBottom: 4 }}>
              {`O${T}YINGA QO${T}SHILISH`}
            </div>
            <div style={{ fontSize: 12, color: "#8899aa" }}>Ism va o{T}yin kodini kiriting</div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <Label>Ismingiz <span style={{ color: "#e63946" }}>*</span></Label>
            <Input
              value={playerName}
              onChange={e => { setPlayerName(e.target.value); if (e.target.value.trim()) setPlayerError(""); }}
              placeholder="Ismingizni kiriting"
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <Label>{`O${T}yin kodi`}</Label>
            <Input
              value={gameCode}
              onChange={e => setGameCode(e.target.value.replace(/[^0-9A-Z]/g, ""))}
              placeholder="0000"
              maxLength={6}
              style={{ fontSize: 36, fontFamily: "'Anton', sans-serif", letterSpacing: "0.3em", textAlign: "center" }}
            />
          </div>

          {playerError && <div style={{ fontSize: 11, color: "#e63946", marginBottom: 8 }}>⚠ {playerError}</div>}
          <div style={{ flex: 1 }} />
          <Btn variant="green" style={{ width: "100%" }} onClick={handlePlayer}>🎮 {`QO${T}SHILISH`}</Btn>
        </div>
      </div>

      <div style={{ textAlign: "center", paddingBottom: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#2ecc71", boxShadow: "0 0 6px #2ecc71", display: "inline-block" }} />
        <span style={{ fontSize: 11, color: "#8899aa" }}>Server bilan ulanildi</span>
      </div>
    </div>
  );
}

// ─── 2. HOST GAME SCREEN ─────────────────────────────────────────────────────
function HostGameScreen({ onFinish, nominals: nominalsProp, initialSettings, initTopics, initRounds }) {
  const nominals = nominalsProp || DEFAULT_NOMINALS;
  const timerSecDefault = parseInt((initialSettings || {}).timer) || 7;
  const initTopicCount  = parseInt(initRounds) || 5;

  const buildTopics = () => {
    const names = (initTopics || "").split("\n").map(s => s.trim()).filter(Boolean);
    return Array.from({ length: initTopicCount }, (_, i) => names[i] || `${i + 1}-mavzu`);
  };

  const [topicNames, setTopicNames]   = useState(buildTopics);
  const [editingTopic, setEditingTopic] = useState(null);
  const [editValue, setEditValue]     = useState("");
  const [settings, setSettings]       = useState(initialSettings || { timer: String(timerSecDefault), selectedPreset: 0, falstart: false });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied]           = useState(false);
  const [gamePhase, setGamePhase]     = useState("lobby");
  const [activeCell, setActiveCell]   = useState(null);
  const [cellData, setCellData]       = useState({});
  const [timerEnd, setTimerEnd]       = useState(null);
  const [buzzOrder, setBuzzOrder]     = useState([]);
  const [falstartBlocked, setFalstartBlocked] = useState(new Set());
  const [topicScores, setTopicScores] = useState(() => [initScores(MOCK_PLAYERS, nominals)]);
  const [currentTopicIdx, setCurrentTopicIdx] = useState(0);
  const [collapsedScores, setCollapsedScores] = useState(new Set());
  const [roomLocked, setRoomLocked]       = useState(false);
  const [blockedPlayers, setBlockedPlayers] = useState(new Set());
  const [playerList, setPlayerList]       = useState(MOCK_PLAYERS);
  const timerRef = useRef(null);

  const players   = playerList;
  const timerSec  = parseInt(settings.timer) || 7;
  const activeNominals = NOMINAL_PRESETS[settings.selectedPreset] || nominals;
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 640;

  const computeNextAllowed = (cd) => {
    for (let ti = 0; ti < topicNames.length; ti++) {
      for (let ni = 0; ni < activeNominals.length; ni++) {
        const key = `${ti}-${ni}`;
        const cell = cd[key] || { history: [] };
        const done = cell.history.some(h => h.result === "correct" || h.result === "no_answer" || h.result === "skipped");
        if (!done) return { ti, ni };
      }
    }
    return null;
  };
  const nextAllowed = computeNextAllowed(cellData);

  const isCellAllowed = (ti, ni) => {
    if (!nextAllowed) return false;
    if (ti < nextAllowed.ti) return true;
    if (ti === nextAllowed.ti && ni <= nextAllowed.ni) return true;
    return false;
  };

  const cellKey = (ti, ni) => `${ti}-${ni}`;
  const getCellData = (ti, ni) => cellData[cellKey(ti, ni)] || { locked: false, attachment: null, history: [], phase: "idle" };

  const updateCell = (ti, ni, patch) => {
    setCellData(prev => ({ ...prev, [cellKey(ti, ni)]: { ...getCellData(ti, ni), ...patch } }));
  };

  const [expandedTopics, setExpandedTopics] = useState(() => new Set([0]));
  const toggleTopic = (ti) => setExpandedTopics(prev => {
    const next = new Set(prev);
    if (next.has(ti)) next.delete(ti); else next.add(ti);
    return next;
  });

  const activateCell = (ti, ni) => {
    if (gamePhase === "lobby") setGamePhase("playing");
    clearTimeout(timerRef.current);
    setTimerEnd(null);
    setBuzzOrder([]);
    setFalstartBlocked(new Set());
    setActiveCell({ ti, ni });
    setExpandedTopics(prev => { const next = new Set(prev); next.add(ti); return next; });
  };

  const activateCellIfAllowed = (ti, ni) => {
    const key = `${ti}-${ni}`;
    const cell = cellData[key] || { history: [] };
    const done = cell.history.some(h => h.result === "correct" || h.result === "no_answer" || h.result === "skipped");
    if (done) { activateCell(ti, ni); return; }
    const na = computeNextAllowed(cellData);
    if (na && na.ti === ti && na.ni === ni) activateCell(ti, ni);
  };

  const activeCellRef = useRef(activeCell);
  activeCellRef.current = activeCell;

  const startTimer = () => {
    if (!activeCell) return;
    const ms = timerSec * 1000;
    setTimerEnd(Date.now() + ms);
    setBuzzOrder([]);
    setFalstartBlocked(new Set());
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setTimerEnd(null);
      const cur = activeCellRef.current;
      if (!cur) return;
      const { ti, ni } = cur;
      setCellData(prev => {
        const key = `${ti}-${ni}`;
        const existing = prev[key] || { locked: false, attachment: null, history: [], phase: "idle" };
        if (existing.history.some(h => h.result === "correct" || h.result === "no_answer")) return prev;
        return { ...prev, [key]: { ...existing, history: [...existing.history, { playerId: null, playerName: null, result: "no_answer", nominal: null, ts: Date.now() }] } };
      });
      setBuzzOrder([]);
      setFalstartBlocked(new Set());
      const nextNi = ni + 1;
      if (nextNi < activeNominals.length) {
        setActiveCell({ ti, ni: nextNi });
        setExpandedTopics(prev => { const next = new Set(prev); next.add(ti); return next; });
      } else if (ti + 1 < topicNames.length) {
        const nextTi = ti + 1;
        setTopicScores(prev => {
          const arr = [...prev];
          while (arr.length <= nextTi) arr.push(initScores(MOCK_PLAYERS, activeNominals));
          return rebuildSnapshots(arr, activeNominals);
        });
        setCurrentTopicIdx(nextTi);
        setCollapsedScores(prev => { const next = new Set(prev); if (nextTi >= 3) next.add(nextTi - 3); return next; });
        setActiveCell({ ti: nextTi, ni: 0 });
        setExpandedTopics(prev => { const next = new Set(prev); next.add(nextTi); return next; });
      }
    }, ms);
  };

  const resetBuzzers = () => {
    clearTimeout(timerRef.current);
    setTimerEnd(null);
    setBuzzOrder([]);
    setFalstartBlocked(new Set());
  };

  const simulateBuzz = () => {
    if (!timerEnd) return;
    clearTimeout(timerRef.current);
    setTimerEnd(null);
    const eligible = players.filter(p => !falstartBlocked.has(p.socketId) && !blockedPlayers.has(p.socketId));
    const shuffled = [...eligible].sort(() => Math.random() - 0.5).slice(0, Math.min(3, eligible.length));
    if (!shuffled.length) return;
    const base = Date.now();
    setBuzzOrder(shuffled.map((p, i) => ({ ...p, effectiveTime: base + i * (Math.floor(Math.random() * 180) + 15) })));
  };

  const judge = (result) => {
    if (!buzzOrder.length || !activeCell) return;
    const first = buzzOrder[0];
    const { ti, ni } = activeCell;
    const nom = activeNominals[ni];

    setTopicScores(prev => {
      const arr = [...prev];
      const cur = { ...(arr[ti] || {}) };
      cur[first.socketId] = { ...(cur[first.socketId] || {}), [nom]: result };
      arr[ti] = cur;
      return arr;
    });

    const currentHistory = getCellData(ti, ni).history;
    updateCell(ti, ni, { history: [...currentHistory, { playerId: first.socketId, playerName: first.name, result, nominal: nom, ts: Date.now() }] });

    if (result === "correct") {
      setBuzzOrder([]);
      resetBuzzers();
      const nextNi = ni + 1;
      if (nextNi < activeNominals.length) {
        activateCell(ti, nextNi);
      } else if (ti + 1 < topicNames.length) {
        const nextTi = ti + 1;
        setTopicScores(prev => {
          const arr = [...prev];
          while (arr.length <= nextTi) arr.push(initScores(MOCK_PLAYERS, activeNominals));
          return rebuildSnapshots(arr, activeNominals);
        });
        setCurrentTopicIdx(nextTi);
        setCollapsedScores(prev => { const next = new Set(prev); if (nextTi >= 3) next.add(nextTi - 3); return next; });
        activateCell(nextTi, 0);
      } else {
        setActiveCell(null);
      }
    } else {
      setBuzzOrder(buzzOrder.slice(1));
    }
  };

  const surgunPlayer = (sid) => {
    setPlayerList(prev => prev.filter(p => p.socketId !== sid));
    setBuzzOrder(prev => prev.filter(p => p.socketId !== sid));
    setBlockedPlayers(prev => { const next = new Set(prev); next.delete(sid); return next; });
  };

  const toggleBlock = (sid) => {
    setBlockedPlayers(prev => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid); else next.add(sid);
      return next;
    });
  };

  const copyCode = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const [attachMode, setAttachMode]   = useState(null);
  const [attachText, setAttachText]   = useState("");
  const [confirmReset, setConfirmReset] = useState(null);
  const [playersOpen, setPlayersOpen]   = useState(false);

  const handleAttachText = (ti, ni) => {
    if (!attachText.trim()) return;
    updateCell(ti, ni, { attachment: { type: "text", content: attachText.trim() } });
    setAttachMode(null);
    setAttachText("");
  };

  const handleAttachImage = (ti, ni, e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    updateCell(ti, ni, { attachment: { type: "image", url } });
    setAttachMode(null);
  };

  const settingsSummary = `— ${settings.timer}s \xb7 ${NOMINAL_PRESETS[settings.selectedPreset].join("/")} \xb7 falstart: ${settings.falstart ? "yoniq" : `o${T}chiq`}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Topbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", borderBottom: "1px solid #1e2940",
        background: "rgba(17,24,39,0.97)", backdropFilter: "blur(8px)",
        flexShrink: 0, zIndex: 90,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 20, letterSpacing: "0.1em", color: "#f5c800" }}>
            {`SHAXSIY O${T}YIN`}
          </span>
          <Badge color="yellow">BOSHLOVCHI</Badge>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Btn size="sm" variant={copied ? "success" : "ghost"} onClick={copyCode}>
            {copied ? "✓ Nusxalandi" : "🔗 Kod: 1337"}
          </Btn>
          <Btn size="sm" variant={roomLocked ? "danger" : "ghost"} onClick={() => setRoomLocked(v => !v)}>
            {roomLocked ? "🔒" : "🔓"}
          </Btn>
          <button onClick={() => setPlayersOpen(o => !o)} style={{
            background: playersOpen ? "rgba(245,200,0,0.15)" : "#1e2940",
            border: `1px solid ${playersOpen ? "#f5c800" : "#445566"}`,
            borderRadius: 4, padding: "7px 10px", cursor: "pointer",
            color: playersOpen ? "#f5c800" : "#8899aa", fontSize: 13, fontWeight: 700,
            fontFamily: "inherit", lineHeight: 1, transition: "all 0.15s",
          }}>👥</button>
          <button onClick={() => setSettingsOpen(o => !o)} style={{
            background: settingsOpen ? "rgba(245,200,0,0.15)" : "#1e2940",
            border: `1px solid ${settingsOpen ? "#f5c800" : "#445566"}`,
            borderRadius: 4, padding: "7px 10px", cursor: "pointer",
            color: settingsOpen ? "#f5c800" : "#8899aa", fontSize: 16, lineHeight: 1, transition: "all 0.15s",
          }}>⚙</button>
          <Btn size="sm" variant="danger" onClick={() => onFinish({
            topicScores, topicNames, players: playerList,
            nominals: activeNominals, date: new Date().toISOString(),
          })}>Tugatish</Btn>
        </div>
      </div>

      {settingsOpen && (
        <div style={{ background: "#111827", borderBottom: "1px solid #1e2940", padding: "16px 24px", animation: "fadeIn 0.15s ease both" }}>
          <div style={{ maxWidth: 520 }}>
            <SettingsPanel settings={settings} onChange={setSettings} />
          </div>
        </div>
      )}

      {playersOpen && (
        <div style={{ background: "#111827", borderBottom: "1px solid #1e2940", padding: "12px 24px", animation: "fadeIn 0.15s ease both" }}>
          <div style={{ maxWidth: 480 }}>
            <div style={{ fontSize: 10, color: "#8899aa", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8, textTransform: "uppercase" }}>
              O'yinchilar boshqaruvi
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {players.map(p => (
                <div key={p.socketId} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "#1e2940", borderRadius: 6, padding: "7px 10px",
                  opacity: blockedPlayers.has(p.socketId) ? 0.55 : 1,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                    background: blockedPlayers.has(p.socketId) ? "#e63946" : "#2ecc71" }} />
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{p.name}</span>
                  {blockedPlayers.has(p.socketId) && <span style={{ fontSize: 10, color: "#e63946", fontWeight: 700 }}>BLOKLANGAN</span>}
                  <button onClick={() => toggleBlock(p.socketId)} style={{
                    background: blockedPlayers.has(p.socketId) ? "rgba(245,200,0,0.15)" : "transparent",
                    border: `1px solid ${blockedPlayers.has(p.socketId) ? "#f5c800" : "#2a3a52"}`,
                    borderRadius: 4, padding: "3px 8px", cursor: "pointer",
                    color: blockedPlayers.has(p.socketId) ? "#f5c800" : "#445566",
                    fontSize: 10, fontFamily: "inherit", fontWeight: 700,
                  }}>{blockedPlayers.has(p.socketId) ? "BLOKDAN CHIQAR" : "BLOKLASH"}</button>
                  <button onClick={() => surgunPlayer(p.socketId)} style={{
                    background: "transparent", border: "1px solid rgba(230,57,70,0.4)",
                    borderRadius: 4, padding: "3px 8px", cursor: "pointer",
                    color: "#e63946", fontSize: 10, fontFamily: "inherit", fontWeight: 700,
                  }}>SURGUN</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Lobby */}
      {gamePhase === "lobby" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Card style={{ textAlign: "center", maxWidth: 400, width: "100%" }}>
            <div style={{ marginBottom: 16 }}>
              <Label>{`O${T}YIN KODI`}</Label>
              <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 52, letterSpacing: "0.24em", color: "#f5c800", cursor: "pointer" }} onClick={copyCode}>
                1337
              </div>
              <div style={{ fontSize: 11, color: "#8899aa", marginTop: 6 }}>Bosib nusxalash</div>
            </div>
            <Label>ULANGANLAR</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
              {players.map(p => (
                <div key={p.socketId} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "#1e2940", borderRadius: 8, padding: "7px 10px",
                  opacity: blockedPlayers.has(p.socketId) ? 0.5 : 1,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                    background: blockedPlayers.has(p.socketId) ? "#e63946" : "#2ecc71" }} />
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1, textAlign: "left" }}>{p.name}</span>
                  <button onClick={() => toggleBlock(p.socketId)} style={{
                    background: blockedPlayers.has(p.socketId) ? "rgba(245,200,0,0.15)" : "transparent",
                    border: `1px solid ${blockedPlayers.has(p.socketId) ? "#f5c800" : "#2a3a52"}`,
                    borderRadius: 4, padding: "3px 7px", cursor: "pointer",
                    color: blockedPlayers.has(p.socketId) ? "#f5c800" : "#445566",
                    fontSize: 11, fontFamily: "inherit", fontWeight: 700,
                  }}>{blockedPlayers.has(p.socketId) ? "BLOK ✓" : "BLOK"}</button>
                  <button onClick={() => surgunPlayer(p.socketId)} style={{
                    background: "transparent", border: "1px solid #2a3a52",
                    borderRadius: 4, padding: "3px 7px", cursor: "pointer",
                    color: "#e63946", fontSize: 11, fontFamily: "inherit", fontWeight: 700,
                  }}>SURGUN</button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Btn style={{ width: "100%" }} onClick={() => setGamePhase("playing")}>
                {`🚀 O${T}YINNI BOSHLASH`}
              </Btn>
              <Btn variant={roomLocked ? "danger" : "ghost"} size="sm" style={{ width: "100%" }} onClick={() => setRoomLocked(v => !v)}>
                {roomLocked ? "🔒 Xona qulflangan — ochish" : "🔓 Xonani qulflash"}
              </Btn>
            </div>
          </Card>
        </div>
      )}

      {/* Main game layout */}
      {gamePhase !== "lobby" && (
        <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: isMobile ? "auto" : "hidden", minHeight: 0 }}>

          {/* LEFT: Topic/Question tree */}
          <div style={isMobile ? { width: "100%", borderBottom: "1px solid #1e2940", overflowY: "visible" }
            : { width: 320, flexShrink: 0, borderRight: "1px solid #1e2940", overflowY: "auto", minHeight: 0 }}>
            {topicNames.map((topicName, ti) => {
              const isTopicActive = activeCell && activeCell.ti === ti;
              return (
                <div key={ti} style={{ marginBottom: 2 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "9px 14px",
                    borderLeft: isTopicActive ? "3px solid #f5c800" : "3px solid transparent",
                    background: isTopicActive ? "rgba(245,200,0,0.12)" : expandedTopics.has(ti) ? "#161f30" : "#0f1726",
                    borderBottom: "1px solid #1e2940", cursor: "pointer", userSelect: "none",
                  }} onClick={() => toggleTopic(ti)}>
                    <span style={{ fontSize: 11, color: "#445566", flexShrink: 0, transition: "transform 0.2s", display: "inline-block", transform: expandedTopics.has(ti) ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                    {editingTopic === ti ? (
                      <input autoFocus value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => {
                          if (e.key === "Enter") { const next = [...topicNames]; next[ti] = editValue.trim() || `${ti + 1}-mavzu`; setTopicNames(next); setEditingTopic(null); }
                          if (e.key === "Escape") setEditingTopic(null);
                        }}
                        onBlur={() => { const next = [...topicNames]; next[ti] = editValue.trim() || `${ti + 1}-mavzu`; setTopicNames(next); setEditingTopic(null); }}
                        style={{ background: "#1e2940", border: "1px solid #f5c800", color: "#f0f4ff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, borderRadius: 3, padding: "4px 8px", outline: "none", flex: 1 }}
                      />
                    ) : (
                      <span onClick={e => { e.stopPropagation(); setEditingTopic(ti); setEditValue(topicName); }}
                        style={{ fontFamily: "'Anton', sans-serif", fontSize: 14, letterSpacing: "0.04em", color: isTopicActive ? "#f5c800" : "#f0f4ff", flex: 1 }}>
                        {ti + 1}. {topicName}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: "#445566", flexShrink: 0 }}>{activeNominals.length} savol</span>
                  </div>

                  {expandedTopics.has(ti) && activeNominals.map((nom, ni) => {
                    const cd = getCellData(ti, ni);
                    const isActive = activeCell && activeCell.ti === ti && activeCell.ni === ni;
                    const hasCorrect  = cd.history.some(h => h.result === "correct");
                    const hasNoAnswer = cd.history.some(h => h.result === "no_answer" || h.result === "skipped");
                    const isDone = hasCorrect || hasNoAnswer;
                    const lastResult = cd.history[cd.history.length - 1];

                    return (
                      <div key={ni}>
                        <div onClick={() => activateCellIfAllowed(ti, ni)} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "9px 16px 9px 28px",
                          cursor: isCellAllowed(ti, ni) ? "pointer" : "default",
                          background: isActive ? "rgba(245,200,0,0.08)" : "transparent",
                          borderLeft: isActive ? "3px solid #f5c800" : "3px solid transparent",
                          transition: "background 0.1s",
                          opacity: !isDone && !isCellAllowed(ti, ni) ? 0.35 : 1,
                        }}
                          onMouseEnter={e => { if (!isActive && isCellAllowed(ti, ni)) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                          <span style={{ fontSize: 13, minWidth: 16, color: isDone ? (lastResult?.result === "correct" ? "#2ecc71" : "#445566") : "#445566" }}>
                            {isDone ? (lastResult?.result === "correct" ? "✓" : "⏭") : (isActive ? "▶" : "▶")}
                          </span>
                          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 16, color: isActive ? "#f5c800" : isDone ? "#8899aa" : "#f0f4ff", minWidth: 36 }}>{nom}</span>
                          <span style={{ fontSize: 11, color: "#445566", flex: 1, fontStyle: "italic" }}>{topicName}</span>
                          {cd.attachment && <span style={{ fontSize: 12 }}>{cd.attachment.type === "image" ? "🖼️" : "📝"}</span>}
                          {cd.locked && <span style={{ fontSize: 12 }}>🔒</span>}
                          {isDone && (
                            <button onClick={e => { e.stopPropagation(); activateCellIfAllowed(ti, ni); }} style={{
                              background: "#1e2940", border: "none", borderRadius: 3, padding: "3px 8px",
                              fontSize: 10, color: "#8899aa", cursor: "pointer", fontFamily: "inherit",
                            }}>TARIX</button>
                          )}
                        </div>

                        {isActive && (
                          <div style={{ margin: "0 8px 8px", borderRadius: 6, background: "#111827", border: "1px solid #2a3a52", padding: "12px 14px", animation: "fadeIn 0.15s ease both" }}>
                            {isDone ? (
                              <>
                                <div style={{ marginBottom: 12 }}>
                                  <div style={{ fontSize: 10, color: "#8899aa", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8, textTransform: "uppercase" }}>Savol tarixi</div>
                                  {cd.history.map((h, idx) => (
                                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 13 }}>
                                      {(h.result === "no_answer" || h.result === "skipped") ? (
                                        <span style={{ color: "#445566", fontStyle: "italic", fontSize: 12 }}>
                                          {h.result === "no_answer" ? "⏱ Hech kim javob bermadi" : "⏭ O'tkazib yuborildi"}
                                        </span>
                                      ) : (
                                        <>
                                          <span style={{ color: h.result === "correct" ? "#2ecc71" : "#e63946", fontSize: 15, minWidth: 16 }}>{h.result === "correct" ? "✓" : "✗"}</span>
                                          <span style={{ flex: 1, fontWeight: 600 }}>{h.playerName}</span>
                                          <span style={{ color: h.result === "correct" ? "#2ecc71" : "#e63946", fontFamily: "'Anton', sans-serif", fontSize: 15 }}>
                                            {h.result === "correct" ? "+" : "−"}{h.nominal}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                {confirmReset && confirmReset.ti === ti && confirmReset.ni === ni ? (
                                  <div style={{ background: "rgba(230,57,70,0.08)", border: "1px solid rgba(230,57,70,0.4)", borderRadius: 4, padding: "12px 14px" }}>
                                    <div style={{ fontSize: 12, color: "#f0f4ff", marginBottom: 10, lineHeight: 1.5 }}>
                                      Ushbu savoldagi barcha natijalar bekor qilinadi. Davom etasizmi?
                                    </div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                      <button onClick={() => {
                                        setConfirmReset(null);
                                        const key = cellKey(ti, ni);
                                        setCellData(prevCd => {
                                          const fresh = prevCd[key] || { locked: false, attachment: null, history: [], phase: "idle" };
                                          setTopicScores(prevTs => {
                                            const arr = [...prevTs];
                                            const copy = { ...(arr[ti] || {}) };
                                            fresh.history.forEach(h => { if (h.playerId && h.nominal) copy[h.playerId] = { ...(copy[h.playerId] || {}), [h.nominal]: null }; });
                                            arr[ti] = copy;
                                            return rebuildSnapshots(arr, activeNominals);
                                          });
                                          return { ...prevCd, [key]: { ...fresh, history: [], locked: false } };
                                        });
                                        resetBuzzers();
                                        setActiveCell({ ti, ni });
                                      }} style={{ flex: 1, background: "#e63946", border: "none", borderRadius: 4, padding: "8px", cursor: "pointer", fontFamily: "inherit", color: "#fff", fontSize: 12, fontWeight: 700 }}>
                                        Ha, bekor qilish
                                      </button>
                                      <button onClick={() => setConfirmReset(null)} style={{ flex: 1, background: "#1e2940", border: "1px solid #445566", borderRadius: 4, padding: "8px", cursor: "pointer", fontFamily: "inherit", color: "#8899aa", fontSize: 12, fontWeight: 700 }}>
                                        Bekor
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button onClick={() => setConfirmReset({ ti, ni })} style={{
                                    width: "100%", background: "rgba(230,57,70,0.08)", border: "1px solid rgba(230,57,70,0.3)",
                                    borderRadius: 4, padding: "9px 14px", cursor: "pointer", fontFamily: "inherit",
                                    color: "#e63946", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                                  }}>↺ Natijalarni bekor qilish</button>
                                )}
                              </>
                            ) : (
                              <>
                                {cd.attachment && (
                                  <div style={{ marginBottom: 10, position: "relative" }}>
                                    {cd.attachment.type === "text"
                                      ? <div style={{ background: "#1e2940", borderRadius: 4, padding: "10px 12px", fontSize: 13, color: "#f0f4ff", lineHeight: 1.5 }}>{cd.attachment.content}</div>
                                      : <img src={cd.attachment.url} alt="" style={{ maxWidth: "100%", borderRadius: 4, maxHeight: 120, objectFit: "cover" }} />
                                    }
                                    <button onClick={() => updateCell(ti, ni, { attachment: null })} style={{ position: "absolute", top: 4, right: 4, background: "#e63946", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: 11, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                                  </div>
                                )}

                                {attachMode && attachMode.ti === ti && attachMode.ni === ni && attachMode.type === "text" && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <input autoFocus value={attachText} onChange={e => setAttachText(e.target.value)}
                                        onKeyDown={e => e.key === "Enter" && handleAttachText(ti, ni)}
                                        placeholder="Matn kiriting va Enter bosing..."
                                        style={{ flex: 1, background: "#1e2940", border: "1px solid #f5c800", color: "#f0f4ff", borderRadius: 4, padding: "8px 10px", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                                      />
                                      <button onClick={() => handleAttachText(ti, ni)} style={{ background: "#f5c800", border: "none", borderRadius: 4, padding: "0 12px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>✓</button>
                                      <button onClick={() => setAttachMode(null)} style={{ background: "#1e2940", border: "none", borderRadius: 4, padding: "0 10px", cursor: "pointer", color: "#8899aa" }}>✕</button>
                                    </div>
                                  </div>
                                )}

                                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                                  <button onClick={() => { setAttachMode({ ti, ni, type: "text" }); setAttachText(""); }} style={{ background: "#1e2940", border: "1px solid #2a3a52", borderRadius: 4, padding: "6px 10px", cursor: "pointer", color: "#8899aa", fontSize: 14 }}>📝</button>
                                  <label style={{ background: "#1e2940", border: "1px solid #2a3a52", borderRadius: 4, padding: "6px 10px", cursor: "pointer", color: "#8899aa", fontSize: 14 }}>
                                    🖼️<input type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleAttachImage(ti, ni, e)} />
                                  </label>
                                  <button onClick={() => updateCell(ti, ni, { locked: !cd.locked })} style={{
                                    background: cd.locked ? "rgba(243,156,18,0.15)" : "#1e2940",
                                    border: `1px solid ${cd.locked ? "#f39c12" : "#2a3a52"}`,
                                    borderRadius: 4, padding: "6px 12px", cursor: "pointer",
                                    color: cd.locked ? "#f39c12" : "#8899aa", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                                  }}>{cd.locked ? "🔒 Bloklangan" : "🔓 Qulf"}</button>
                                  <div style={{ flex: 1 }} />
                                  {settings.falstart && (
                                    <button onClick={() => { const rnd = players[Math.floor(Math.random() * players.length)]; setFalstartBlocked(prev => new Set([...prev, rnd.socketId])); }}
                                      style={{ background: "rgba(243,156,18,0.1)", border: "1px solid #f39c12", borderRadius: 4, padding: "6px 10px", cursor: "pointer", color: "#f39c12", fontSize: 12, fontFamily: "inherit" }}>
                                      ⚡ Falstart
                                    </button>
                                  )}
                                </div>

                                {!timerEnd ? (
                                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                                    <Btn style={{ flex: 1 }} size="sm" onClick={startTimer} disabled={cd.locked}>▶ Taymerni boshlash</Btn>
                                    <Btn variant="ghost" size="sm" onClick={resetBuzzers}>↺</Btn>
                                  </div>
                                ) : (
                                  <div style={{ marginBottom: 8 }}>
                                    <TimerDisplay timerEnd={timerEnd} timerSec={timerSec} />
                                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                                      <Btn variant="ghost" size="sm" style={{ flex: 1 }} onClick={simulateBuzz}>Buzz simulatsiya</Btn>
                                      <Btn variant="ghost" size="sm" onClick={resetBuzzers}>↺ Reset</Btn>
                                    </div>
                                  </div>
                                )}

                                {buzzOrder.length > 0 && (
                                  <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 10, color: "#8899aa", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase" }}>Javob tartibi</div>
                                    {buzzOrder.map((b, i) => (
                                      <div key={b.socketId} style={{
                                        display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 4, marginBottom: 4,
                                        background: i === 0 ? "rgba(46,204,113,0.12)" : "rgba(255,255,255,0.03)",
                                        border: i === 0 ? "1px solid #2ecc71" : "1px solid transparent",
                                      }}>
                                        <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 16, color: i === 0 ? "#2ecc71" : "#8899aa", minWidth: 18 }}>{i + 1}</span>
                                        <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{b.name}</span>
                                        {i > 0 && <span style={{ fontSize: 10, color: "#8899aa" }}>+{b.effectiveTime - buzzOrder[0].effectiveTime}ms</span>}
                                        {i === 0 && (
                                          <div style={{ display: "flex", gap: 4 }}>
                                            <button onClick={() => judge("correct")} style={{ background: "#2ecc71", border: "none", borderRadius: 3, padding: "4px 10px", cursor: "pointer", fontWeight: 700, color: "#0a0e1a", fontSize: 11, fontFamily: "inherit" }}>✓ {`TO${T}G${T}RI`}</button>
                                            <button onClick={() => judge("wrong")} style={{ background: "#e63946", border: "none", borderRadius: 3, padding: "4px 10px", cursor: "pointer", fontWeight: 700, color: "#fff", fontSize: 11, fontFamily: "inherit" }}>✗ {`NOTO${T}G${T}RI`}</button>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {settings.falstart && falstartBlocked.size > 0 && (
                                  <div style={{ marginBottom: 8, padding: "6px 10px", background: "rgba(243,156,18,0.06)", borderRadius: 4, border: "1px solid rgba(243,156,18,0.2)" }}>
                                    <div style={{ fontSize: 10, color: "#f39c12", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>FALSTART</div>
                                    {[...falstartBlocked].map(sid => { const p = players.find(pl => pl.socketId === sid); return p ? <div key={sid} style={{ fontSize: 12, color: "#f39c12" }}>⚡ {p.name}</div> : null; })}
                                  </div>
                                )}

                                <div style={{ marginTop: 8 }}>
                                  <Btn variant="success" size="sm" style={{ width: "100%" }} onClick={() => {
                                    setCellData(prev => {
                                      const key = cellKey(ti, ni);
                                      const existing = prev[key] || { locked: false, attachment: null, history: [], phase: "idle" };
                                      const alreadyDone = existing.history.some(h => h.result === "correct" || h.result === "no_answer" || h.result === "skipped");
                                      if (alreadyDone) return prev;
                                      return { ...prev, [key]: { ...existing, history: [...existing.history, { playerId: null, playerName: null, result: "skipped", nominal: null, ts: Date.now() }] } };
                                    });
                                    resetBuzzers();
                                    const nextNi = ni + 1;
                                    if (nextNi < activeNominals.length) {
                                      activateCell(ti, nextNi);
                                    } else if (ti + 1 < topicNames.length) {
                                      const nextTi = ti + 1;
                                      setTopicScores(prev => {
                                        const arr = [...prev];
                                        while (arr.length <= nextTi) arr.push(initScores(MOCK_PLAYERS, activeNominals));
                                        return rebuildSnapshots(arr, activeNominals);
                                      });
                                      setCurrentTopicIdx(nextTi);
                                      setCollapsedScores(prev => { const next = new Set(prev); if (nextTi >= 3) next.add(nextTi - 3); return next; });
                                      activateCell(nextTi, 0);
                                    }
                                  }}>Keyingi savol →</Btn>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <div style={{ padding: "10px 12px 16px" }}>
              <button onClick={() => setTopicNames(prev => [...prev, `${prev.length + 1}-mavzu`])} style={{
                width: "100%", background: "transparent", border: "1px dashed #2a3a52", borderRadius: 4,
                padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", color: "#445566",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", transition: "all 0.15s",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#f5c800"; e.currentTarget.style.color = "#f5c800"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a3a52"; e.currentTarget.style.color = "#445566"; }}
              >+ Mavzu qo{T}shish</button>
            </div>
          </div>

          {/* RIGHT: per-topic scoreboards */}
          <div style={{ flex: 1, overflowY: isMobile ? "visible" : "auto", minHeight: 0, padding: "12px 16px" }}>
            {activeCell && (
              <div style={{ marginBottom: 12, padding: "8px 14px", background: "rgba(245,200,0,0.06)", borderRadius: 6, border: "1px solid rgba(245,200,0,0.15)", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#8899aa" }}>Faol savol:</span>
                <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 15, color: "#f5c800" }}>
                  {activeNominals[activeCell.ni]} — {topicNames[activeCell.ti]}
                </span>
              </div>
            )}

            {topicScores.slice().reverse().map((tScores, revIdx) => {
              const scorePanelTi = topicScores.length - 1 - revIdx;
              const isCurrentTopic = scorePanelTi === currentTopicIdx;
              const isCollapsed = collapsedScores.has(scorePanelTi);
              const activeNomForPanel = isCurrentTopic && activeCell ? activeNominals[activeCell.ni] : null;

              return (
                <div key={scorePanelTi} style={{ marginBottom: 12, border: `1px solid ${isCurrentTopic ? "rgba(245,200,0,0.3)" : "#1e2940"}`, borderRadius: 6, overflow: "hidden" }}>
                  <div onClick={() => setCollapsedScores(prev => { const next = new Set(prev); if (next.has(scorePanelTi)) next.delete(scorePanelTi); else next.add(scorePanelTi); return next; })}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", userSelect: "none", background: isCurrentTopic ? "rgba(245,200,0,0.08)" : "#0f1726", borderBottom: isCollapsed ? "none" : "1px solid #1e2940" }}>
                    <span style={{ fontSize: 11, color: "#445566", display: "inline-block", transition: "transform 0.2s", transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)" }}>▶</span>
                    <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 13, letterSpacing: "0.06em", color: isCurrentTopic ? "#f5c800" : "#8899aa", flex: 1 }}>
                      {scorePanelTi + 1}. {topicNames[scorePanelTi] || `${scorePanelTi + 1}-mavzu`}
                    </span>
                    {isCurrentTopic ? <Badge color="yellow">FAOL</Badge> : <span style={{ fontSize: 10, color: "#445566" }}>tugadi</span>}
                  </div>
                  {!isCollapsed && (
                    <ScoreBoard
                      scores={tScores} players={players} nominals={activeNominals}
                      currentNominal={activeNomForPanel} isHost={true} allTopicScores={topicScores}
                      blockedPlayers={blockedPlayers}
                      onCellClick={(sid, n) => {
                        const player = players.find(p => p.socketId === sid);
                        setTopicScores(prev => {
                          const arr = [...prev];
                          const cur = arr[scorePanelTi]?.[sid]?.[n] || null;
                          const nextResult = { null: "correct", correct: "wrong", wrong: null }[cur];
                          const copy = { ...(arr[scorePanelTi] || {}) };
                          copy[sid] = { ...(copy[sid] || {}), [n]: nextResult };
                          arr[scorePanelTi] = copy;
                          const nomIdx = activeNominals.indexOf(n);
                          if (nomIdx !== -1) {
                            const hKey = `${scorePanelTi}-${nomIdx}`;
                            setCellData(prevCd => {
                              const existing = prevCd[hKey] || { locked: false, attachment: null, history: [], phase: "idle" };
                              return { ...prevCd, [hKey]: { ...existing, history: [...existing.history, { playerId: sid, playerName: player?.name || sid, result: nextResult || "removed", nominal: n, ts: Date.now(), manual: true }] } };
                            });
                          }
                          return rebuildSnapshots(arr, activeNominals);
                        });
                      }}
                    />
                  )}
                </div>
              );
            })}
            <div style={{ fontSize: 11, color: "#445566", marginTop: 4 }}>💡 {`Katakchani bosib natijani o${T}zgartirish mumkin`}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 3. PLAYER SCREEN ─────────────────────────────────────────────────────────
function PlayerGameScreen() {
  const [buzzed, setBuzzed] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [phase, setPhase] = useState("waiting");
  const [buzzOrder, setBuzzOrder] = useState([]);
  const [timerEnd, setTimerEnd] = useState(null);
  const [expandedDetail, setExpandedDetail] = useState(new Set());

  const myId = "p2";
  const myPlayer = MOCK_PLAYERS.find(p => p.socketId === myId);
  const nominals = DEFAULT_NOMINALS;

  const topicScoresMock = [
    { p1:{10:"correct",20:"wrong",  30:null,40:null,50:null}, p2:{10:"wrong",  20:"correct",30:null,40:null,50:null}, p3:{10:null,     20:"correct",30:null,40:null,50:null}, p4:{10:"correct",20:null,    30:null,40:null,50:null} },
    { p1:{10:null,     20:"correct",30:null,40:null,50:null}, p2:{10:"correct",20:null,     30:null,40:null,50:null}, p3:{10:null,     20:null,     30:null,40:null,50:null}, p4:{10:null,     20:"wrong", 30:null,40:null,50:null} },
  ];
  const topicNamesMock = ["1-mavzu", "Geografiya"];
  const currentTopicIdxMock = 1;
  const currentNominalIdxMock = 0;
  const currentTopicName = topicNamesMock[currentTopicIdxMock] || `${currentTopicIdxMock + 1}-mavzu`;
  const currentNominal   = nominals[currentNominalIdxMock];
  const isGenericName = /^\d+-mavzu$/.test(currentTopicName);

  const grandTotals = MOCK_PLAYERS.map(p => ({
    ...p, total: topicScoresMock.reduce((sum, ts) => sum + getTotal(ts, p.socketId, nominals), 0),
  })).sort((a, b) => b.total - a.total);

  const myTotal = grandTotals.find(p => p.socketId === myId)?.total ?? 0;
  const myRank  = grandTotals.findIndex(p => p.socketId === myId) + 1;

  useEffect(() => {
    const t1 = setTimeout(() => { setTimerEnd(Date.now() + 30000); setPhase("active"); }, 1500);
    return () => clearTimeout(t1);
  }, []);

  const handleBuzz = useCallback(() => {
    if (phase !== "active" || buzzed) return;
    setBuzzed(true);
    const myBuzz = { socketId: myId, name: myPlayer.name, effectiveTime: Date.now() };
    const competitor = { socketId: "p1", name: "Alibek", effectiveTime: Date.now() - 45 };
    const order = [competitor, myBuzz].sort((a, b) => a.effectiveTime - b.effectiveTime);
    setBuzzOrder(order);
    setPhase("buzzed");
  }, [phase, buzzed, myPlayer]);

  useEffect(() => {
    const handler = (e) => {
      if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        handleBuzz();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleBuzz]);

  const myPosition = buzzOrder.findIndex(b => b.socketId === myId);
  const iAmFirst   = myPosition === 0;

  const toggleDetail = (ti) => setExpandedDetail(prev => {
    const next = new Set(prev);
    if (next.has(ti)) next.delete(ti); else next.add(ti);
    return next;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid #1e2940", background: "rgba(17,24,39,0.97)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 20, letterSpacing: "0.1em", color: "#f5c800" }}>{`SHAXSIY O'YIN`}</span>
          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 12, color: "#8899aa" }}>1337</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 13, color: myTotal >= 0 ? "#f5c800" : "#e63946" }}>{myTotal > 0 ? "+" : ""}{myTotal}</span>
          <span style={{ fontSize: 10, color: "#445566" }}>#{myRank}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#1e2940", borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>{myPlayer.name}</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <Badge color="gray">{`${currentTopicIdxMock + 1}-MAVZU · ${currentNominal} BALL`}</Badge>
          {!isGenericName && <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 26, letterSpacing: "0.04em", margin: "8px 0 0" }}>{currentTopicName}</div>}
        </div>

        {phase === "active" && (
          <div style={{ maxWidth: 260, margin: "0 auto 12px", width: "100%" }}>
            <TimerDisplay timerEnd={timerEnd} timerSec={30} />
          </div>
        )}

        {phase === "buzzed" && iAmFirst && (
          <div style={{ background: "rgba(46,204,113,0.2)", border: "2px solid #2ecc71", borderRadius: 4, padding: 14, textAlign: "center", animation: "pulse 0.8s ease infinite alternate", marginBottom: 12 }}>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 26, color: "#2ecc71" }}>🎤 JAVOB BERING!</div>
          </div>
        )}
        {phase === "buzzed" && !iAmFirst && myPosition >= 0 && (
          <div style={{ background: "rgba(245,200,0,0.08)", border: "1px solid #c9a200", borderRadius: 4, padding: 10, textAlign: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "#f5c800" }}>Siz {myPosition + 1}-o'rindasiz · +{Math.abs(buzzOrder[myPosition].effectiveTime - buzzOrder[0].effectiveTime)}ms</span>
          </div>
        )}
        {phase === "waiting" && <div style={{ textAlign: "center", color: "#8899aa", fontSize: 13, marginBottom: 12 }}>⏳ Boshlovchi savolni tayyorlamoqda...</div>}

        <div style={{ display: "flex", justifyContent: "center", padding: "4px 0", marginBottom: 14 }}>
          <div style={{ textAlign: "center" }}>
            <button
              onMouseDown={() => setPressing(true)}
              onMouseUp={() => { setPressing(false); handleBuzz(); }}
              onTouchStart={(e) => { e.preventDefault(); setPressing(true); }}
              onTouchEnd={(e) => { e.preventDefault(); setPressing(false); handleBuzz(); }}
              disabled={phase !== "active" || buzzed}
              style={{
                width: 170, height: 170, borderRadius: "50%",
                border: `5px solid ${phase === "buzzed" && iAmFirst ? "#2ecc71" : buzzed ? "#445566" : "#f5c800"}`,
                background: phase === "buzzed" && iAmFirst ? "#2ecc71" : pressing ? "#f5c800" : "#1e2940",
                color: (pressing || (phase === "buzzed" && iAmFirst)) ? "#0a0e1a" : buzzed ? "#445566" : "#f5c800",
                fontFamily: "'Anton', sans-serif", fontSize: 30, letterSpacing: "0.08em",
                cursor: phase === "active" && !buzzed ? "pointer" : "default",
                transition: "all 0.1s", transform: pressing ? "scale(0.92)" : "scale(1)",
                boxShadow: phase === "active" && !buzzed ? "0 0 40px rgba(245,200,0,0.15)" : phase === "buzzed" && iAmFirst ? "0 0 50px rgba(46,204,113,0.5)" : "none",
                userSelect: "none",
              }}>
              {phase === "buzzed" && iAmFirst ? "🎤" : buzzed ? "✓" : "JAVOB"}
            </button>
            <div style={{ marginTop: 10, fontSize: 11, color: "#8899aa" }}>
              {phase === "active" && !buzzed ? "Bosing yoki SPACE" : buzzed ? "Siz bosdingiz!" : "Kutilmoqda..."}
            </div>
          </div>
        </div>

        {buzzOrder.length > 0 && (
          <div style={{ maxWidth: 340, margin: "0 auto 14px", width: "100%" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#8899aa", marginBottom: 6, textTransform: "uppercase" }}>Javob tartibi</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {buzzOrder.map((b, i) => (
                <li key={b.socketId} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 4, marginBottom: 5,
                  background: i === 0 ? "rgba(230,57,70,0.18)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${b.socketId === myId ? "#f5c800" : i === 0 ? "#e63946" : "transparent"}`,
                  fontWeight: 600,
                }}>
                  <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 16, color: i === 0 ? "#e63946" : "#8899aa", minWidth: 20 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{b.name}{b.socketId === myId && <span style={{ fontSize: 10, color: "#8899aa", marginLeft: 5 }}>(Siz)</span>}</span>
                  {i > 0 && <span style={{ fontSize: 10, color: "#8899aa" }}>+{Math.abs(b.effectiveTime - buzzOrder[0].effectiveTime)}ms</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ borderTop: "1px solid #1e2940", paddingTop: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#8899aa", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8, textTransform: "uppercase", textAlign: "center" }}>Umumiy hisob</div>
          <div style={{ border: "1px solid #1e2940", borderRadius: 6, overflow: "hidden", maxWidth: 400, margin: "0 auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 70px", background: "#0f1726", borderBottom: "1px solid #1e2940" }}>
              {["#", "O'YINCHI", "JAMI"].map((h, i) => (
                <div key={i} style={{ padding: "7px 10px", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: i === 2 ? "#f5c800" : "#8899aa", textAlign: i === 2 ? "center" : "left", textTransform: "uppercase" }}>{h}</div>
              ))}
            </div>
            {grandTotals.map((p, i) => (
              <div key={p.socketId} style={{ display: "grid", gridTemplateColumns: "32px 1fr 70px", background: p.socketId === myId ? "rgba(245,200,0,0.06)" : "transparent", borderBottom: i < grandTotals.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <div style={{ padding: "9px 10px", fontFamily: "'Anton', sans-serif", fontSize: 13, color: i === 0 ? "#f5c800" : "#445566" }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}`}</div>
                <div style={{ padding: "9px 10px", fontWeight: 600, fontSize: 13, color: p.socketId === myId ? "#f5c800" : "#f0f4ff" }}>{p.name}{p.socketId === myId && <span style={{ fontSize: 10, color: "#8899aa", marginLeft: 5 }}>(Siz)</span>}</div>
                <div style={{ padding: "9px 10px", textAlign: "center" }}>
                  <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 15, color: p.total >= 0 ? "#f5c800" : "#e63946" }}>{p.total > 0 ? "+" : ""}{p.total}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {topicScoresMock.map((tScores, ti) => (
            <div key={ti} style={{ border: "1px solid #1e2940", borderRadius: 6, overflow: "hidden" }}>
              <div onClick={() => toggleDetail(ti)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", cursor: "pointer", userSelect: "none", background: expandedDetail.has(ti) ? "#161f30" : "#0f1726", borderBottom: expandedDetail.has(ti) ? "1px solid #1e2940" : "none" }}>
                <span style={{ fontSize: 10, color: "#445566", transition: "transform 0.2s", display: "inline-block", transform: expandedDetail.has(ti) ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 12, letterSpacing: "0.06em", color: "#8899aa", flex: 1 }}>{ti + 1}. {topicNamesMock[ti] || `${ti+1}-mavzu`}</span>
                <span style={{ fontSize: 10, color: "#445566" }}>batafsil</span>
              </div>
              {expandedDetail.has(ti) && (
                <ScoreBoard scores={tScores} players={MOCK_PLAYERS} nominals={nominals} currentNominal={null} isHost={false} allTopicScores={topicScoresMock} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 4. RESULTS ───────────────────────────────────────────────────────────────
function ResultsScreen({ gameResult, archiveId, onRestart }) {
  const [data, setData]           = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [collapsedTopics, setCollapsedTopics] = useState(new Set());
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (gameResult) { setData(gameResult); return; }
    const hash = window.location.hash.replace("#results/", "").trim();
    if (hash) {
      window.storage.get(`results:${hash}`, true)
        .then(r => r ? setData(JSON.parse(r.value)) : setLoadError(true))
        .catch(() => setLoadError(true));
    } else {
      setData({
        id: "DEMO", date: new Date().toISOString(), nominals: DEFAULT_NOMINALS,
        topicNames: ["1-mavzu", "Geografiya", "Tarix"],
        topicScores: [
          { p1:{10:"correct",20:"correct",30:"wrong",  40:"correct",50:null   }, p2:{10:"wrong",  20:"correct",30:"correct",40:null,     50:"correct"}, p3:{10:"correct",20:"wrong",  30:"correct",40:"correct",50:"wrong"  }, p4:{10:"correct",20:null,     30:"wrong",  40:"wrong",  50:"correct"} },
          { p1:{10:"correct",20:null,     30:"correct",40:null,     50:"wrong"  }, p2:{10:null,     20:"correct",30:"wrong",  40:"correct",50:null     }, p3:{10:"wrong",  20:"correct",30:null,     40:"correct",50:"correct"}, p4:{10:"correct",20:"wrong",  30:"correct",40:null,     50:"wrong"  } },
          { p1:{10:null,     20:"correct",30:"wrong",  40:"correct",50:"correct"}, p2:{10:"correct",20:null,     30:"correct",40:"wrong",  50:null     }, p3:{10:"correct",20:"correct",30:null,     40:null,     50:"correct"}, p4:{10:"wrong",  20:"correct",30:"correct",40:"correct",50:null     } },
        ],
        players: MOCK_PLAYERS,
      });
    }
  }, [gameResult]);

  if (loadError) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div style={{ fontSize:48 }}>❌</div>
      <div style={{ color:"#e63946", fontWeight:700 }}>Natijalar topilmadi</div>
      {onRestart && <Btn onClick={onRestart}>🏠 Bosh sahifaga</Btn>}
    </div>
  );
  if (!data) return <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ color:"#8899aa" }}>Yuklanmoqda...</div></div>;

  const nominals       = data.nominals || DEFAULT_NOMINALS;
  const topicScoresMock = data.topicScores || [];
  const topicNamesMock  = data.topicNames  || [];
  const playersData     = data.players     || MOCK_PLAYERS;
  const gameDate        = data.date ? new Date(data.date) : new Date();
  const gameId          = archiveId || data.id || "DEMO";

  const shareUrl = `${window.location.origin}${window.location.pathname}#results/${gameId}`;
  const copyLink = () => { navigator.clipboard?.writeText(shareUrl).catch(() => {}); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); };

  const toggleTopic = (ti) => setCollapsedTopics(prev => { const next = new Set(prev); if (next.has(ti)) next.delete(ti); else next.add(ti); return next; });

  const ranked = playersData
    .map(p => ({ ...p, total: topicScoresMock.reduce((sum, ts) => sum + getTotal(ts, p.socketId, nominals), 0) }))
    .sort((a, b) => b.total - a.total);
  const medals = ["🥇", "🥈", "🥉"];

  const downloadCSV = () => {
    const header = ["№", "O'yinchi", "JAMI", ...topicScoresMock.flatMap((_, ti) => [...nominals.map(n => `${ti+1}-mavzu ${n}`), `TUR (${topicNamesMock[ti] || `${ti+1}-mavzu`})`])];
    const rows = [...ranked].map((p, i) => [i+1, p.name, p.total, ...topicScoresMock.flatMap(ts => [...nominals.map(n => { const r = ts[p.socketId]?.[n]; return r === "correct" ? n : r === "wrong" ? -n : ""; }), getTotal(ts, p.socketId, nominals)])]);
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "natijalar.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ minHeight: "100vh", padding: 24, display: "flex", flexDirection: "column", alignItems: "center", animation: "fadeIn 0.4s ease both" }}>
      <div style={{ maxWidth: 680, width: "100%" }}>
        <div style={{ textAlign: "center", paddingTop: 32, marginBottom: 32 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>🏆</div>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 56, lineHeight: 1, color: "#f5c800", letterSpacing: "0.06em" }}>{`O${T}YIN TUGADI`}</div>
          <p style={{ marginTop: 10, fontSize: 16, color: "#8899aa" }}>
            {`G${T}olib: `}<strong style={{ color: "#f0f4ff" }}>{ranked[0].name}</strong>
            {" "}<span style={{ color: "#f5c800" }}>+{ranked[0].total} ball</span>
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
          {ranked.map((p, i) => (
            <div key={p.socketId} style={{ display: "flex", alignItems: "center", gap: 16, background: i === 0 ? "rgba(245,200,0,0.07)" : "#111827", border: `1px solid ${i === 0 ? "#c9a200" : "#1e2940"}`, borderRadius: 4, padding: "14px 18px", animation: `fadeIn 0.3s ease ${i * 0.1}s both` }}>
              <span style={{ fontSize: 26, minWidth: 38, textAlign: "center" }}>{medals[i] || `${i + 1}.`}</span>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{p.name}</span>
              <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 26, color: p.total >= 0 ? "#f5c800" : "#e63946" }}>{p.total > 0 ? "+" : ""}{p.total}</span>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 18, letterSpacing: "0.06em", marginBottom: 10 }}>BATAFSIL</div>
          <div style={{ display:"flex", alignItems:"center", gap:8, background:"#111827", border:"1px solid #1e2940", borderRadius:6, padding:"8px 12px", marginBottom:10 }}>
            <span style={{ fontSize:11, color:"#445566", flexShrink:0 }}>🔗 Arxiv havolasi:</span>
            <span style={{ fontSize:11, color:"#8899aa", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{shareUrl}</span>
            <button onClick={copyLink} style={{ background: linkCopied ? "rgba(46,204,113,0.15)" : "#1e2940", border: `1px solid ${linkCopied ? "#2ecc71" : "#445566"}`, borderRadius:4, padding:"4px 10px", cursor:"pointer", fontFamily:"inherit", color: linkCopied ? "#2ecc71" : "#8899aa", fontSize:10, fontWeight:700, flexShrink:0 }}>
              {linkCopied ? "✓ Nusxalandi" : "NUSXALASH"}
            </button>
          </div>
          <button onClick={downloadCSV} style={{ background: "rgba(46,204,113,0.1)", border: "1px solid rgba(46,204,113,0.4)", borderRadius: 4, padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", color: "#2ecc71", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>
            ⬇ CSV YUKLAB OLISH
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
          {topicScoresMock.map((tScores, ti) => {
            const isCollapsed = collapsedTopics.has(ti);
            return (
              <div key={ti} style={{ border: "1px solid #1e2940", borderRadius: 6, overflow: "hidden" }}>
                <div onClick={() => toggleTopic(ti)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", userSelect: "none", background: isCollapsed ? "#0f1726" : "#161f30", borderBottom: isCollapsed ? "none" : "1px solid #1e2940" }}>
                  <span style={{ fontSize: 11, color: "#445566", display: "inline-block", transition: "transform 0.2s", transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)" }}>▶</span>
                  <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 13, letterSpacing: "0.06em", color: "#8899aa", flex: 1 }}>{ti + 1}. {topicNamesMock[ti] || `${ti+1}-mavzu`}</span>
                  <span style={{ fontSize: 10, color: "#445566" }}>tugadi</span>
                </div>
                {!isCollapsed && <ScoreBoard scores={tScores} players={playersData} nominals={nominals} currentNominal={null} isHost={false} allTopicScores={topicScoresMock} />}
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: "center", margin: "16px 0 8px", fontSize: 11, color: "#445566" }}>
          {(() => { const ms=["yanvar","fevral","mart","aprel","may","iyun","iyul","avgust","sentabr","oktabr","noyabr","dekabr"]; return `O'yin o'tkazilgan sana: ${gameDate.getDate()} ${ms[gameDate.getMonth()]} ${gameDate.getFullYear()}`; })()}
        </div>

        <Btn size="lg" style={{ width: "100%", marginBottom: 32 }} onClick={onRestart}>🏠 BOSH SAHIFAGA</Btn>
      </div>
    </div>
  );
}

// ─── NAV TABS & APP ───────────────────────────────────────────────────────────
const SCREENS = [
  { id: "landing",    label: "🏠 Bosh sahifa" },
  { id: "hostGame",   label: "📋 Boshlovchi panel" },
  { id: "playerGame", label: `🔴 O${T}yinchi ekrani` },
  { id: "results",    label: "🏆 Natijalar" },
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
