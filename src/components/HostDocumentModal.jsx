import { useState } from "react";
import { T } from "../utils/constants.js";
import { toGoogleDocsPreviewUrl } from "../utils/documentLinks.js";

export function HostDocumentModal({ onClose, onOpenFile, onOpenGoogleDoc }) {
  const [googleLink, setGoogleLink] = useState("");
  const [error, setError] = useState("");

  const openGoogleDoc = () => {
    const previewUrl = toGoogleDocsPreviewUrl(googleLink);
    if (!previewUrl) {
      setError("Google Docs havolasini to‘g‘ri kiriting");
      return;
    }
    setError("");
    onOpenGoogleDoc({ title: "Google Docs", url: previewUrl, originalUrl: googleLink.trim() });
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.62)", backdropFilter: "blur(5px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, animation: "fadeIn 0.15s ease both",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--bg-card)", border: "1px solid var(--border-strong)",
        borderRadius: 14, width: "min(760px, 94vw)", maxHeight: "86vh",
        overflowY: "auto", padding: "24px 28px",
        boxShadow: "0 20px 70px rgba(0,0,0,0.35)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 26, letterSpacing: "0.06em", color: "var(--text)" }}>
              Hujjat ochish
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
              Savollar faylini boshlovchi ekranida yonma-yon ko{T}ring.
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 38, height: 38, borderRadius: "50%", border: "1px solid var(--border)",
            background: "var(--bg-input)", color: "var(--text-secondary)",
            cursor: "pointer", fontSize: 20, lineHeight: 1,
          }}>{"\u2715"}</button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <section style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 18, background: "var(--bg-section)" }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: "var(--text)", marginBottom: 6 }}>Kompyuterdan</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45, marginBottom: 14 }}>
              PDF, DOCX, rasm yoki matn/html fayl tanlang. Fayl faqat sizning brauzeringizda ochiladi.
            </div>
            <label style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: "var(--accent)", color: "var(--bg)", borderRadius: 6,
              padding: "11px 20px", fontWeight: 900, cursor: "pointer",
              fontFamily: "inherit", letterSpacing: "0.03em",
            }}>
              Fayl tanlash
              <input
                type="file"
                accept=".pdf,.docx,image/*,text/plain,text/html,.html,.htm"
                style={{ display: "none" }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) onOpenFile(file);
                  e.target.value = "";
                }}
              />
            </label>
          </section>

          <section style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 18, background: "var(--bg-section)" }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: "var(--text)", marginBottom: 6 }}>Google Docs</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45, marginBottom: 14 }}>
              Public Google Docs havolasini kiriting. Hujjat iframe orqali ochiladi.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                value={googleLink}
                onChange={e => { setGoogleLink(e.target.value); setError(""); }}
                onKeyDown={e => { if (e.key === "Enter") openGoogleDoc(); }}
                placeholder="https://docs.google.com/document/d/..."
                style={{
                  flex: "1 1 360px", minWidth: 0,
                  background: "var(--bg-input)", border: `2px solid ${error ? "var(--red)" : "var(--border-input)"}`,
                  color: "var(--text)", borderRadius: 6, padding: "11px 13px",
                  fontSize: 14, fontFamily: "inherit", outline: "none",
                }}
              />
              <button onClick={openGoogleDoc} style={{
                background: "var(--green)", color: "var(--bg)", border: "none",
                borderRadius: 6, padding: "0 20px", fontWeight: 900,
                cursor: "pointer", fontFamily: "inherit", minHeight: 44,
              }}>
                Ochish
              </button>
            </div>
            {error && <div style={{ marginTop: 8, color: "var(--red)", fontSize: 12, fontWeight: 700 }}>{error}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}
