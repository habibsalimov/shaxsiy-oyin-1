import { useState, useEffect, useRef } from "react";
import { getTotal } from '../utils/scoring.js';
import { DEFAULT_NOMINALS } from '../utils/constants.js';

export function ScoreBoard({ scores, players, nominals: nominalsProp, currentNominal, isHost, onCellClick, allTopicScores, blockedPlayers: blockedProp, topicNominals }) {
  const nominals = nominalsProp || DEFAULT_NOMINALS;
  const sep = "1px solid var(--border-strong)";
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
  const colW = Math.max(24, Math.floor((contW - nameW) / (totalCols - 1)));

  const hdrFs = colW < 30 ? 8 : colW < 38 ? 9 : 10;
  const numFs = colW < 30 ? 10 : colW < 38 ? 11 : 14;
  const nmFs = nameW < 68 ? 10 : nameW < 88 ? 11 : 12;
  const pH = colW < 30 ? 3 : colW < 38 ? 4 : 8;
  const pV = colW < 30 ? 5 : colW < 38 ? 6 : 9;

  const thS = {
    padding: `${pV}px ${pH}px`, textAlign: "center",
    fontSize: hdrFs, fontWeight: 700, letterSpacing: "0.06em",
    textTransform: "uppercase", color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
  };
  const tdS = {
    padding: `${pV}px ${pH}px`, textAlign: "center",
    borderBottom: "1px solid var(--row-border)", transition: "background 0.1s",
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
            <th style={{ ...thS, color: "var(--accent)", borderRight: sep }}>JAMI</th>
            {nominals.map(n => (
              <th key={n} style={{ ...thS, color: n === currentNominal ? "var(--accent)" : "var(--text-secondary)" }}>{n}</th>
            ))}
            <th style={{ ...thS, color: "var(--accent)", borderLeft: sep }}>TUR</th>
          </tr>
        </thead>
        <tbody>
          {players.map(p => {
            const playerId = p.id;
            const turTotal = getTotal(scores, playerId, nominals);
            const grandTotal = (() => {
              if (!allTopicScores) return turTotal;
              const myIdx = allTopicScores.indexOf(scores);
              const isCurrentTopic = myIdx === allTopicScores.length - 1;
              const getNomsForTopic = (idx) => topicNominals?.[idx] || nominals;
              if (isCurrentTopic) {
                return allTopicScores.reduce((sum, ts, idx) => sum + getTotal(ts, playerId, getNomsForTopic(idx)), 0);
              } else {
                return scores.__snapshot?.[playerId] ?? allTopicScores
                  .slice(0, myIdx + 1)
                  .reduce((sum, ts, idx) => sum + getTotal(ts, playerId, getNomsForTopic(idx)), 0);
              }
            })();
            const isBlocked = blockedSet.has(playerId);
            return (
              <tr key={playerId} style={{ opacity: isBlocked ? 0.45 : 1 }}>
                <td style={{ ...tdS, textAlign: "left", fontWeight: 600, fontSize: nmFs, borderRight: sep, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                  {isBlocked && <span style={{ fontSize: hdrFs, color: "var(--red)", marginLeft: 4, fontStyle: "italic" }}>(bloklangan)</span>}
                  {!isBlocked && nameW >= 80 && p.latency > 0 && <span style={{ fontSize: hdrFs - 1, color: "var(--text-muted)", marginLeft: 3 }}>{p.latency}ms</span>}
                </td>
                <td style={{ ...tdS, borderRight: sep }}>
                  <span style={{ fontFamily: "'Anton', sans-serif", fontSize: numFs, color: grandTotal >= 0 ? "var(--accent)" : "var(--red)" }}>
                    {grandTotal > 0 ? "+" : ""}{grandTotal}
                  </span>
                </td>
                {nominals.map(n => {
                  const r = scores[playerId]?.[n] || null;
                  const cs = r === "correct"
                    ? { background: "var(--green-bg)", color: "var(--green)", fontWeight: 700 }
                    : r === "wrong"
                      ? { background: "var(--red-bg)", color: "var(--red)", fontWeight: 700 }
                      : { color: "var(--text-muted)" };
                  return (
                    <td key={n}
                      style={{ ...tdS, ...cs, fontSize: numFs, cursor: isHost ? "pointer" : "default" }}
                      onClick={() => isHost && onCellClick && onCellClick(playerId, n)}
                      title={isHost ? `Bosib o\u2018zgartirish` : ""}>
                      {r === "correct" ? `+${n}` : r === "wrong" ? `\u2212${n}` : "\xb7"}
                    </td>
                  );
                })}
                <td style={{ ...tdS, borderLeft: sep }}>
                  <span style={{ fontFamily: "'Anton', sans-serif", fontSize: numFs, color: turTotal >= 0 ? "var(--accent)" : "var(--red)" }}>
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
