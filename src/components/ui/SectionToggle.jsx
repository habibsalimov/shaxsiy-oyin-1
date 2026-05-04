export function SectionToggle({ label, extra, isOpen, onToggle }) {
  return (
    <button onClick={onToggle} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      width: "100%", background: "none", border: "none", cursor: "pointer",
      padding: "8px 0", fontFamily: "inherit",
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-secondary)" }}>
        {label}
        {extra && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--text-muted)", fontWeight: 400, textTransform: "none" }}>{extra}</span>}
      </span>
      <span style={{ fontSize: 14, color: "var(--text-muted)", transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
    </button>
  );
}
