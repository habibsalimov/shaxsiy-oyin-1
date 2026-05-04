export function Input({ value, onChange, placeholder, type = "text", style = {}, ...rest }) {
  return (
    <input
      type={type} value={value} onChange={onChange} placeholder={placeholder}
      style={{
        background: "var(--bg-input)", border: "2px solid var(--border-input)", color: "var(--text)",
        fontFamily: "inherit", fontSize: 14, borderRadius: 4, padding: "11px 14px",
        width: "100%", outline: "none", boxSizing: "border-box", ...style
      }}
      onFocus={e => (e.target.style.borderColor = "var(--accent)")}
      onBlur={e => (e.target.style.borderColor = "var(--border-input)")}
      {...rest}
    />
  );
}
