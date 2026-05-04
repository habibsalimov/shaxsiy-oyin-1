import { useState, useEffect, useCallback, useMemo } from "react";
import { T } from '../utils/constants.js';
import { getTotal } from '../utils/scoring.js';
import { getSocketId, emitEvent } from '../socket.js';
import { Badge, TimerDisplay } from './ui/index.js';
import { ScoreBoard } from './ScoreBoard.jsx';
import { ThemeToggle } from '../theme.jsx';

export function PlayerGameScreen({ gameState, attachments: attachmentsProp }) {
  const [pressing, setPressing] = useState(false);
  const [expandedDetail, setExpandedDetail] = useState(new Set());
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(null);

  // ─── Derive everything from gameState ─────────────────────────────────────
  const mySocketId = getSocketId() || "";
  const players = gameState?.players || [];
  const myPlayer = players.find(p => p.socketId === mySocketId);
  const myPlayerId = myPlayer?.id || "";
  const nominals = gameState?.settings?.nominals || [10, 20, 30, 40, 50];
  const topicNominals = gameState?.topicNominals || [];
  const topicScores = gameState?.topicScores || [];
  const topicNames = gameState?.topicNames || [];
  const currentTopicIdx = gameState?.currentTopicIdx || 0;
  const activeCell = gameState?.activeCell;
  const timerEnd = gameState?.timerEnd;
  const buzzOrder = gameState?.buzzOrder || [];
  const roomCode = gameState?.code || "";
  const hostConnected = gameState?.hostConnected !== false;

  const currentTopicName = topicNames[currentTopicIdx] || `${currentTopicIdx + 1}-mavzu`;
  const currentNominal = activeCell ? (topicNominals[activeCell.ti] || nominals)[activeCell.ni] : null;
  const isGenericName = /^\d+-mavzu$/.test(currentTopicName);

  // ─── Falstart support ────────────────────────────────────────────────────
  const falstartEnabled = gameState?.settings?.falstart;
  const falstartBlocked = gameState?.falstartBlocked || [];
  const isFalstartBlocked = falstartBlocked.includes(myPlayerId);

  // ─── Check if already answered wrong on current cell ────────────────────
  const cellData = gameState?.cellData || {};
  const attachments = attachmentsProp || {};
  const alreadyWrong = activeCell
    ? (cellData[`${activeCell.ti}-${activeCell.ni}`]?.history || []).some(h => h.playerId === myPlayerId && h.result === "wrong")
    : false;

  // ─── Cell lock ──────────────────────────────────────────────────────────
  const cellLocked = gameState?.cellLocked || false;

  // ─── Blocked player ───────────────────────────────────────────────────
  const blockedPlayers = gameState?.blockedPlayers || [];
  const isBlocked = blockedPlayers.includes(myPlayerId);

  // ─── Derive phase ─────────────────────────────────────────────────────────
  const myBuzzed = buzzOrder.some(b => b.playerId === myPlayerId);
  const phase = !activeCell ? "waiting"
    : isBlocked ? "blocked"
      : cellLocked ? "locked"
        : isFalstartBlocked ? "falstart"
          : alreadyWrong ? "answered-wrong"
            : timerEnd ? "active"
              : myBuzzed ? "buzzed"
                : buzzOrder.length > 0 ? "active"
                  : "pre-timer";

  // ─── Compute totals (memoized) ──────────────────────────────────────────
  const grandTotals = useMemo(() =>
    players.map(p => ({
      ...p, total: topicScores.reduce((sum, ts, idx) => sum + getTotal(ts, p.id, topicNominals[idx] || nominals), 0),
    })).sort((a, b) => b.total - a.total),
    [players, topicScores, nominals, topicNominals]
  );

  const myTotal = grandTotals.find(p => p.id === myPlayerId)?.total ?? 0;
  const myRank = grandTotals.findIndex(p => p.id === myPlayerId) + 1;

  // ─── Real buzz via socket ─────────────────────────────────────────────────
  const handleBuzz = useCallback(() => {
    if ((phase !== "active" && phase !== "pre-timer") || myBuzzed || isFalstartBlocked || alreadyWrong || isBlocked) return;
    emitEvent("buzz");
  }, [phase, myBuzzed, isFalstartBlocked, alreadyWrong, isBlocked]);

  // ─── Reset image loading state on cell change ───────────────────────────
  const activeCellKey = activeCell ? `${activeCell.ti}-${activeCell.ni}` : null;
  useEffect(() => { setImgLoaded(null); }, [activeCellKey]);

  // ─── Keyboard handler ────────────────────────────────────────────────────
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

  const myPosition = buzzOrder.findIndex(b => b.playerId === myPlayerId);
  const iAmFirst = myPosition === 0;

  const toggleDetail = (ti) => setExpandedDetail(prev => {
    const next = new Set(prev);
    if (next.has(ti)) next.delete(ti); else next.add(ti);
    return next;
  });

  // ─── Null gameState: waiting screen ──────────────────────────────────────
  if (!gameState) {
    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12, animation: "pulse 1s ease infinite alternate" }}>{"\u23F3"}</div>
          <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>Kutilmoqda...</div>
          <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 6 }}>Server bilan ulanish kutilmoqda</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid var(--border)", background: "var(--header-bg)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 20, letterSpacing: "0.1em", color: "var(--accent)" }}>{`SHAXSIY O${T}YIN`}</span>
          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 12, color: "var(--text-secondary)" }}>{roomCode}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 13, color: myTotal >= 0 ? "var(--accent)" : "var(--red)" }}>{myTotal > 0 ? "+" : ""}{myTotal}</span>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>#{myRank || "-"}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--bg-input)", borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>{myPlayer?.name || "..."}</span>
          <ThemeToggle />
        </div>
      </div>

      {!hostConnected && (
        <div style={{ background: "var(--orange-bg)", borderBottom: "1px solid var(--orange)", padding: "8px 16px", textAlign: "center", fontSize: 12, color: "var(--orange)", fontWeight: 600 }}>
          ⚠ Boshlovchi bilan aloqa uzildi. Qayta ulanishini kuting...
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <Badge color="gray">{`${currentTopicIdx + 1}-MAVZU${currentNominal ? ` \xb7 ${currentNominal} BALL` : ""}`}</Badge>
          {!isGenericName && <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 26, letterSpacing: "0.04em", margin: "8px 0 0" }}>{currentTopicName}</div>}
        </div>

        {activeCell && attachments[activeCellKey] && (() => {
          const att = attachments[activeCellKey];
          const isImgReady = !att.image || imgLoaded === activeCellKey;
          return (
            <div style={{ maxWidth: 340, margin: "0 auto 12px", width: "100%" }}>
              {att.image && (
                <>
                  {!isImgReady && (
                    <div style={{ width: "100%", height: 140, borderRadius: 6, background: "linear-gradient(90deg, var(--bg-input) 25%, var(--bg-section-open) 50%, var(--bg-input) 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease infinite", marginBottom: att.text ? 8 : 0 }} />
                  )}
                  <img src={att.image} alt="" onClick={() => setLightboxSrc(att.image)}
                    onLoad={() => setImgLoaded(activeCellKey)}
                    style={{ maxWidth: "100%", borderRadius: 6, maxHeight: 200, objectFit: "contain", display: isImgReady ? "block" : "none", margin: "0 auto", marginBottom: att.text ? 8 : 0, cursor: "pointer", animation: isImgReady ? "fadeIn 0.3s ease both" : "none" }} />
                </>
              )}
              {att.text && (
                <div style={{ background: "var(--bg-input)", borderRadius: 6, padding: "12px 14px", fontSize: 14, color: "var(--text)", lineHeight: 1.5, textAlign: "center", animation: "fadeIn 0.3s ease both" }}>{att.text}</div>
              )}
            </div>
          );
        })()}

        {phase === "active" && (
          <div style={{ maxWidth: 260, margin: "0 auto 12px", width: "100%" }}>
            <TimerDisplay timerEnd={timerEnd} timerSec={gameState?.settings?.timer || 7} />
          </div>
        )}

        {phase === "buzzed" && iAmFirst && (
          <div style={{ background: "var(--green-bg-strong)", border: "2px solid var(--green)", borderRadius: 4, padding: 14, textAlign: "center", animation: "pulse 0.8s ease infinite alternate", marginBottom: 12 }}>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 26, color: "var(--green)" }}>{"\uD83C\uDFA4"} JAVOB BERING!</div>
          </div>
        )}
        {phase === "buzzed" && !iAmFirst && myPosition >= 0 && (
          <div style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-dim)", borderRadius: 4, padding: 10, textAlign: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "var(--accent)" }}>Siz {myPosition + 1}-o'rindasiz {"\xb7"} +{Math.abs(buzzOrder[myPosition].effectiveTime - buzzOrder[0].effectiveTime)}ms</span>
          </div>
        )}
        {phase === "falstart" && (
          <div style={{ background: "var(--red-bg-strong)", border: "2px solid var(--red)", borderRadius: 4, padding: 14, textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 22, color: "var(--red)" }}>{"\u26A1"} FALSTART!</div>
            <div style={{ fontSize: 12, color: "var(--red)", marginTop: 4 }}>Bu savolga javob bera olmaysiz</div>
          </div>
        )}
        {phase === "answered-wrong" && (
          <div style={{ background: "var(--red-bg)", border: "1px solid var(--red)", borderRadius: 4, padding: 10, textAlign: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "var(--red)" }}>{"\u2717"} Siz bu savolga javob berdingiz</span>
          </div>
        )}
        {phase === "blocked" && (
          <div style={{ background: "var(--red-bg-strong)", border: "2px solid var(--red)", borderRadius: 4, padding: 14, textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 22, color: "var(--red)" }}>{"\uD83D\uDEAB"} BLOKDASIZ</div>
            <div style={{ fontSize: 12, color: "var(--red)", marginTop: 4 }}>Boshlovchi sizni bloklagan</div>
          </div>
        )}
        {phase === "locked" && (
          <div style={{ background: "var(--orange-bg)", border: "1px solid var(--orange)", borderRadius: 4, padding: 10, textAlign: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "var(--orange)" }}>{"\uD83D\uDD12"} Savol bloklangan</span>
          </div>
        )}
        {phase === "pre-timer" && (
          <div style={{ textAlign: "center", color: "var(--accent)", fontSize: 13, marginBottom: 12 }}>
            {"\u23F3"} Taymer hali boshlanmagan {"\xb7"} Bosishingiz mumkin
          </div>
        )}
        {phase === "waiting" && !activeCell && (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13, marginBottom: 12 }}>
            {"\u23F3"} Boshlovchi savolni tayyorlamoqda...
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "center", padding: "4px 0", marginBottom: 14 }}>
          <div style={{ textAlign: "center" }}>
            <button
              onMouseDown={() => setPressing(true)}
              onMouseUp={() => { setPressing(false); handleBuzz(); }}
              onTouchStart={(e) => { e.preventDefault(); setPressing(true); }}
              onTouchEnd={(e) => { e.preventDefault(); setPressing(false); handleBuzz(); }}
              disabled={phase !== "active" && phase !== "pre-timer"}
              style={{
                width: 170, height: 170, borderRadius: "50%",
                border: `5px solid ${phase === "blocked" ? "var(--red)" : phase === "locked" ? "var(--orange)" : (phase === "falstart" || phase === "answered-wrong") ? "var(--red)" : phase === "buzzed" && iAmFirst ? "var(--green)" : myBuzzed ? "var(--border-input)" : "var(--accent)"}`,
                background: phase === "blocked" ? "var(--red-bg-strong)" : phase === "locked" ? "var(--orange-bg)" : (phase === "falstart" || phase === "answered-wrong") ? "var(--red-bg-strong)" : phase === "buzzed" && iAmFirst ? "var(--green)" : pressing ? "var(--accent)" : "var(--bg-input)",
                color: phase === "blocked" ? "var(--red)" : phase === "locked" ? "var(--orange)" : (phase === "falstart" || phase === "answered-wrong") ? "var(--red)" : (pressing || (phase === "buzzed" && iAmFirst)) ? "var(--bg)" : myBuzzed ? "var(--border-input)" : "var(--accent)",
                fontFamily: "'Anton', sans-serif", fontSize: 30, letterSpacing: "0.08em",
                cursor: (phase === "active" || phase === "pre-timer") && !myBuzzed ? "pointer" : "default",
                transition: "all 0.1s", transform: pressing ? "scale(0.92)" : "scale(1)",
                boxShadow: phase === "active" && !myBuzzed ? "0 0 40px var(--accent-glow)" : phase === "pre-timer" ? "0 0 30px var(--accent-glow)" : phase === "buzzed" && iAmFirst ? "0 0 50px rgba(46,204,113,0.5)" : "none",
                userSelect: "none",
              }}>
              {phase === "blocked" ? "\uD83D\uDEAB" : phase === "locked" ? "\uD83D\uDD12" : phase === "falstart" ? "\u26A1" : phase === "answered-wrong" ? "\u2717" : phase === "buzzed" && iAmFirst ? "\uD83C\uDFA4" : myBuzzed ? "\u2713" : "JAVOB"}
            </button>
            <div style={{ marginTop: 10, fontSize: 11, color: phase === "blocked" ? "var(--red)" : phase === "locked" ? "var(--orange)" : (phase === "falstart" || phase === "answered-wrong") ? "var(--red)" : "var(--text-secondary)" }}>
              {phase === "blocked" ? "Blokdasiz" : phase === "locked" ? "Savol bloklangan" : phase === "falstart" ? "Falstart! Bu savolda javob bera olmaysiz" : phase === "answered-wrong" ? "Siz bu savolga javob berdingiz" : phase === "active" ? "Bosing yoki SPACE" : phase === "pre-timer" ? "Taymer kutilmoqda \xb7 Bosing yoki SPACE" : myBuzzed ? "Siz bosdingiz!" : phase === "answering" ? "Javob kutilmoqda..." : "Kutilmoqda..."}
            </div>
          </div>
        </div>

        {buzzOrder.length > 0 && (
          <div style={{ maxWidth: 340, margin: "0 auto 14px", width: "100%" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 6, textTransform: "uppercase" }}>Javob tartibi</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {buzzOrder.map((b, i) => (
                <li key={b.playerId} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 4, marginBottom: 5,
                  background: i === 0 ? "var(--red-bg-strong)" : "var(--row-hover)",
                  border: `1px solid ${b.playerId === myPlayerId ? "var(--accent)" : i === 0 ? "var(--red)" : "transparent"}`,
                  fontWeight: 600,
                }}>
                  <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 16, color: i === 0 ? "var(--red)" : "var(--text-secondary)", minWidth: 20 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{b.name}{b.playerId === myPlayerId && <span style={{ fontSize: 10, color: "var(--text-secondary)", marginLeft: 5 }}>(Siz)</span>}</span>
                  {i > 0 && <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>+{Math.abs(b.effectiveTime - buzzOrder[0].effectiveTime)}ms</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8, textTransform: "uppercase", textAlign: "center" }}>Umumiy hisob</div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", maxWidth: 400, margin: "0 auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 70px", background: "var(--bg-section)", borderBottom: "1px solid var(--border)" }}>
              {["#", "O'YINCHI", "JAMI"].map((h, i) => (
                <div key={i} style={{ padding: "7px 10px", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: i === 2 ? "var(--accent)" : "var(--text-secondary)", textAlign: i === 2 ? "center" : "left", textTransform: "uppercase" }}>{h}</div>
              ))}
            </div>
            {grandTotals.map((p, i) => (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr 70px", background: p.id === myPlayerId ? "var(--accent-bg-subtle)" : "transparent", borderBottom: i < grandTotals.length - 1 ? "1px solid var(--row-border)" : "none" }}>
                <div style={{ padding: "9px 10px", fontFamily: "'Anton', sans-serif", fontSize: 13, color: i === 0 ? "var(--accent)" : "var(--text-muted)" }}>{i === 0 ? "\uD83E\uDD47" : i === 1 ? "\uD83E\uDD48" : i === 2 ? "\uD83E\uDD49" : `${i + 1}`}</div>
                <div style={{ padding: "9px 10px", fontWeight: 600, fontSize: 13, color: p.id === myPlayerId ? "var(--accent)" : "var(--text)" }}>{p.name}{p.id === myPlayerId && <span style={{ fontSize: 10, color: "var(--text-secondary)", marginLeft: 5 }}>(Siz)</span>}</div>
                <div style={{ padding: "9px 10px", textAlign: "center" }}>
                  <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 15, color: p.total >= 0 ? "var(--accent)" : "var(--red)" }}>{p.total > 0 ? "+" : ""}{p.total}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {topicScores.map((tScores, ti) => (
            <div key={ti} style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
              <div onClick={() => toggleDetail(ti)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", cursor: "pointer", userSelect: "none", background: expandedDetail.has(ti) ? "var(--bg-section-open)" : "var(--bg-section)", borderBottom: expandedDetail.has(ti) ? "1px solid var(--border)" : "none" }}>
                <span style={{ fontSize: 10, color: "var(--text-muted)", transition: "transform 0.2s", display: "inline-block", transform: expandedDetail.has(ti) ? "rotate(90deg)" : "rotate(0deg)" }}>{"\u25B6"}</span>
                <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 12, letterSpacing: "0.06em", color: "var(--text-secondary)", flex: 1 }}>{ti + 1}. {topicNames[ti] || `${ti + 1}-mavzu`}</span>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>batafsil</span>
              </div>
              {expandedDetail.has(ti) && (
                <ScoreBoard scores={tScores} players={players} nominals={topicNominals[ti] || nominals} currentNominal={null} isHost={false} allTopicScores={topicScores} topicNominals={topicNominals} />
              )}
            </div>
          ))}
        </div>
      </div>
      {lightboxSrc && (
        <div onClick={() => setLightboxSrc(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <button onClick={() => setLightboxSrc(null)} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "#fff", fontSize: 28, cursor: "pointer", zIndex: 1 }}>{"\u2715"}</button>
          <img src={lightboxSrc} alt="" onClick={e => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8, cursor: "default" }} />
        </div>
      )}
    </div>
  );
}
