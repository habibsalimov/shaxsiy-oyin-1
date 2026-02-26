export function Badge({ children, color = "yellow" }) {
  const colors = {
    yellow: { background: "#f5c800", color: "#0a0e1a" },
    green:  { background: "#2ecc71", color: "#0a0e1a" },
    red:    { background: "#e63946", color: "#fff" },
    gray:   { background: "#445566", color: "#f0f4ff" },
    orange: { background: "#f39c12", color: "#0a0e1a" },
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
