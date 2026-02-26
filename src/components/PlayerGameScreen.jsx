import { useState, useEffect, useCallback } from "react";
import { DEFAULT_NOMINALS, T } from '../utils/constants.js';
import { getTotal } from '../utils/scoring.js';
import { useTimer } from '../hooks/useTimer.js';
import { Btn, Badge, Card, Label, TimerDisplay } from './ui/index.js';
import { ScoreBoard } from './ScoreBoard.jsx';

const MOCK_PLAYERS = [
  { socketId: "p1", name: "Alibek",  latency: 12 },
  { socketId: "p2", name: "Nodira",  latency: 34 },
  { socketId: "p3", name: "Jasur",   latency: 8  },
  { socketId: "p4", name: "Malika",  latency: 55 },
];

export function PlayerGameScreen() {
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
          <Badge color="gray">{`${currentTopicIdxMock + 1}-MAVZU \xb7 ${currentNominal} BALL`}</Badge>
          {!isGenericName && <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 26, letterSpacing: "0.04em", margin: "8px 0 0" }}>{currentTopicName}</div>}
        </div>

        {phase === "active" && (
          <div style={{ maxWidth: 260, margin: "0 auto 12px", width: "100%" }}>
            <TimerDisplay timerEnd={timerEnd} timerSec={30} />
          </div>
        )}

        {phase === "buzzed" && iAmFirst && (
          <div style={{ background: "rgba(46,204,113,0.2)", border: "2px solid #2ecc71", borderRadius: 4, padding: 14, textAlign: "center", animation: "pulse 0.8s ease infinite alternate", marginBottom: 12 }}>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 26, color: "#2ecc71" }}>{"\uD83C\uDFA4"} JAVOB BERING!</div>
          </div>
        )}
        {phase === "buzzed" && !iAmFirst && myPosition >= 0 && (
          <div style={{ background: "rgba(245,200,0,0.08)", border: "1px solid #c9a200", borderRadius: 4, padding: 10, textAlign: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: "#f5c800" }}>Siz {myPosition + 1}-o'rindasiz {"\xb7"} +{Math.abs(buzzOrder[myPosition].effectiveTime - buzzOrder[0].effectiveTime)}ms</span>
          </div>
        )}
        {phase === "waiting" && <div style={{ textAlign: "center", color: "#8899aa", fontSize: 13, marginBottom: 12 }}>{"\u23F3"} Boshlovchi savolni tayyorlamoqda...</div>}

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
              {phase === "buzzed" && iAmFirst ? "\uD83C\uDFA4" : buzzed ? "\u2713" : "JAVOB"}
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
                <div style={{ padding: "9px 10px", fontFamily: "'Anton', sans-serif", fontSize: 13, color: i === 0 ? "#f5c800" : "#445566" }}>{i === 0 ? "\uD83E\uDD47" : i === 1 ? "\uD83E\uDD48" : i === 2 ? "\uD83E\uDD49" : `${i+1}`}</div>
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
                <span style={{ fontSize: 10, color: "#445566", transition: "transform 0.2s", display: "inline-block", transform: expandedDetail.has(ti) ? "rotate(90deg)" : "rotate(0deg)" }}>{"\u25B6"}</span>
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
