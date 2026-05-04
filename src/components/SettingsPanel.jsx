import { useState } from 'react';
import { NOMINAL_PRESETS, T } from '../utils/constants.js';
import { Label } from './ui/index.js';
import { Input } from './ui/index.js';
import { Toggle } from './ui/index.js';
import { playGameSound } from '../utils/sounds.js';

const SOUND_OPTIONS = [
  { value: "button", label: "Button" },
  { value: "ding", label: "Ding" },
  { value: "game-menu", label: "Game menu" },
  { value: "happy", label: "Happy" },
  { value: "join", label: "Join" },
  { value: "notification", label: "Notification" },
  { value: "paper-fold", label: "Paper fold" },
  { value: "pop", label: "Pop" },
  { value: "off", label: `O${T}chiq` },
];

const FALSTART_SOUND_OPTIONS = [
  { value: "error", label: "Error signali" },
  { value: "off", label: `O${T}chirilgan` },
];

const TIMER_START_SOUND_OPTIONS = [
  { value: "gudok", label: "Gudok signali" },
  { value: "off", label: `O${T}chirilgan` },
];

export function SettingsPanel({ settings, onChange, onResetAllScores }) {
  const {
    hostName = "",
    timer,
    selectedPreset,
    wrongAnswerLimit = 3,
    queuedAnswers = false,
    falstart,
    latencyCompensation = true,
    timerStartSound = "gudok",
    buzzerSound = "pop",
    timerEndSound = "ding",
    falstartSound = "error",
  } = settings;
  const [resetArmed, setResetArmed] = useState(false);

  const previewAndChange = (patch) => {
    const sound = patch.timerStartSound ?? patch.buzzerSound ?? patch.timerEndSound ?? patch.falstartSound;
    playGameSound(sound);
    onChange({ ...settings, ...patch });
  };

  const selectStyle = {
    background: "var(--bg-input)",
    border: "2px solid var(--border-input)",
    color: "var(--text)",
    fontFamily: "inherit",
    fontSize: 13,
    borderRadius: 4,
    padding: "9px 10px",
    outline: "none",
    width: "100%",
    maxWidth: 220,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 10, animation: "fadeIn 0.2s ease both" }}>
      <div>
        <Label>Boshlovchi ismi</Label>
        <Input
          value={hostName}
          onChange={e => onChange({ ...settings, hostName: e.target.value })}
          placeholder="Boshlovchi ismini kiriting"
          style={{ maxWidth: 260 }}
        />
      </div>

      <div>
        <Label>Taymer (soniya)</Label>
        <Input
          value={timer}
          onChange={e => onChange({ ...settings, timer: e.target.value })}
          type="number"
          style={{ maxWidth: 160 }}
        />
      </div>

      <div>
        <Label>Ballar to{T}plami</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          {NOMINAL_PRESETS.map((preset, idx) => (
            <button key={idx}
              onClick={() => onChange({ ...settings, selectedPreset: idx })}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: selectedPreset === idx ? "var(--accent-bg)" : "transparent",
                border: `1px solid ${selectedPreset === idx ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 4, padding: "8px 12px", cursor: "pointer",
                fontFamily: "inherit", textAlign: "left", transition: "all 0.12s",
              }}>
              <span style={{
                width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${selectedPreset === idx ? "var(--accent)" : "var(--border-input)"}`,
                background: selectedPreset === idx ? "var(--accent)" : "transparent",
                display: "inline-block",
              }} />
              <span style={{
                fontFamily: "'Anton', sans-serif", fontSize: 15,
                letterSpacing: "0.04em", color: selectedPreset === idx ? "var(--accent)" : "var(--text-secondary)",
              }}>
                {preset.join(" / ")}
              </span>
              {idx === 0 && <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 4 }}>standart</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <div style={{ marginBottom: 14 }}>
          <Label>Nechta noto{T}g{T}ri javobgacha</Label>
          <Input
            value={wrongAnswerLimit}
            onChange={e => onChange({ ...settings, wrongAnswerLimit: e.target.value })}
            type="number"
            min="1"
            style={{ maxWidth: 160 }}
          />
          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 4 }}>
            Minimum 1. Limitga yetganda savol bloklanadi.
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <Toggle
            value={queuedAnswers}
            onChange={val => onChange({ ...settings, queuedAnswers: val })}
            label="Navbatli javob berish"
            description={
              queuedAnswers
                ? "Yoniq — birinchi bosgandan keyin boshqalar ham navbatga turadi. Xato javobdan keyin huquq keyingi navbatdagiga o‘tadi."
                : "O‘chiq (standart) — javob huquqi faqat birinchi bosganda. Qisqa kechikkanlar ro‘yxatda ko‘rinadi, lekin navbat huquqi olmaydi."
            }
          />
        </div>
        <Toggle
          value={falstart}
          onChange={val => onChange({ ...settings, falstart: val })}
          label="Falstart"
          description={
            falstart
              ? `Yoniq — boshlovchi taymer tugmasini bosmagunicha bilimdon javob bera olmaydi.`
              : `O\u2018chiq (standart) — bilimdonlar savolning birinchi so\u2018zidan keyinoq javob berish tugmasini bosa oladi.`
          }
        />
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <Toggle
          value={latencyCompensation}
          onChange={val => onChange({ ...settings, latencyCompensation: val })}
          label="Ping kompensatsiyasi"
          description={
            latencyCompensation
              ? "Yoniq — interneti sekinroq ishtirokchining kechikishi taxminan hisobga olinadi. Buzzer tartibi adolatliroq chiqadi."
              : `O\u2018chiq — kompensatsiya ishlamaydi. Kimning bosgani serverga oldin yetib kelsa, o${T}sha birinchi hisoblanadi.`
          }
        />
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <Label>Taymerning start ovozi</Label>
          <select
            value={timerStartSound}
            onChange={e => previewAndChange({ timerStartSound: e.target.value })}
            style={selectStyle}
          >
            {TIMER_START_SOUND_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <Label>Bosilgan tugma ovozi</Label>
          <select
            value={buzzerSound}
            onChange={e => previewAndChange({ buzzerSound: e.target.value })}
            style={selectStyle}
          >
            {SOUND_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <Label>Taymer tugash ovozi</Label>
          <select
            value={timerEndSound}
            onChange={e => previewAndChange({ timerEndSound: e.target.value })}
            style={selectStyle}
          >
            {SOUND_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        {falstart && (
          <div>
            <Label>Falstart ovozi</Label>
            <select
              value={falstartSound}
              onChange={e => previewAndChange({ falstartSound: e.target.value })}
              style={selectStyle}
            >
              {FALSTART_SOUND_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {onResetAllScores && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          {resetArmed ? (
            <div style={{ border: "1px solid rgba(230,57,70,0.4)", borderRadius: 6, padding: "10px 12px", background: "rgba(230,57,70,0.06)" }}>
              <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 10, lineHeight: 1.45 }}>
                {`Barcha ballar va savol tarixi tozalanadi. O${T}yinchilar va mavzular saqlanadi.`}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => { onResetAllScores(); setResetArmed(false); }}
                  style={{ flex: 1, background: "var(--red)", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800, padding: "9px 10px", textTransform: "uppercase" }}
                >
                  Ha, tozalash
                </button>
                <button
                  onClick={() => setResetArmed(false)}
                  style={{ flex: 1, background: "var(--bg-input)", border: "1px solid var(--border-strong)", borderRadius: 4, color: "var(--text-secondary)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800, padding: "9px 10px", textTransform: "uppercase" }}
                >
                  Bekor
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setResetArmed(true)}
              style={{ width: "100%", background: "var(--red-bg-strong)", border: "1px solid var(--red)", borderRadius: 4, color: "var(--red)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800, padding: "10px 12px", textTransform: "uppercase", letterSpacing: "0.04em" }}
            >
              Barcha ballarni tozalash
            </button>
          )}
        </div>
      )}
    </div>
  );
}
