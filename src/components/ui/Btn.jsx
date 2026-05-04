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
    primary: { background: "var(--accent)", color: "var(--bg)" },
    secondary: { background: "transparent", color: "var(--text)", border: "2px solid var(--border-input)" },
    success: { background: "var(--green)", color: "var(--bg)" },
    danger: { background: "var(--red)", color: "#fff" },
    ghost: { background: "var(--bg-input)", color: "var(--text)" },
    green: { background: "var(--green)", color: "var(--bg)" },
  };
  return (
    <button style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
      onClick={disabled ? undefined : onClick}>
      {children}
    </button>
  );
}
