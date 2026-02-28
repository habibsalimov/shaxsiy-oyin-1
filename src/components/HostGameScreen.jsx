import { useState, useEffect } from "react";
import { T } from '../utils/constants.js';
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
  // Local cell lock state (host-only, not synced to server)
  const [localLocks, setLocalLocks] = useState({});
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

  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 640;

  // ─── Computed values ─────────────────────────────────────────────────────
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
    emitEvent("judge", { playerId: first.socketId, result });
  };

  const skipQuestion = () => {
    if (!activeCell) return;
    emitEvent("skip-question", { ti: activeCell.ti, ni: activeCell.ni });
  };

  const surgunPlayer = (sid) => {
    emitEvent("remove-player", { playerId: sid });
  };

  const toggleBlock = (sid) => {
    emitEvent("block-player", { playerId: sid });
  };

  const toggleLockRoom = () => {
    emitEvent("lock-room");
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
  const getLocalLock = (ti, ni) => localLocks[cellKey(ti, ni)] || false;

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

  const toggleLocalLock = (ti, ni) => {
    setLocalLocks(prev => ({ ...prev, [cellKey(ti, ni)]: !prev[cellKey(ti, ni)] }));
  };

  // ─── Derive settings summary for display ─────────────────────────────────
  const settingsSummary = `— ${timerSec}s \xb7 ${activeNominals.join("/")} \xb7 falstart: ${settings.falstart ? "yoniq" : `o${T}chiq`}`;

  // ─── Loading state ───────────────────────────────────────────────────────
  if (!gameState) {
    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#8899aa", fontSize: 14, animation: "pulse 1s ease infinite alternate" }}>Yuklanmoqda...</div>
      </div>
    );
  }

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
            {copied ? "\u2713 Nusxalandi" : `Kod: ${roomCode || "..."}`}
          </Btn>
          <Btn size="sm" variant={roomLocked ? "danger" : "ghost"} onClick={toggleLockRoom}>
            {roomLocked ? "\uD83D\uDD12" : "\uD83D\uDD13"}
          </Btn>
          <button onClick={() => setPlayersOpen(o => !o)} style={{
            background: playersOpen ? "rgba(245,200,0,0.15)" : "#1e2940",
            border: `1px solid ${playersOpen ? "#f5c800" : "#445566"}`,
            borderRadius: 4, padding: "7px 10px", cursor: "pointer",
            color: playersOpen ? "#f5c800" : "#8899aa", fontSize: 13, fontWeight: 700,
            fontFamily: "inherit", lineHeight: 1, transition: "all 0.15s",
          }}>{"\uD83D\uDC65"}</button>
          <button onClick={() => setSettingsOpen(o => !o)} style={{
            background: settingsOpen ? "rgba(245,200,0,0.15)" : "#1e2940",
            border: `1px solid ${settingsOpen ? "#f5c800" : "#445566"}`,
            borderRadius: 4, padding: "7px 10px", cursor: "pointer",
            color: settingsOpen ? "#f5c800" : "#8899aa", fontSize: 16, lineHeight: 1, transition: "all 0.15s",
          }}>{"\u2699"}</button>
          <Btn size="sm" variant="danger" onClick={onFinish}>Tugatish</Btn>
        </div>
      </div>

      {settingsOpen && (
        <div style={{ background: "#111827", borderBottom: "1px solid #1e2940", padding: "16px 24px", animation: "fadeIn 0.15s ease both" }}>
          <div style={{ maxWidth: 520 }}>
            <div style={{ fontSize: 11, color: "#8899aa", marginBottom: 8 }}>
              {settingsSummary}
            </div>
            <div style={{ fontSize: 10, color: "#445566" }}>
              Sozlamalar server tomonidan boshqariladi. Ularni faqat o{T}yin yaratish vaqtida o{T}zgartirish mumkin.
            </div>
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
                  opacity: blockedPlayers.has(p.socketId) ? 0.55 : !p.connected ? 0.4 : 1,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                    background: !p.connected ? "#f39c12" : blockedPlayers.has(p.socketId) ? "#e63946" : "#2ecc71" }} />
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{p.name}</span>
                  {!p.connected && <span style={{ fontSize: 10, color: "#f39c12", fontWeight: 700 }}>UZILGAN</span>}
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
              {players.length === 0 && (
                <div style={{ fontSize: 12, color: "#445566", padding: "8px 0" }}>Hali hech kim ulanmagan</div>
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
              <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 52, letterSpacing: "0.24em", color: "#f5c800", cursor: "pointer" }} onClick={copyCode}>
                {roomCode || "..."}
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
              {players.length === 0 && (
                <div style={{ fontSize: 12, color: "#445566", padding: "12px 0", fontStyle: "italic" }}>
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
                    <span style={{ fontSize: 11, color: "#445566", flexShrink: 0, transition: "transform 0.2s", display: "inline-block", transform: expandedTopics.has(ti) ? "rotate(90deg)" : "rotate(0deg)" }}>{"\u25B6"}</span>
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
                    <span style={{ fontSize: 11, color: "#445566", flexShrink: 0 }}>{activeNominals.length} savol</span>
                  </div>

                  {expandedTopics.has(ti) && activeNominals.map((nom, ni) => {
                    const cd = getCellData(ti, ni);
                    const isActive = activeCell && activeCell.ti === ti && activeCell.ni === ni;
                    const hasCorrect  = cd.history.some(h => h.result === "correct");
                    const hasNoAnswer = cd.history.some(h => h.result === "no_answer" || h.result === "skipped");
                    const isDone = hasCorrect || hasNoAnswer;
                    const lastResult = cd.history[cd.history.length - 1];
                    const attachment = getAttachment(ti, ni);
                    const isLocked = getLocalLock(ti, ni);

                    return (
                      <div key={ni}>
                        <div onClick={() => {
                          // Clicking on a cell just expands it locally; doesn't auto-start timer
                          setExpandedTopics(prev => { const next = new Set(prev); next.add(ti); return next; });
                        }} style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "9px 16px 9px 28px",
                          cursor: "pointer",
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
                          {attachment?.image && <span style={{ fontSize: 12 }}>{"\uD83D\uDDBC\uFE0F"}</span>}
                          {attachment?.text && <span style={{ fontSize: 12 }}>{"\uD83D\uDCDD"}</span>}
                          {isLocked && <span style={{ fontSize: 12 }}>{"\uD83D\uDD12"}</span>}
                          {isDone && (
                            <button onClick={e => { e.stopPropagation(); setExpandedCell(expandedCell === cellKey(ti, ni) ? null : cellKey(ti, ni)); }} style={{
                              background: expandedCell === cellKey(ti, ni) ? "rgba(245,200,0,0.15)" : "#1e2940",
                              border: expandedCell === cellKey(ti, ni) ? "1px solid #f5c800" : "none",
                              borderRadius: 3, padding: "3px 8px",
                              fontSize: 10, color: expandedCell === cellKey(ti, ni) ? "#f5c800" : "#8899aa", cursor: "pointer", fontFamily: "inherit",
                            }}>TARIX</button>
                          )}
                        </div>

                        {(isActive || expandedCell === cellKey(ti, ni)) && (
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
                                <Btn size="sm" variant="danger" style={{ width: "100%" }} onClick={() => {
                                  emitEvent("reset-cell", { ti, ni });
                                  setExpandedCell(null);
                                }}>
                                  {"\uD83D\uDD04"} Natijani bekor qilish
                                </Btn>
                              </>
                            ) : (
                              <>
                                {attachment?.image && (
                                  <div style={{ marginBottom: 10, position: "relative" }}>
                                    <img src={attachment.image} alt="" onClick={() => setLightboxSrc(attachment.image)} style={{ maxWidth: "100%", borderRadius: 4, maxHeight: 120, objectFit: "cover", cursor: "pointer" }} />
                                    <button onClick={() => removeAttachment(ti, ni, "image")} style={{ position: "absolute", top: 4, right: 4, background: "#e63946", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: 11, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2715"}</button>
                                  </div>
                                )}
                                {attachment?.text && (
                                  <div style={{ marginBottom: 10, position: "relative" }}>
                                    <div style={{ background: "#1e2940", borderRadius: 4, padding: "10px 12px", fontSize: 13, color: "#f0f4ff", lineHeight: 1.5 }}>{attachment.text}</div>
                                    <button onClick={() => removeAttachment(ti, ni, "text")} style={{ position: "absolute", top: 4, right: 4, background: "#e63946", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: 11, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2715"}</button>
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
                                  <button onClick={() => toggleLocalLock(ti, ni)} style={{
                                    background: isLocked ? "rgba(243,156,18,0.15)" : "#1e2940",
                                    border: `1px solid ${isLocked ? "#f39c12" : "#2a3a52"}`,
                                    borderRadius: 4, padding: "6px 12px", cursor: "pointer",
                                    color: isLocked ? "#f39c12" : "#8899aa", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                                  }}>{isLocked ? "\uD83D\uDD12 Bloklangan" : "\uD83D\uDD13 Qulf"}</button>
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
                                    <div style={{ fontSize: 10, color: "#8899aa", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase" }}>Javob tartibi</div>
                                    {buzzOrder.map((b, i) => (
                                      <div key={b.socketId} style={{
                                        display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 4, marginBottom: 4,
                                        background: i === 0 ? "rgba(46,204,113,0.12)" : "rgba(255,255,255,0.03)",
                                        border: i === 0 ? "1px solid #2ecc71" : "1px solid transparent",
                                      }}>
                                        <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 16, color: i === 0 ? "#2ecc71" : "#8899aa", minWidth: 18, flexShrink: 0 }}>{i + 1}</span>
                                        <span style={{ flex: 1, fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{b.name}</span>
                                        {i > 0 && <span style={{ fontSize: 10, color: "#8899aa", flexShrink: 0 }}>+{b.effectiveTime - buzzOrder[0].effectiveTime}ms</span>}
                                        {i === 0 && (
                                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                            <button onClick={() => judge("correct")} style={{ background: "#2ecc71", border: "none", borderRadius: 3, padding: "4px 10px", cursor: "pointer", fontWeight: 700, color: "#0a0e1a", fontSize: 11, fontFamily: "inherit", whiteSpace: "nowrap" }}>{"\u2713"} {`TO${T}G${T}RI`}</button>
                                            <button onClick={() => judge("wrong")} style={{ background: "#e63946", border: "none", borderRadius: 3, padding: "4px 10px", cursor: "pointer", fontWeight: 700, color: "#fff", fontSize: 11, fontFamily: "inherit", whiteSpace: "nowrap" }}>{"\u2717"} {`NOTO${T}G${T}RI`}</button>
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
                  <div onClick={() => toggleScorePanel(scorePanelTi)}
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
                        const ni = activeNominals.indexOf(n);
                        if (ni === -1) return;
                        emitEvent("correct-score", { playerId: sid, ti: scorePanelTi, ni });
                      }}
                    />
                  )}
                </div>
              );
            })}
            {topicScores.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#445566", fontSize: 13 }}>
                Taymerni boshlang — natijalar shu yerda ko{T}rinadi
              </div>
            )}
            {topicScores.length > 0 && (
              <div style={{ fontSize: 11, color: "#445566", marginTop: 4 }}>{`Katakchani bosib natijani o${T}zgartirish mumkin (null \u2192 to${T}g${T}ri \u2192 noto${T}g${T}ri \u2192 null)`}</div>
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
