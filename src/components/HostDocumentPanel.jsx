import { T } from "../utils/constants.js";
import { toGoogleDocsPreviewUrl } from "../utils/documentLinks.js";

export function HostDocumentPanel({ document, zoom = 100, onZoom, onClose, onReplace }) {
  if (!document) return null;

  const isImage = document.kind === "image";
  const isFrame = document.kind === "frame";
  const isHtml = document.kind === "html";
  const zoomScale = Math.max(0.5, Math.min(2, zoom / 100));
  const frameUrl = document.source === "google-docs" ? toGoogleDocsPreviewUrl(document.originalUrl || document.url) || document.url : document.url;
  const scaledFrameStyle = {
    width: `${zoom}%`,
    minHeight: `${Math.max(720, 720 * zoomScale)}px`,
  };
  const zoomButtonStyle = {
    width: 30,
    height: 30,
    borderRadius: 4,
    background: "var(--bg-input)",
    border: "1px solid var(--border-strong)",
    color: "var(--text)",
    cursor: "pointer",
    fontSize: 15,
    fontWeight: 900,
    fontFamily: "inherit",
    lineHeight: 1,
  };

  return (
    <section style={{
      height: "100%", minHeight: 0, display: "flex", flexDirection: "column",
      background: "var(--bg-card)", borderRight: "1px solid var(--border)",
    }}>
      <div style={{
        height: 48, flexShrink: 0, display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 10, padding: "8px 12px",
        borderBottom: "1px solid var(--border)", background: "var(--header-bg)",
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
            Savollar hujjati
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {document.title || `Hujjat`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
          <button onClick={() => onZoom?.("out")} style={zoomButtonStyle} title="Kichraytirish">{"\u2212"}</button>
          <button onClick={() => onZoom?.("reset")} style={{ ...zoomButtonStyle, width: 54, fontSize: 11 }} title="Asl hajm">
            {zoom}%
          </button>
          <button onClick={() => onZoom?.("in")} style={zoomButtonStyle} title="Kattalashtirish">{"+"}</button>
          <button onClick={onReplace} style={{
            background: "var(--bg-input)", border: "1px solid var(--border-strong)",
            color: "var(--text-secondary)", borderRadius: 4, padding: "7px 9px",
            cursor: "pointer", fontSize: 12, fontWeight: 800, fontFamily: "inherit",
          }}>Almashtirish</button>
          <button onClick={onClose} style={{
            background: "var(--red-bg-strong)", border: "1px solid var(--red)",
            color: "var(--red)", borderRadius: 4, padding: "7px 9px",
            cursor: "pointer", fontSize: 12, fontWeight: 900, fontFamily: "inherit",
          }}>{"\u2715"}</button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, background: "var(--bg)", overflow: "auto" }}>
        {isFrame && (
          <div style={{ ...scaledFrameStyle, minHeight: "100%" }}>
            <iframe
              src={frameUrl}
              title={document.title || "Hujjat"}
              style={{
                width: `${100 / zoomScale}%`,
                height: `${100 / zoomScale}%`,
                minHeight: 720,
                border: "none",
                background: "#fff",
                transform: `scale(${zoomScale})`,
                transformOrigin: "top left",
              }}
            />
          </div>
        )}
        {isImage && (
          <div style={{ minHeight: "100%", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 18 }}>
            <img
              src={document.url}
              alt={document.title || "Hujjat"}
              style={{ width: `${zoom}%`, maxWidth: "none", height: "auto", borderRadius: 6 }}
            />
          </div>
        )}
        {isHtml && (
          <article
            style={{
              minHeight: "100%", background: "#fff", color: "#222",
              padding: "34px 42px", fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: 18 * zoomScale, lineHeight: 1.58,
            }}
            dangerouslySetInnerHTML={{ __html: document.html || "" }}
          />
        )}
        {!isFrame && !isImage && !isHtml && (
          <div style={{ padding: 20, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Bu faylni brauzer ichida ko{T}rsatib bo{T}lmadi. PDF, DOCX, rasm yoki Google Docs havolasini sinab ko{T}ring.
          </div>
        )}
      </div>
    </section>
  );
}
