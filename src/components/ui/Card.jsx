export function Card({ children, style = {} }) {
  return (
    <div style={{ background: "#111827", border: "1px solid #1e2940", borderRadius: 6, padding: 20, ...style }}>
      {children}
    </div>
  );
}
