export function Toggle({ value, onChange, label, description }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>{description}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
          background: value ? "var(--accent)" : "var(--bg-input)",
          position: "relative", transition: "background 0.2s", flexShrink: 0, marginTop: 2,
          boxShadow: value ? "0 0 12px var(--accent-glow)" : "none",
        }}
      >
        <span style={{
          position: "absolute", top: 3, left: value ? 23 : 3,
          width: 18, height: 18, borderRadius: "50%",
          background: value ? "var(--bg)" : "var(--border-input)",
          transition: "left 0.2s",
        }} />
      </button>
    </div>
  );
}
