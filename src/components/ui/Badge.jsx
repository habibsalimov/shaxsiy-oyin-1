export function Badge({ children, color = "yellow" }) {
  const colors = {
    yellow: { background: "var(--accent)", color: "var(--bg)" },
    green: { background: "var(--green)", color: "var(--bg)" },
    red: { background: "var(--red)", color: "#fff" },
    gray: { background: "var(--border-input)", color: "var(--text)" },
    orange: { background: "var(--orange)", color: "var(--bg)" },
  };
  return (
    <span style={{
      ...colors[color],
      display: "inline-block", fontSize: 10, fontWeight: 700,
      letterSpacing: "0.14em", textTransform: "uppercase",
      padding: "4px 10px", borderRadius: 2,
    }}>
      {children}
    </span>
  );
}
