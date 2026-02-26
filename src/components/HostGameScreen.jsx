import { useState, useEffect, useCallback, useRef } from "react";
import { NOMINAL_PRESETS, DEFAULT_NOMINALS, T } from '../utils/constants.js';
import { getTotal, rebuildSnapshots, initScores } from '../utils/scoring.js';
import { useWindowWidth } from '../hooks/useWindowWidth.js';
import { Btn, Badge, Card, Label, Input, TimerDisplay } from './ui/index.js';
import { ScoreBoard } from './ScoreBoard.jsx';
import { SettingsPanel } from './SettingsPanel.jsx';

const MOCK_PLAYERS = [
  { socketId: "p1", name: "Alibek",  latency: 12 },
  { socketId: "p2", name: "Nodira",  latency: 34 },
  { socketId: "p3", name: "Jasur",   latency: 8  },
  { socketId: "p4", name: "Malika",  latency: 55 },
];
const MOCK_TOPICS = ["Tarix", "Geografiya", "Fan va texnologiya", "Musiqa", "Sport"];

export function HostGameScreen({ onFinish, nominals: nominalsProp, initialSettings, initTopics, initRounds }) {
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
            {copied ? "✓ Nusxalandi" : "Kod: 1337"}
          </Btn>
          <Btn size="sm" variant={roomLocked ? "danger" : "ghost"} onClick={() => setRoomLocked(v => !v)}>
            {roomLocked ? "\uD83D\uDD12" : "\uD83D\uDD13"}
          </Btn>
          <button onClick={() => setPlayersOpen(o => !o)} style={{
            background: playersOpen ? "rgba(245,200,0,0.15)" : "#1e2940",
            border: `1px solid ${playersOpen ? "#f5c800" : "#445566"}`,
            borderRadius: 4, padding: "7px 10px", cursor: "pointer",
            color: playersOpen ? "#f5c800" : "#8899aa", fontSize: 13, fontWeight: 700,
            fontFamily: "inherit", lineHeight: 1, transition: "all 0.15s",
          }}>\uD83D\uDC65</button>
          <button onClick={() => setSettingsOpen(o => !o)} style={{
            background: settingsOpen ? "rgba(245,200,0,0.15)" : "#1e2940",
            border: `1px solid ${settingsOpen ? "#f5c800" : "#445566"}`,
            borderRadius: 4, padding: "7px 10px", cursor: "pointer",
            color: settingsOpen ? "#f5c800" : "#8899aa", fontSize: 16, lineHeight: 1, transition: "all 0.15s",
          }}>\u2699</button>
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
                  }}>{blockedPlayers.has(p.socketId) ? "BLOK \u2713" : "BLOK"}</button>
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
                {`O${T}YINNI BOSHLASH`}
              </Btn>
              <Btn variant={roomLocked ? "danger" : "ghost"} size="sm" style={{ width: "100%" }} onClick={() => setRoomLocked(v => !v)}>
                {roomLocked ? "\uD83D\uDD12 Xona qulflangan \u2014 ochish" : "\uD83D\uDD13 Xonani qulflash"}
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
                    <span style={{ fontSize: 11, color: "#445566", flexShrink: 0, transition: "transform 0.2s", display: "inline-block", transform: expandedTopics.has(ti) ? "rotate(90deg)" : "rotate(0deg)" }}>\u25B6</span>
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
                            {isDone ? (lastResult?.result === "correct" ? "\u2713" : "\u23ED") : (isActive ? "\u25B6" : "\u25B6")}
                          </span>
                          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 16, color: isActive ? "#f5c800" : isDone ? "#8899aa" : "#f0f4ff", minWidth: 36 }}>{nom}</span>
                          <span style={{ fontSize: 11, color: "#445566", flex: 1, fontStyle: "italic" }}>{topicName}</span>
                          {cd.attachment && <span style={{ fontSize: 12 }}>{cd.attachment.type === "image" ? "\uD83D\uDDBC\uFE0F" : "\uD83D\uDCDD"}</span>}
                          {cd.locked && <span style={{ fontSize: 12 }}>\uD83D\uDD12</span>}
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
                                          {h.result === "no_answer" ? "\u23F1 Hech kim javob bermadi" : "\u23ED O'tkazib yuborildi"}
                                        </span>
                                      ) : (
                                        <>
                                          <span style={{ color: h.result === "correct" ? "#2ecc71" : "#e63946", fontSize: 15, minWidth: 16 }}>{h.result === "correct" ? "\u2713" : "\u2717"}</span>
                                          <span style={{ flex: 1, fontWeight: 600 }}>{h.playerName}</span>
                                          <span style={{ color: h.result === "correct" ? "#2ecc71" : "#e63946", fontFamily: "'Anton', sans-serif", fontSize: 15 }}>
                                            {h.result === "correct" ? "+" : "\u2212"}{h.nominal}
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
                                  }}>{"\u21BA"} Natijalarni bekor qilish</button>
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
                                    <button onClick={() => updateCell(ti, ni, { attachment: null })} style={{ position: "absolute", top: 4, right: 4, background: "#e63946", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: 11, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2715"}</button>
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
                                      <button onClick={() => handleAttachText(ti, ni)} style={{ background: "#f5c800", border: "none", borderRadius: 4, padding: "0 12px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>{"\u2713"}</button>
                                      <button onClick={() => setAttachMode(null)} style={{ background: "#1e2940", border: "none", borderRadius: 4, padding: "0 10px", cursor: "pointer", color: "#8899aa" }}>{"\u2715"}</button>
                                    </div>
                                  </div>
                                )}

                                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                                  <button onClick={() => { setAttachMode({ ti, ni, type: "text" }); setAttachText(""); }} style={{ background: "#1e2940", border: "1px solid #2a3a52", borderRadius: 4, padding: "6px 10px", cursor: "pointer", color: "#8899aa", fontSize: 14 }}>{"\uD83D\uDCDD"}</button>
                                  <label style={{ background: "#1e2940", border: "1px solid #2a3a52", borderRadius: 4, padding: "6px 10px", cursor: "pointer", color: "#8899aa", fontSize: 14 }}>
                                    {"\uD83D\uDDBC\uFE0F"}<input type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleAttachImage(ti, ni, e)} />
                                  </label>
                                  <button onClick={() => updateCell(ti, ni, { locked: !cd.locked })} style={{
                                    background: cd.locked ? "rgba(243,156,18,0.15)" : "#1e2940",
                                    border: `1px solid ${cd.locked ? "#f39c12" : "#2a3a52"}`,
                                    borderRadius: 4, padding: "6px 12px", cursor: "pointer",
                                    color: cd.locked ? "#f39c12" : "#8899aa", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                                  }}>{cd.locked ? "\uD83D\uDD12 Bloklangan" : "\uD83D\uDD13 Qulf"}</button>
                                  <div style={{ flex: 1 }} />
                                  {settings.falstart && (
                                    <button onClick={() => { const rnd = players[Math.floor(Math.random() * players.length)]; setFalstartBlocked(prev => new Set([...prev, rnd.socketId])); }}
                                      style={{ background: "rgba(243,156,18,0.1)", border: "1px solid #f39c12", borderRadius: 4, padding: "6px 10px", cursor: "pointer", color: "#f39c12", fontSize: 12, fontFamily: "inherit" }}>
                                      {"\u26A1"} Falstart
                                    </button>
                                  )}
                                </div>

                                {!timerEnd ? (
                                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                                    <Btn style={{ flex: 1 }} size="sm" onClick={startTimer} disabled={cd.locked}>{"\u25B6"} Taymerni boshlash</Btn>
                                    <Btn variant="ghost" size="sm" onClick={resetBuzzers}>{"\u21BA"}</Btn>
                                  </div>
                                ) : (
                                  <div style={{ marginBottom: 8 }}>
                                    <TimerDisplay timerEnd={timerEnd} timerSec={timerSec} />
                                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                                      <Btn variant="ghost" size="sm" style={{ flex: 1 }} onClick={simulateBuzz}>Buzz simulatsiya</Btn>
                                      <Btn variant="ghost" size="sm" onClick={resetBuzzers}>{"\u21BA"} Reset</Btn>
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
                                            <button onClick={() => judge("correct")} style={{ background: "#2ecc71", border: "none", borderRadius: 3, padding: "4px 10px", cursor: "pointer", fontWeight: 700, color: "#0a0e1a", fontSize: 11, fontFamily: "inherit" }}>{"\u2713"} {`TO${T}G${T}RI`}</button>
                                            <button onClick={() => judge("wrong")} style={{ background: "#e63946", border: "none", borderRadius: 3, padding: "4px 10px", cursor: "pointer", fontWeight: 700, color: "#fff", fontSize: 11, fontFamily: "inherit" }}>{"\u2717"} {`NOTO${T}G${T}RI`}</button>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {settings.falstart && falstartBlocked.size > 0 && (
                                  <div style={{ marginBottom: 8, padding: "6px 10px", background: "rgba(243,156,18,0.06)", borderRadius: 4, border: "1px solid rgba(243,156,18,0.2)" }}>
                                    <div style={{ fontSize: 10, color: "#f39c12", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>FALSTART</div>
                                    {[...falstartBlocked].map(sid => { const p = players.find(pl => pl.socketId === sid); return p ? <div key={sid} style={{ fontSize: 12, color: "#f39c12" }}>{"\u26A1"} {p.name}</div> : null; })}
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
                                  }}>Keyingi savol {"\u2192"}</Btn>
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
                    <span style={{ fontSize: 11, color: "#445566", display: "inline-block", transition: "transform 0.2s", transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)" }}>{"\u25B6"}</span>
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
            <div style={{ fontSize: 11, color: "#445566", marginTop: 4 }}>{`Katakchani bosib natijani o${T}zgartirish mumkin`}</div>
          </div>
        </div>
      )}
    </div>
  );
}
