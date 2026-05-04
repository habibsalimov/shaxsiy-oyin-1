import { useState, useEffect } from "react";
import { DEFAULT_NOMINALS, T } from '../utils/constants.js';
import { getTotal } from '../utils/scoring.js';
import { Btn } from './ui/index.js';
import { ScoreBoard } from './ScoreBoard.jsx';

export function ResultsScreen({ gameResult, archiveId, onRestart }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [collapsedTopics, setCollapsedTopics] = useState(new Set());
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (gameResult) { setData(gameResult); return; }
    const hash = window.location.hash.replace("#results/", "").trim();
    if (!hash) { setLoadError(true); return; }
    // Try API first, fall back to localStorage for old saved results
    fetch(`/api/results/${hash}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setData(d))
      .catch(() => {
        window.storage.get(`results:${hash}`)
          .then(r => r ? setData(JSON.parse(r.value)) : setLoadError(true))
          .catch(() => setLoadError(true));
      });
  }, [gameResult]);

  if (loadError) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 48 }}>{"\u274C"}</div>
      <div style={{ color: "var(--red)", fontWeight: 700 }}>Natijalar topilmadi</div>
      {onRestart && <Btn onClick={onRestart}>{"\uD83C\uDFE0"} Bosh sahifaga</Btn>}
    </div>
  );
  if (!data) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ color: "var(--text-secondary)" }}>Yuklanmoqda...</div></div>;

  const nominals = data.nominals || DEFAULT_NOMINALS;
  const topicNominalsData = data.topicNominals || [];
  const topicScoresData = data.topicScores || [];
  const topicNamesData = data.topicNames || [];
  const playersData = data.players || [];
  const gameDate = data.date ? new Date(data.date) : new Date();
  const gameId = archiveId || data.id || "DEMO";

  const shareUrl = `${window.location.origin}${window.location.pathname}#results/${gameId}`;
  const copyLink = () => { navigator.clipboard?.writeText(shareUrl).catch(() => { }); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); };

  const toggleTopic = (ti) => setCollapsedTopics(prev => { const next = new Set(prev); if (next.has(ti)) next.delete(ti); else next.add(ti); return next; });

  const ranked = playersData
    .map(p => ({ ...p, total: topicScoresData.reduce((sum, ts, idx) => sum + getTotal(ts, p.id, topicNominalsData[idx] || nominals), 0) }))
    .sort((a, b) => b.total - a.total);
  const medals = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"];

  if (ranked.length === 0) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 48 }}>{"\u274C"}</div>
      <div style={{ color: "var(--red)", fontWeight: 700 }}>O{T}yinchilar topilmadi</div>
      {onRestart && <Btn onClick={onRestart}>{"\uD83C\uDFE0"} Bosh sahifaga</Btn>}
    </div>
  );

  const downloadCSV = () => {
    const header = ["\u2116", "O'yinchi", "JAMI", ...topicScoresData.flatMap((_, ti) => { const noms = topicNominalsData[ti] || nominals; return [...noms.map(n => `${ti + 1}-mavzu ${n}`), `TUR (${topicNamesData[ti] || `${ti + 1}-mavzu`})`]; })];
    const rows = [...ranked].map((p, i) => [i + 1, p.name, p.total, ...topicScoresData.flatMap((ts, ti) => { const noms = topicNominalsData[ti] || nominals; return [...noms.map(n => { const r = ts[p.id]?.[n]; return r === "correct" ? n : r === "wrong" ? -n : ""; }), getTotal(ts, p.id, noms)]; })]);
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "natijalar.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  return (
    <div style={{ minHeight: "100vh", padding: 24, display: "flex", flexDirection: "column", alignItems: "center", animation: "fadeIn 0.4s ease both" }}>
      <div style={{ maxWidth: 680, width: "100%" }}>
        <div style={{ textAlign: "center", paddingTop: 32, marginBottom: 32 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>{"\uD83C\uDFC6"}</div>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 56, lineHeight: 1, color: "var(--accent)", letterSpacing: "0.06em" }}>{`O${T}YIN TUGADI`}</div>
          <p style={{ marginTop: 10, fontSize: 16, color: "var(--text-secondary)" }}>
            {`G${T}olib: `}<strong style={{ color: "var(--text)" }}>{ranked[0].name}</strong>
            {" "}<span style={{ color: "var(--accent)" }}>+{ranked[0].total} ball</span>
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
          {ranked.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 16, background: i === 0 ? "var(--accent-bg-subtle)" : "var(--bg-card)", border: `1px solid ${i === 0 ? "var(--accent-dim)" : "var(--border)"}`, borderRadius: 4, padding: "14px 18px", animation: `fadeIn 0.3s ease ${i * 0.1}s both` }}>
              <span style={{ fontSize: 26, minWidth: 38, textAlign: "center" }}>{medals[i] || `${i + 1}.`}</span>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{p.name}</span>
              <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 26, color: p.total >= 0 ? "var(--accent)" : "var(--red)" }}>{p.total > 0 ? "+" : ""}{p.total}</span>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 18, letterSpacing: "0.06em", marginBottom: 10 }}>BATAFSIL</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 12px", marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>{"\uD83D\uDD17"} Arxiv havolasi:</span>
            <span style={{ fontSize: 11, color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shareUrl}</span>
            <button onClick={copyLink} style={{ background: linkCopied ? "var(--green-bg)" : "var(--bg-input)", border: `1px solid ${linkCopied ? "var(--green)" : "var(--border-input)"}`, borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", color: linkCopied ? "var(--green)" : "var(--text-secondary)", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
              {linkCopied ? "\u2713 Nusxalandi" : "NUSXALASH"}
            </button>
          </div>
          <button onClick={downloadCSV} style={{ background: "var(--green-bg)", border: "1px solid var(--green)", borderRadius: 4, padding: "7px 14px", cursor: "pointer", fontFamily: "inherit", color: "var(--green)", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>
            {"\u2B07"} CSV YUKLAB OLISH
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
          {topicScoresData.map((tScores, ti) => {
            const isCollapsed = collapsedTopics.has(ti);
            return (
              <div key={ti} style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
                <div onClick={() => toggleTopic(ti)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", userSelect: "none", background: isCollapsed ? "var(--bg-section)" : "var(--bg-section-open)", borderBottom: isCollapsed ? "none" : "1px solid var(--border)" }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", display: "inline-block", transition: "transform 0.2s", transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)" }}>{"\u25B6"}</span>
                  <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 13, letterSpacing: "0.06em", color: "var(--text-secondary)", flex: 1 }}>{ti + 1}. {topicNamesData[ti] || `${ti + 1}-mavzu`}</span>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>tugadi</span>
                </div>
                {!isCollapsed && <ScoreBoard scores={tScores} players={playersData} nominals={topicNominalsData[ti] || nominals} currentNominal={null} isHost={false} allTopicScores={topicScoresData} topicNominals={topicNominalsData} />}
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: "center", margin: "16px 0 8px", fontSize: 11, color: "var(--text-muted)" }}>
          {(() => { const ms = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"]; return `O'yin o'tkazilgan sana: ${gameDate.getDate()} ${ms[gameDate.getMonth()]} ${gameDate.getFullYear()}`; })()}
        </div>

        <Btn size="lg" style={{ width: "100%", marginBottom: 32 }} onClick={onRestart}>{"\uD83C\uDFE0"} BOSH SAHIFAGA</Btn>
      </div>
    </div>
  );
}
