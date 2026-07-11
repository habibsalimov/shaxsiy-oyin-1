import { useState, useEffect } from "react";
import { NOMINAL_PRESETS, T } from '../utils/constants.js';
import { emitEvent, onEvent } from '../socket.js';
import { Btn, Badge, Label, Input, SectionToggle } from './ui/index.js';
import { SettingsPanel } from './SettingsPanel.jsx';
import { ThemeToggle } from '../theme.jsx';

export function LandingScreen({ connected, onHostCreated, onPlayerJoined, errorMsg }) {
  const [hostName, setHostName] = useState("");
  const [rounds, setRounds] = useState("5");
  const [topics, setTopics] = useState("");
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({
    timer: "7",
    selectedPreset: 0,
    wrongAnswerLimit: "3",
    queuedAnswers: false,
    falstart: false,
    latencyCompensation: true,
    timerStartSound: "gudok",
    buzzerSound: "pop",
    timerEndSound: "ding",
    falstartSound: "error",
  });
  const [hostError, setHostError] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [gameCode, setGameCode] = useState("");
  const [playerError, setPlayerError] = useState("");

  const topicCount = topics.split("\n").filter(t => t.trim()).length;

  const handleHost = () => {
    if (!hostName.trim()) { setHostError("Ismingizni kiriting"); return; }
    setHostError("");
    // Store host name so reconnect handler can use it
    sessionStorage.setItem("game-session-pending", JSON.stringify({ isHost: true, playerName: hostName.trim() }));
    emitEvent("create-room", {
      hostName: hostName.trim(),
      rounds: parseInt(rounds) || 5,
      topics: topics.split("\n").map(s => s.trim()).filter(Boolean),
      nominals: NOMINAL_PRESETS[settings.selectedPreset],
      timer: settings.timer,
      wrongAnswerLimit: settings.wrongAnswerLimit,
      queuedAnswers: settings.queuedAnswers,
      falstart: settings.falstart,
      latencyCompensation: settings.latencyCompensation,
      timerStartSound: settings.timerStartSound,
      buzzerSound: settings.buzzerSound,
      timerEndSound: settings.timerEndSound,
      falstartSound: settings.falstartSound,
    });
  };

  const [joinPending, setJoinPending] = useState(false);

  const handlePlayer = () => {
    if (!playerName.trim()) { setPlayerError("Ismingizni kiriting"); return; }
    if (gameCode.length < 4) { setPlayerError(`O${T}yin kodini kiriting`); return; }
    setPlayerError("");
    setJoinPending(true);
    emitEvent("join-room", { code: gameCode, playerName: playerName.trim() });
  };

  useEffect(() => {
    if (!joinPending) return;
    const unsub = onEvent("game-state", () => {
      unsub();
      setJoinPending(false);
      sessionStorage.setItem("game-session", JSON.stringify({ roomCode: gameCode, isHost: false, playerName: playerName.trim() }));
      onPlayerJoined();
    });
    return () => { unsub(); setJoinPending(false); };
  }, [joinPending, gameCode, playerName, onPlayerJoined]);

  const card = {
    background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "28px 24px", display: "flex", flexDirection: "column", flex: 1, minWidth: 280,
  };

  const settingsSummary = `— taymer: ${settings.timer}s · xato: ${settings.wrongAnswerLimit || 3} · navbat: ${settings.queuedAnswers ? "yoniq" : `o${T}chiq`} · ${NOMINAL_PRESETS[settings.selectedPreset].join("/")} · falstart: ${settings.falstart ? "yoniq" : `o${T}chiq`} · ping: ${settings.latencyCompensation ? "yoniq" : `o${T}chiq`}`;

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", animation: "fadeIn 0.4s ease both" }}>
      <div style={{ position: "absolute", top: "calc(16px + env(safe-area-inset-top))", right: "calc(16px + env(safe-area-inset-right))", zIndex: 10 }}>
        <ThemeToggle />
      </div>

      <div style={{ textAlign: "center", padding: "calc(40px + env(safe-area-inset-top)) 24px 28px" }}>
        <div style={{ marginBottom: 8 }}>
          <Badge color="yellow">Zakovat klubi bilimdonlari uchun</Badge>
        </div>
        <div style={{
          fontFamily: "'Anton', 'Arial Black', sans-serif",
          fontSize: "clamp(42px, 10vw, 80px)", lineHeight: 1.0,
          color: "var(--title-color)", letterSpacing: "0.06em",
          textShadow: "0 0 80px var(--accent-glow)", marginBottom: 8,
        }}>
          {`SHAXSIY O${T}YIN`}
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, letterSpacing: "0.04em" }}>
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
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 22, letterSpacing: "0.08em", color: "var(--text)", marginBottom: 4 }}>
              {`O${T}YIN YARATISH`}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Sozlamalarni kiriting va o{T}yinni boshlang</div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <Label>Boshlovchi ismi <span style={{ color: "var(--red)" }}>*</span></Label>
            <Input
              value={hostName}
              onChange={e => { setHostName(e.target.value); if (e.target.value.trim()) setHostError(""); }}
              placeholder="Ismingizni kiriting"
              style={hostError ? { borderColor: "var(--red)" } : {}}
            />
            {hostError && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 5 }}>⚠ {hostError}</div>}
          </div>

          <div style={{ marginBottom: 12 }}>
            <Label>Raundlar soni</Label>
            <Input value={rounds} onChange={e => setRounds(e.target.value)} type="number" placeholder="0 = cheksiz" />
            <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 4 }}>0 = cheksiz o{T}yin</div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)", marginBottom: 4 }}>
            <SectionToggle label="Sozlamalar" extra={settingsSummary} isOpen={settingsOpen} onToggle={() => setSettingsOpen(o => !o)} />
            {settingsOpen && <SettingsPanel settings={settings} onChange={setSettings} showHostName={false} />}
          </div>

          <div style={{ borderTop: "1px solid var(--border)", marginBottom: 16 }}>
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
                    background: "var(--bg-input)", border: "2px solid var(--border-input)",
                    color: "var(--text)", fontFamily: "inherit", fontSize: 12,
                    borderRadius: 4, padding: "10px 12px", width: "100%",
                    minHeight: 100, resize: "vertical", outline: "none",
                    boxSizing: "border-box", marginTop: 6,
                  }}
                  onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={e => (e.target.style.borderColor = "var(--border-input)")}
                />
                <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 4 }}>Har qatorda bitta mavzu</div>
              </div>
            )}
          </div>

          <div style={{ flex: 1 }} />
          <Btn style={{ width: "100%" }} onClick={handleHost}>{`O${T}YINNI BOSHLASH`}</Btn>
        </div>

        <div style={card}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 22, letterSpacing: "0.08em", color: "var(--text)", marginBottom: 4 }}>
              {`O${T}YINGA QO${T}SHILISH`}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Ism va o{T}yin kodini kiriting</div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <Label>Ismingiz <span style={{ color: "var(--red)" }}>*</span></Label>
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

          {playerError && <div style={{ fontSize: 11, color: "var(--red)", marginBottom: 8 }}>⚠ {playerError}</div>}
          {errorMsg && <div style={{ fontSize: 11, color: "var(--red)", marginBottom: 8, padding: "6px 10px", background: "var(--red-bg)", borderRadius: 4, border: "1px solid var(--red)" }}>⚠ {errorMsg}</div>}
          <div style={{ flex: 1 }} />
          <Btn variant="green" style={{ width: "100%" }} onClick={handlePlayer}>{`QO${T}SHILISH`}</Btn>
        </div>
      </div>

      <div style={{ textAlign: "center", paddingBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "var(--green)" : "var(--red)", boxShadow: connected ? "0 0 6px var(--green)" : "0 0 6px var(--red)", display: "inline-block" }} />
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{connected ? "Server bilan ulanildi" : "Server bilan aloqa yo\u2018q"}</span>
      </div>

      <div style={{ textAlign: "center", paddingBottom: 24, fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.03em" }}>
        Tizim yaratuvchisi: <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Xushnudbek Xudayberdiyev</span>
      </div>
    </div>
  );
}
