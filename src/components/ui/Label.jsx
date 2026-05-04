export function Label({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: 8 }}>
      {children}
    </div>
  );
}
