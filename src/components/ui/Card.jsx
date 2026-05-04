export function Card({ children, style = {} }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: 20, ...style }}>
      {children}
    </div>
  );
}
