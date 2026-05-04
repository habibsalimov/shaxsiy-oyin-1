import { useState, useEffect } from "react";
import { T, NOMINAL_PRESETS } from '../utils/constants.js';
import { useWindowWidth } from '../hooks/useWindowWidth.js';
import { emitEvent } from '../socket.js';
import { Btn, Badge, Card, Label, Input, TimerDisplay } from './ui/index.js';
import { ScoreBoard } from './ScoreBoard.jsx';
import { SettingsPanel } from './SettingsPanel.jsx';

export function HostGameScreen({ gameState, roomCode, attachments: attachmentsProp, onFinish }) {
  // ─── Local UI-only state ───────────────────────────────────────────────────
  const [editingTopic, setEditingTopic] = useState(null);
  const [editValue, setEditValue]     = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied]           = useState(false);
  const [collapsedScores, setCollapsedScores] = useState(new Set());
  const [expandedTopics, setExpandedTopics] = useState(() => new Set([0]));
  const [attachMode, setAttachMode]   = useState(null);
  const [attachText, setAttachText]   = useState("");
  const [confirmReset, setConfirmReset] = useState(null);
  const [playersOpen, setPlayersOpen]   = useState(false);
  // Attachments now synced via server (gameState.attachments)
  const [lightboxSrc, setLightboxSrc] = useState(null);
  // Expanded history panel for old (done) cells
  const [expandedCell, setExpandedCell] = useState(null);

  // ─── Derive all game data from gameState ──────────────────────────────────
  const players = gameState?.players || [];
  const topicScores = gameState?.topicScores || [];
  const currentTopicIdx = gameState?.currentTopicIdx || 0;
  const activeCell = gameState?.activeCell;
  const timerEnd = gameState?.timerEnd;
  const buzzOrder = gameState?.buzzOrder || [];
  const blockedPlayers = new Set(gameState?.blockedPlayers || []);
  const falstartBlocked = new Set(gameState?.falstartBlocked || []);
  const roomLocked = gameState?.locked || false;
  const cellData = gameState?.cellData || {};
  const gamePhase = gameState?.phase || "lobby";
  const topicNames = gameState?.topicNames || [];
  const activeNominals = gameState?.settings?.nominals || [10,20,30,40,50];
  const timerSec = gameState?.settings?.timer || 7;
  const settings = gameState?.settings || { timer: 7, nominals: [10,20,30,40,50], falstart: false };
  const topicNominals = gameState?.topicNominals || [];
  const cellLocked = gameState?.cellLocked || false;

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 640;

  // ─── Computed values ─────────────────────────────────────────────────────
  const computeNextAllowed = (cd) => {
    for (let ti = 0; ti < topicNames.length; ti++) {
      const noms = topicNominals[ti] || activeNominals;
      for (let ni = 0; ni < noms.length; ni++) {
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
  const getCellData = (ti, ni) => cellData[cellKey(ti, ni)] || { history: [] };

  const toggleTopic = (ti) => setExpandedTopics(prev => {
    const next = new Set(prev);
    if (next.has(ti)) next.delete(ti); else next.add(ti);
    return next;
  });

  // ─── Max 3 open score panels ──────────────────────────────────────────────
  const MAX_OPEN_PANELS = 3;

  // Auto-collapse when topic changes: keep only latest 3 open
  useEffect(() => {
    setCollapsedScores(() => {
      const collapsed = new Set();
      for (let i = 0; i < topicScores.length; i++) {
        if (i < currentTopicIdx - (MAX_OPEN_PANELS - 1)) {
          collapsed.add(i);
        }
      }
      return collapsed;
    });
  }, [currentTopicIdx, topicScores.length]);

  // Auto-expand topic when activeCell moves to a new topic
  useEffect(() => {
    if (activeCell) {
      setExpandedTopics(prev => {
        if (prev.has(activeCell.ti)) return prev;
        const next = new Set(prev);
        next.add(activeCell.ti);
        return next;
      });
    }
  }, [activeCell?.ti]);

  const toggleScorePanel = (ti) => {
    setCollapsedScores(prev => {
      const next = new Set(prev);
      if (next.has(ti)) {
        // Opening — enforce max 3 open
        next.delete(ti);
        const openPanels = [];
        for (let i = 0; i < topicScores.length; i++) {
          if (!next.has(i)) openPanels.push(i);
        }
        if (openPanels.length > MAX_OPEN_PANELS) {
          next.add(Math.min(...openPanels));
        }
      } else {
        next.add(ti);
      }
      return next;
    });
  };

  // ─── Socket-emitting actions ─────────────────────────────────────────────
  const startTimer = () => {
    if (!activeCell) return;
    emitEvent("start-timer", { ti: activeCell.ti, ni: activeCell.ni });
  };

  const activateCellViaTimer = (ti, ni) => {
    // Starting a timer on a cell effectively activates it on the server
    emitEvent("start-timer", { ti, ni });
    setExpandedTopics(prev => { const next = new Set(prev); next.add(ti); return next; });
  };

  const judge = (result) => {
    if (!buzzOrder.length || !activeCell) return;
    const first = buzzOrder[0];
    emitEvent("judge", { playerId: first.playerId, result });
  };

  const skipQuestion = () => {
    if (!activeCell) return;
    emitEvent("skip-question", { ti: activeCell.ti, ni: activeCell.ni });
  };

  const surgunPlayer = (playerId) => {
    emitEvent("remove-player", { playerId });
  };

  const toggleBlock = (playerId) => {
    emitEvent("block-player", { playerId });
  };

  const toggleLockRoom = () => {
    emitEvent("lock-room");
  };

  const resetActiveCell = () => {
    if (!activeCell) return;
    emitEvent("reset-cell", { ti: activeCell.ti, ni: activeCell.ni });
    setExpandedCell(null);
    setConfirmReset(null);
  };

  const copyCode = () => {
    if (roomCode) {
      navigator.clipboard?.writeText(roomCode).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── Attachment handling (synced via server) ─────────────────────────────
  const serverAttachments = attachmentsProp || {};
  const getAttachment = (ti, ni) => serverAttachments[cellKey(ti, ni)] || null;

  const handleAttachText = (ti, ni) => {
    if (!attachText.trim()) return;
    emitEvent("set-attachment", { ti, ni, type: "text", content: attachText.trim() });
    setAttachMode(null);
    setAttachText("");
  };

  const handleAttachImage = (ti, ni, e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      emitEvent("set-attachment", { ti, ni, type: "image", content: reader.result });
      setAttachMode(null);
    };
    reader.readAsDataURL(file);
  };

  const removeAttachment = (ti, ni, type) => {
    emitEvent("remove-attachment", { ti, ni, type });
  };


  // ─── Derive settings summary for display ─────────────────────────────────
  const settingsSummary = `— ${timerSec}s \xb7 ${activeNominals.join("/")} \xb7 falstart: ${settings.falstart ? "yoniq" : `o${T}chiq`}`;

  // Derive selectedPreset from current nominals for SettingsPanel
  const selectedPreset = Math.max(0, NOMINAL_PRESETS.findIndex(p =>
    p.length === activeNominals.length && p.every((v, i) => v === activeNominals[i])
  ));

  const handleSettingsChange = (newSettings) => {
    const nominals = NOMINAL_PRESETS[newSettings.selectedPreset] || NOMINAL_PRESETS[0];
    emitEvent("update-settings", {
      timer: parseInt(newSettings.timer) || 7,
      nominals,
      falstart: newSettings.falstart,
    });
  };

  // ─── Loading state ───────────────────────────────────────────────────────
  if (!gameState) {
    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--text-secondary)", fontSize: 14, animation: "pulse 1s ease infinite alternate" }}>Yuklanmoqda...</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Topbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", borderBottom: "1px solid var(--border)",
        background: "rgba(17,24,39,0.97)", backdropFilter: "blur(8px)",
        flexShrink: 0, zIndex: 90,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 20, letterSpacing: "0.1em", color: "var(--accent)" }}>
            {`SHAXSIY O${T}YIN`}
          </span>
          <Badge color="yellow">BOSHLOVCHI</Badge>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Btn size="sm" variant={copied ? "success" : "ghost"} onClick={copyCode}>
            {copied ? "\u2713 Nusxalandi" : `Kod: ${roomCode || "..."}`}
          </Btn>
          <Btn size="sm" variant={roomLocked ? "danger" : "ghost"} onClick={toggleLockRoom}>
            {roomLocked ? "\uD83D\uDD12" : "\uD83D\uDD13"}
          </Btn>
          <button onClick={() => setPlayersOpen(o => !o)} style={{
            background: playersOpen ? "var(--accent-bg)" : "var(--bg-input)",
            border: `1px solid ${playersOpen ? "var(--accent)" : "var(--text-muted)"}`,
            borderRadius: 4, padding: "7px 10px", cursor: "pointer",
            color: playersOpen ? "var(--accent)" : "var(--text-secondary)", fontSize: 13, fontWeight: 700,
            fontFamily: "inherit", lineHeight: 1, transition: "all 0.15s",
          }}>{"\uD83D\uDC65"}</button>
          <button onClick={() => setSettingsOpen(o => !o)} style={{
            background: settingsOpen ? "var(--accent-bg)" : "var(--bg-input)",
            border: `1px solid ${settingsOpen ? "var(--accent)" : "var(--text-muted)"}`,
            borderRadius: 4, padding: "7px 10px", cursor: "pointer",
            color: settingsOpen ? "var(--accent)" : "var(--text-secondary)", fontSize: 16, lineHeight: 1, transition: "all 0.15s",
          }}>{"\u2699"}</button>
          <Btn size="sm" variant="danger" onClick={onFinish}>Tugatish</Btn>
        </div>
      </div>

      {settingsOpen && (
        <div onClick={() => setSettingsOpen(false)} style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "fadeIn 0.15s ease both",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "var(--bg-card)", border: "1px solid var(--border-strong)",
            borderRadius: 12, padding: "20px 24px", width: "90%", maxWidth: 440,
            maxHeight: "80vh", overflowY: "auto",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" }}>Sozlamalar</span>
              <button onClick={() => setSettingsOpen(false)} style={{
                background: "none", border: "none", color: "var(--text-secondary)", fontSize: 18,
                cursor: "pointer", padding: "2px 6px", lineHeight: 1,
              }}>{"\u2715"}</button>
            </div>
            <SettingsPanel
              settings={{ timer: String(timerSec), selectedPreset, falstart: settings.falstart }}
              onChange={handleSettingsChange}
            />
          </div>
        </div>
      )}

      {playersOpen && (
        <div style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)", padding: "12px 24px", animation: "fadeIn 0.15s ease both" }}>
          <div style={{ maxWidth: 480 }}>
            <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8, textTransform: "uppercase" }}>
              O'yinchilar boshqaruvi
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {players.map(p => (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "var(--bg-input)", borderRadius: 6, padding: "7px 10px",
                  opacity: blockedPlayers.has(p.id) ? 0.55 : !p.connected ? 0.4 : 1,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                    background: !p.connected ? "var(--orange)" : blockedPlayers.has(p.id) ? "var(--red)" : "var(--green)" }} />
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{p.name}</span>
                  {!p.connected && <span style={{ fontSize: 10, color: "var(--orange)", fontWeight: 700 }}>UZILGAN</span>}
                  {blockedPlayers.has(p.id) && <span style={{ fontSize: 10, color: "var(--red)", fontWeight: 700 }}>BLOKLANGAN</span>}
                  <button onClick={() => toggleBlock(p.id)} style={{
                    background: blockedPlayers.has(p.id) ? "var(--accent-bg)" : "transparent",
                    border: `1px solid ${blockedPlayers.has(p.id) ? "var(--accent)" : "var(--border-strong)"}`,
                    borderRadius: 4, padding: "3px 8px", cursor: "pointer",
                    color: blockedPlayers.has(p.id) ? "var(--accent)" : "var(--text-muted)",
                    fontSize: 10, fontFamily: "inherit", fontWeight: 700,
                  }}>{blockedPlayers.has(p.id) ? "BLOKDAN CHIQAR" : "BLOKLASH"}</button>
                  <button onClick={() => surgunPlayer(p.id)} style={{
                    background: "transparent", border: "1px solid rgba(230,57,70,0.4)",
                    borderRadius: 4, padding: "3px 8px", cursor: "pointer",
                    color: "var(--red)", fontSize: 10, fontFamily: "inherit", fontWeight: 700,
                  }}>SURGUN</button>
                </div>
              ))}
              {players.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>Hali hech kim ulanmagan</div>
              )}
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
              <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 52, letterSpacing: "0.24em", color: "var(--accent)", cursor: "pointer" }} onClick={copyCode}>
                {roomCode || "..."}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>Bosib nusxalash</div>
            </div>
            <Label>ULANGANLAR</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
              {players.map(p => (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "var(--bg-input)", borderRadius: 8, padding: "7px 10px",
                  opacity: blockedPlayers.has(p.id) ? 0.5 : 1,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                    background: blockedPlayers.has(p.id) ? "var(--red)" : "var(--green)" }} />
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1, textAlign: "left" }}>{p.name}</span>
                  <button onClick={() => toggleBlock(p.id)} style={{
                    background: blockedPlayers.has(p.id) ? "var(--accent-bg)" : "transparent",
                    border: `1px solid ${blockedPlayers.has(p.id) ? "var(--accent)" : "var(--border-strong)"}`,
                    borderRadius: 4, padding: "3px 7px", cursor: "pointer",
                    color: blockedPlayers.has(p.id) ? "var(--accent)" : "var(--text-muted)",
                    fontSize: 11, fontFamily: "inherit", fontWeight: 700,
                  }}>{blockedPlayers.has(p.id) ? "BLOK \u2713" : "BLOK"}</button>
                  <button onClick={() => surgunPlayer(p.id)} style={{
                    background: "transparent", border: "1px solid var(--border-strong)",
                    borderRadius: 4, padding: "3px 7px", cursor: "pointer",
                    color: "var(--red)", fontSize: 11, fontFamily: "inherit", fontWeight: 700,
                  }}>SURGUN</button>
                </div>
              ))}
              {players.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "12px 0", fontStyle: "italic" }}>
                  {`O${T}yinchilar kutilmoqda...`}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Btn style={{ width: "100%" }} disabled={players.length < 1} onClick={() => {
                if (players.length >= 1) {
                  emitEvent("start-game");
                }
              }}>
                {players.length < 1 ? `Kamida 1 ta o${T}yinchi kerak` : `O${T}YINNI BOSHLASH`}
              </Btn>
              <Btn variant={roomLocked ? "danger" : "ghost"} size="sm" style={{ width: "100%" }} onClick={toggleLockRoom}>
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
          <div style={isMobile ? { width: "100%", borderBottom: "1px solid var(--border)", overflowY: "visible" }
            : { width: 320, flexShrink: 0, borderRight: "1px solid var(--border)", overflowY: "auto", minHeight: 0 }}>
            {topicNames.map((topicName, ti) => {
              const isTopicActive = activeCell && activeCell.ti === ti;
              return (
                <div key={ti} style={{ marginBottom: 2 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "9px 14px",
                    borderLeft: isTopicActive ? "3px solid var(--accent)" : "3px solid transparent",
                    background: isTopicActive ? "var(--accent-bg)" : expandedTopics.has(ti) ? "var(--bg-section-open)" : "var(--bg-section)",
                    borderBottom: "1px solid var(--border)", cursor: "pointer", userSelect: "none",
                  }} onClick={() => toggleTopic(ti)}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0, transition: "transform 0.2s", display: "inline-block", transform: expandedTopics.has(ti) ? "rotate(90deg)" : "rotate(0deg)" }}>{"\u25B6"}</span>
                    {editingTopic === ti ? (
                      <input autoFocus value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => {
                          if (e.key === "Enter") { setEditingTopic(null); }
                          if (e.key === "Escape") setEditingTopic(null);
                        }}
                        onBlur={() => { setEditingTopic(null); }}
                        style={{ background: "var(--bg-input)", border: "1px solid var(--accent)", color: "var(--text)", fontFamily: "inherit", fontSize: 14, fontWeight: 700, borderRadius: 3, padding: "4px 8px", outline: "none", flex: 1 }}
                      />
                    ) : (
                      <span onClick={e => { e.stopPropagation(); setEditingTopic(ti); setEditValue(topicName); }}
                        style={{ fontFamily: "'Anton', sans-serif", fontSize: 14, letterSpacing: "0.04em", color: isTopicActive ? "var(--accent)" : "var(--text)", flex: 1 }}>
                        {ti + 1}. {topicName}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>{(topicNominals[ti] || activeNominals).length} savol</span>
                  </div>

                  {expandedTopics.has(ti) && (topicNominals[ti] || activeNominals).map((nom, ni) => {
                    const cd = getCellData(ti, ni);
                    const isActive = activeCell && activeCell.ti === ti && activeCell.ni === ni;
                    const hasCorrect  = cd.history.some(h => h.result === "correct");
                    const hasNoAnswer = cd.history.some(h => h.result === "no_answer" || h.result === "skipped");
                    const isDone = hasCorrect || hasNoAnswer;
                    const lastResult = cd.history[cd.history.length - 1];
                    const attachment = getAttachment(ti, ni);
                    const isLocked = isActive && cellLocked;

                    return (
                      <div key={ni}>
                        <div onClick={() => {
                          // Clicking on a cell just expands it locally; doesn't auto-start timer
                          setExpandedTopics(prev => { const next = new Set(prev); next.add(ti); return next; });
                        }} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "9px 16px 9px 28px",
                          cursor: "pointer",
                          background: isActive ? "var(--accent-bg-subtle)" : "transparent",
                          borderLeft: isActive ? "3px solid var(--accent)" : "3px solid transparent",
                          transition: "background 0.1s",
                          opacity: !isDone && !isCellAllowed(ti, ni) ? 0.35 : 1,
                        }}
                          onMouseEnter={e => { if (!isActive && isCellAllowed(ti, ni)) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                          <span style={{ fontSize: 13, minWidth: 16, color: isDone ? (lastResult?.result === "correct" ? "var(--green)" : "var(--text-muted)") : "var(--text-muted)" }}>
                            {isDone ? (lastResult?.result === "correct" ? "\u2713" : "\u23ED") : (isActive ? "\u25B6" : "\u25B6")}
                          </span>
                          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 16, color: isActive ? "var(--accent)" : isDone ? "var(--text-secondary)" : "var(--text)", minWidth: 36 }}>{nom}</span>
                          <span style={{ fontSize: 11, color: "var(--text-muted)", flex: 1, fontStyle: "italic" }}>{topicName}</span>
                          {attachment?.image && <span style={{ fontSize: 12 }}>{"\uD83D\uDDBC\uFE0F"}</span>}
                          {attachment?.text && <span style={{ fontSize: 12 }}>{"\uD83D\uDCDD"}</span>}
                          {isLocked && <span style={{ fontSize: 12 }}>{"\uD83D\uDD12"}</span>}
                          {cd.history.length > 0 && (
                            <button onClick={e => { e.stopPropagation(); setExpandedCell(expandedCell === cellKey(ti, ni) ? null : cellKey(ti, ni)); }} style={{
                              background: expandedCell === cellKey(ti, ni) ? "var(--accent-bg)" : "var(--bg-input)",
                              border: expandedCell === cellKey(ti, ni) ? "1px solid var(--accent)" : "none",
                              borderRadius: 3, padding: "3px 8px",
                              fontSize: 10, color: expandedCell === cellKey(ti, ni) ? "var(--accent)" : "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit",
                            }}>TARIX</button>
                          )}
                        </div>

                        {(isActive || expandedCell === cellKey(ti, ni)) && (
                          <div style={{ margin: "0 8px 8px", borderRadius: 6, background: "var(--bg-card)", border: "1px solid var(--border-strong)", padding: "12px 14px", animation: "fadeIn 0.15s ease both" }}>
                            {(isDone || expandedCell === cellKey(ti, ni)) ? (
                              <>
                                <div style={{ marginBottom: 12 }}>
                                  <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8, textTransform: "uppercase" }}>Savol tarixi</div>
                                  {cd.history.map((h, idx) => (
                                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 13 }}>
                                      {(h.result === "no_answer" || h.result === "skipped") ? (
                                        <span style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: 12 }}>
                                          {h.result === "no_answer" ? "\u23F1 Hech kim javob bermadi" : "\u23ED O'tkazib yuborildi"}
                                        </span>
                                      ) : (
                                        <>
                                          <span style={{ color: h.result === "correct" ? "var(--green)" : "var(--red)", fontSize: 15, minWidth: 16 }}>{h.result === "correct" ? "\u2713" : "\u2717"}</span>
                                          <span style={{ flex: 1, fontWeight: 600 }}>{h.playerName}</span>
                                          <span style={{ color: h.result === "correct" ? "var(--green)" : "var(--red)", fontFamily: "'Anton', sans-serif", fontSize: 15 }}>
                                            {h.result === "correct" ? "+" : "\u2212"}{h.nominal}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                {confirmReset === cellKey(ti, ni) ? (
                                  <div style={{ border: "1px solid rgba(230,57,70,0.4)", borderRadius: 6, padding: "10px 12px", background: "rgba(230,57,70,0.06)" }}>
                                    <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 10, lineHeight: 1.4 }}>
                                      Ushbu savoldagi barcha natijalar bekor qilinadi. Davom etasizmi?
                                    </div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                      <Btn size="sm" variant="danger" style={{ flex: 1 }} onClick={() => {
                                        emitEvent("reset-cell", { ti, ni });
                                        setExpandedCell(null);
                                        setConfirmReset(null);
                                      }}>
                                        Ha, bekor qilish
                                      </Btn>
                                      <Btn size="sm" variant="ghost" style={{ flex: 1 }} onClick={() => setConfirmReset(null)}>
                                        Bekor
                                      </Btn>
                                    </div>
                                  </div>
                                ) : (
                                  <Btn size="sm" variant="danger" style={{ width: "100%" }} onClick={() => setConfirmReset(cellKey(ti, ni))}>
                                    {"\uD83D\uDD04"} Natijani bekor qilish
                                  </Btn>
                                )}
                              </>
                            ) : (
                              <>
                                {attachment?.image && (
                                  <div style={{ marginBottom: 10, position: "relative" }}>
                                    <img src={attachment.image} alt="" onClick={() => setLightboxSrc(attachment.image)} style={{ maxWidth: "100%", borderRadius: 4, maxHeight: 120, objectFit: "cover", cursor: "pointer" }} />
                                    <button onClick={() => removeAttachment(ti, ni, "image")} style={{ position: "absolute", top: 4, right: 4, background: "var(--red)", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: 11, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2715"}</button>
                                  </div>
                                )}
                                {attachment?.text && (
                                  <div style={{ marginBottom: 10, position: "relative" }}>
                                    <div style={{ background: "var(--bg-input)", borderRadius: 4, padding: "10px 12px", fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>{attachment.text}</div>
                                    <button onClick={() => removeAttachment(ti, ni, "text")} style={{ position: "absolute", top: 4, right: 4, background: "var(--red)", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: 11, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2715"}</button>
                                  </div>
                                )}

                                {attachMode && attachMode.ti === ti && attachMode.ni === ni && attachMode.type === "text" && (
                                  <div style={{ marginBottom: 10 }}>
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <input autoFocus value={attachText} onChange={e => setAttachText(e.target.value)}
                                        onKeyDown={e => e.key === "Enter" && handleAttachText(ti, ni)}
                                        placeholder="Matn kiriting va Enter bosing..."
                                        style={{ flex: 1, background: "var(--bg-input)", border: "1px solid var(--accent)", color: "var(--text)", borderRadius: 4, padding: "8px 10px", fontSize: 12, fontFamily: "inherit", outline: "none" }}
                                      />
                                      <button onClick={() => handleAttachText(ti, ni)} style={{ background: "var(--accent)", border: "none", borderRadius: 4, padding: "0 12px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>{"\u2713"}</button>
                                      <button onClick={() => setAttachMode(null)} style={{ background: "var(--bg-input)", border: "none", borderRadius: 4, padding: "0 10px", cursor: "pointer", color: "var(--text-secondary)" }}>{"\u2715"}</button>
                                    </div>
                                  </div>
                                )}

                                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                                  <button onClick={() => { setAttachMode({ ti, ni, type: "text" }); setAttachText(""); }} style={{ background: "var(--bg-input)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "6px 10px", cursor: "pointer", color: "var(--text-secondary)", fontSize: 14 }}>{"\uD83D\uDCDD"}</button>
                                  <label style={{ background: "var(--bg-input)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "6px 10px", cursor: "pointer", color: "var(--text-secondary)", fontSize: 14 }}>
                                    {"\uD83D\uDDBC\uFE0F"}<input type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleAttachImage(ti, ni, e)} />
                                  </label>
                                  <button onClick={() => emitEvent("lock-cell")} style={{
                                    background: isLocked ? "rgba(243,156,18,0.15)" : "var(--bg-input)",
                                    border: `1px solid ${isLocked ? "var(--orange)" : "var(--border-strong)"}`,
                                    borderRadius: 4, padding: "6px 12px", cursor: "pointer",
                                    color: isLocked ? "var(--orange)" : "var(--text-secondary)", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                                  }}>{isLocked ? "\uD83D\uDD12 Bloklangan" : "\uD83D\uDD13 Qulf"}</button>
                                  <button onClick={resetActiveCell} style={{
                                    background: "var(--red-bg-strong)",
                                    border: "1px solid var(--red)",
                                    borderRadius: 4, padding: "6px 12px", cursor: "pointer",
                                    color: "var(--red)", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                                  }} title="Faol savolni qayta boshlash">{"\u21BB"} Reset</button>
                                  <div style={{ flex: 1 }} />
                                </div>

                                {!timerEnd ? (
                                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                                    <Btn style={{ flex: 1 }} size="sm" onClick={startTimer} disabled={isLocked}>{"\u25B6"} Taymerni boshlash</Btn>
                                  </div>
                                ) : (
                                  <div style={{ marginBottom: 8 }}>
                                    <TimerDisplay timerEnd={timerEnd} timerSec={timerSec} />
                                  </div>
                                )}

                                {buzzOrder.length > 0 && (
                                  <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase" }}>Javob tartibi</div>
                                    {buzzOrder.map((b, i) => (
                                      <div key={b.playerId} style={{
                                        display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 4, marginBottom: 4,
                                        background: i === 0 ? "var(--green-bg)" : "rgba(255,255,255,0.03)",
                                        border: i === 0 ? "1px solid var(--green)" : "1px solid transparent",
                                        flexWrap: "wrap",
                                      }}>
                                        <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 16, color: i === 0 ? "var(--green)" : "var(--text-secondary)", minWidth: 18, flexShrink: 0 }}>{i + 1}</span>
                                        <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{b.name}</span>
                                        {i > 0 && <span style={{ fontSize: 10, color: "var(--text-secondary)", flexShrink: 0 }}>+{b.effectiveTime - buzzOrder[0].effectiveTime}ms</span>}
                                        {i === 0 && (
                                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                            <button onClick={() => judge("correct")} style={{ background: "var(--green)", border: "none", borderRadius: 3, padding: "4px 10px", cursor: "pointer", fontWeight: 700, color: "var(--bg)", fontSize: 11, fontFamily: "inherit" }}>{"\u2713"} {`TO${T}G${T}RI`}</button>
                                            <button onClick={() => judge("wrong")} style={{ background: "var(--red)", border: "none", borderRadius: 3, padding: "4px 10px", cursor: "pointer", fontWeight: 700, color: "#fff", fontSize: 11, fontFamily: "inherit" }}>{"\u2717"} {`NOTO${T}G${T}RI`}</button>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {settings.falstart && falstartBlocked.size > 0 && (
                                  <div style={{ marginBottom: 8, padding: "6px 10px", background: "rgba(243,156,18,0.06)", borderRadius: 4, border: "1px solid rgba(243,156,18,0.2)" }}>
                                    <div style={{ fontSize: 10, color: "var(--orange)", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 4 }}>FALSTART</div>
                                    {[...falstartBlocked].map(playerId => { const p = players.find(pl => pl.id === playerId); return p ? <div key={playerId} style={{ fontSize: 12, color: "var(--orange)" }}>{"\u26A1"} {p.name}</div> : null; })}
                                  </div>
                                )}

                                <div style={{ marginTop: 8 }}>
                                  <Btn variant="success" size="sm" style={{ width: "100%" }} onClick={skipQuestion}>Keyingi savol {"\u2192"}</Btn>
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
              <button onClick={() => emitEvent("add-topic", {})} style={{
                width: "100%", background: "transparent", border: "1px dashed var(--border-strong)", borderRadius: 4,
                padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", color: "var(--text-muted)",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", transition: "all 0.15s",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-strong)"; e.currentTarget.style.color = "var(--text-muted)"; }}
              >+ Mavzu qo{T}shish</button>
            </div>
          </div>

          {/* RIGHT: per-topic scoreboards */}
          <div style={{ flex: 1, overflowY: isMobile ? "visible" : "auto", minHeight: 0, padding: "12px 16px" }}>
            {activeCell && (
              <div style={{ marginBottom: 12, padding: "8px 14px", background: "rgba(245,200,0,0.06)", borderRadius: 6, border: "1px solid rgba(245,200,0,0.15)", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Faol savol:</span>
                <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 15, color: "var(--accent)" }}>
                  {(topicNominals[activeCell.ti] || activeNominals)[activeCell.ni]} — {topicNames[activeCell.ti]}
                </span>
              </div>
            )}

            {topicScores.slice().reverse().map((tScores, revIdx) => {
              const scorePanelTi = topicScores.length - 1 - revIdx;
              const isCurrentTopic = scorePanelTi === currentTopicIdx;
              const isCollapsed = collapsedScores.has(scorePanelTi);
              const panelNominals = topicNominals[scorePanelTi] || activeNominals;
              const activeNomForPanel = isCurrentTopic && activeCell ? panelNominals[activeCell.ni] : null;

              return (
                <div key={scorePanelTi} style={{ marginBottom: 12, border: `1px solid ${isCurrentTopic ? "rgba(245,200,0,0.3)" : "var(--bg-input)"}`, borderRadius: 6, overflow: "hidden" }}>
                  <div onClick={() => toggleScorePanel(scorePanelTi)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", userSelect: "none", background: isCurrentTopic ? "var(--accent-bg-subtle)" : "var(--bg-section)", borderBottom: isCollapsed ? "none" : "1px solid var(--border)" }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", display: "inline-block", transition: "transform 0.2s", transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)" }}>{"\u25B6"}</span>
                    <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 13, letterSpacing: "0.06em", color: isCurrentTopic ? "var(--accent)" : "var(--text-secondary)", flex: 1 }}>
                      {scorePanelTi + 1}. {topicNames[scorePanelTi] || `${scorePanelTi + 1}-mavzu`}
                    </span>
                    {isCurrentTopic ? <Badge color="yellow">FAOL</Badge> : <span style={{ fontSize: 10, color: "var(--text-muted)" }}>tugadi</span>}
                  </div>
                  {!isCollapsed && (
                    <ScoreBoard
                      scores={tScores} players={players} nominals={panelNominals}
                      currentNominal={activeNomForPanel} isHost={true} allTopicScores={topicScores}
                      blockedPlayers={blockedPlayers}
                      topicNominals={topicNominals}
                      onCellClick={(playerId, n) => {
                        const ni = panelNominals.indexOf(n);
                        if (ni === -1) return;
                        emitEvent("correct-score", { playerId, ti: scorePanelTi, ni });
                      }}
                    />
                  )}
                </div>
              );
            })}
            {topicScores.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 13 }}>
                Taymerni boshlang — natijalar shu yerda ko{T}rinadi
              </div>
            )}
            {topicScores.length > 0 && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{`Katakchani bosib natijani o${T}zgartirish mumkin (null \u2192 to${T}g${T}ri \u2192 noto${T}g${T}ri \u2192 null)`}</div>
            )}
          </div>
        </div>
      )}
      {lightboxSrc && (
        <div onClick={() => setLightboxSrc(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <button onClick={() => setLightboxSrc(null)} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "#fff", fontSize: 28, cursor: "pointer", zIndex: 1 }}>{"\u2715"}</button>
          <img src={lightboxSrc} alt="" onClick={e => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8, cursor: "default" }} />
        </div>
      )}
    </div>
  );
}
