import { NOMINAL_PRESETS, T } from '../utils/constants.js';
import { Label } from './ui/index.js';
import { Input } from './ui/index.js';
import { Toggle } from './ui/index.js';

export function SettingsPanel({ settings, onChange }) {
  const { timer, selectedPreset, falstart } = settings;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 10, animation: "fadeIn 0.2s ease both" }}>
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
                background: selectedPreset === idx ? "rgba(245,200,0,0.1)" : "transparent",
                border: `1px solid ${selectedPreset === idx ? "#f5c800" : "#1e2940"}`,
                borderRadius: 4, padding: "8px 12px", cursor: "pointer",
                fontFamily: "inherit", textAlign: "left", transition: "all 0.12s",
              }}>
              <span style={{
                width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${selectedPreset === idx ? "#f5c800" : "#445566"}`,
                background: selectedPreset === idx ? "#f5c800" : "transparent",
                display: "inline-block",
              }} />
              <span style={{
                fontFamily: "'Anton', sans-serif", fontSize: 15,
                letterSpacing: "0.04em", color: selectedPreset === idx ? "#f5c800" : "#8899aa",
              }}>
                {preset.join(" / ")}
              </span>
              {idx === 0 && <span style={{ fontSize: 10, color: "#445566", marginLeft: 4 }}>standart</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{ borderTop: "1px solid #1e2940", paddingTop: 14 }}>
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
    </div>
  );
}
