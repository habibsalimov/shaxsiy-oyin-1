import { useState, useEffect, useRef } from "react";
import { getTotal } from '../utils/scoring.js';
import { DEFAULT_NOMINALS } from '../utils/constants.js';

export function ScoreBoard({ scores, players, nominals: nominalsProp, currentNominal, isHost, onCellClick, allTopicScores, blockedPlayers: blockedProp, topicNominals }) {
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
              const getNomsForTopic = (idx) => topicNominals?.[idx] || nominals;
              if (isCurrentTopic) {
                return allTopicScores.reduce((sum, ts, idx) => sum + getTotal(ts, p.socketId, getNomsForTopic(idx)), 0);
              } else {
                return scores.__snapshot?.[p.socketId] ?? allTopicScores
                  .slice(0, myIdx + 1)
                  .reduce((sum, ts, idx) => sum + getTotal(ts, p.socketId, getNomsForTopic(idx)), 0);
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
