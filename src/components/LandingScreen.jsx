import { useState } from "react";
import { NOMINAL_PRESETS, T } from '../utils/constants.js';
import { emitEvent, onEvent } from '../socket.js';
import { Btn, Badge, Label, Input, SectionToggle } from './ui/index.js';
import { SettingsPanel } from './SettingsPanel.jsx';

export function LandingScreen({ connected, onHostCreated, onPlayerJoined }) {
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
    // Store host name so reconnect handler can use it
    sessionStorage.setItem("game-session-pending", JSON.stringify({ isHost: true, playerName: hostName.trim() }));
    emitEvent("create-room", {
      hostName: hostName.trim(),
      rounds: parseInt(rounds) || 5,
      topics: topics.split("\n").map(s => s.trim()).filter(Boolean),
      nominals: NOMINAL_PRESETS[settings.selectedPreset],
      timer: settings.timer,
      falstart: settings.falstart,
    });
  };

  const handlePlayer = () => {
    if (!playerName.trim()) { setPlayerError("Ismingizni kiriting"); return; }
    if (gameCode.length < 4) { setPlayerError(`O${T}yin kodini kiriting`); return; }
    setPlayerError("");
    emitEvent("join-room", { code: gameCode, playerName: playerName.trim() });
    // Listen for first game-state to confirm join success
    const unsub = onEvent("game-state", () => {
      unsub();
      // Store player session for reconnect
      sessionStorage.setItem("game-session", JSON.stringify({ roomCode: gameCode, isHost: false, playerName: playerName.trim() }));
      onPlayerJoined();
    });
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
          <Btn style={{ width: "100%" }} onClick={handleHost}>{`O${T}YINNI BOSHLASH`}</Btn>
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
          <Btn variant="green" style={{ width: "100%" }} onClick={handlePlayer}>{`QO${T}SHILISH`}</Btn>
        </div>
      </div>

      <div style={{ textAlign: "center", paddingBottom: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#2ecc71" : "#e63946", boxShadow: connected ? "0 0 6px #2ecc71" : "0 0 6px #e63946", display: "inline-block" }} />
        <span style={{ fontSize: 11, color: "#8899aa" }}>{connected ? "Server bilan ulanildi" : "Server bilan aloqa yo\u2018q"}</span>
      </div>
    </div>
  );
}
