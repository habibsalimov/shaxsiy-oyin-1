export function Btn({ children, variant = "primary", size = "md", onClick, disabled, style = {} }) {
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    gap: 6, fontFamily: "inherit", fontWeight: 700,
    letterSpacing: "0.07em", textTransform: "uppercase",
    border: "none", borderRadius: 4, cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.12s", opacity: disabled ? 0.38 : 1, userSelect: "none",
  };
  const sizes = {
    sm: { fontSize: 11, padding: "7px 14px" },
    md: { fontSize: 13, padding: "11px 22px" },
    lg: { fontSize: 16, padding: "15px 34px" },
  };
  const variants = {
    primary:   { background: "#f5c800", color: "#0a0e1a" },
    secondary: { background: "transparent", color: "#f0f4ff", border: "2px solid #445566" },
    success:   { background: "#2ecc71", color: "#0a0e1a" },
    danger:    { background: "#e63946", color: "#fff" },
    ghost:     { background: "#1e2940", color: "#f0f4ff" },
    green:     { background: "#2ecc71", color: "#0a0e1a" },
  };
  return (
    <button style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
      onClick={disabled ? undefined : onClick}>
      {children}
    </button>
  );
}
