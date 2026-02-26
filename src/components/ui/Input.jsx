export function Input({ value, onChange, placeholder, type = "text", style = {}, ...rest }) {
  return (
    <input
      type={type} value={value} onChange={onChange} placeholder={placeholder}
      style={{
        background: "#1e2940", border: "2px solid #445566", color: "#f0f4ff",
        fontFamily: "inherit", fontSize: 14, borderRadius: 4, padding: "11px 14px",
        width: "100%", outline: "none", boxSizing: "border-box", ...style
      }}
      onFocus={e => (e.target.style.borderColor = "#f5c800")}
      onBlur={e => (e.target.style.borderColor = "#445566")}
      {...rest}
    />
  );
}
