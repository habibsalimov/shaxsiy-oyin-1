import { useState, useEffect } from "react";
import { T } from '../utils/constants.js';

// PWA o'rnatish taklifi:
//  - Android/Chrome/Edge: `beforeinstallprompt` orqali native o'rnatish tugmasi.
//  - iOS Safari: native prompt yo'q — qo'lda qo'llanma ("Ulashish → Bosh ekranga qo'shish").
// Ilova allaqachon o'rnatilgan (standalone) bo'lsa hech narsa ko'rsatilmaydi.

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ Mac sifatida ko'rinadi — teginish nuqtalari bilan aniqlaymiz.
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}

const DISMISS_KEY = "pwa-install-dismissed";

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (isStandalone() || dismissed) return;

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS Safari'da `beforeinstallprompt` yo'q — qo'llanma tugmasini ko'rsatamiz.
    let iosTimer;
    if (isIos() && !isStandalone()) {
      iosTimer = setTimeout(() => setVisible(true), 1200);
    }

    const onInstalled = () => { setVisible(false); setDeferredPrompt(null); };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, [dismissed]);

  const dismiss = () => {
    setVisible(false);
    setShowIosHelp(false);
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { }
  };

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch { }
      setDeferredPrompt(null);
      setVisible(false);
    } else if (isIos()) {
      setShowIosHelp(true);
    }
  };

  if (!visible || dismissed) return null;

  const ios = isIos() && !deferredPrompt;

  return (
    <div style={{
      position: "fixed",
      left: "calc(12px + env(safe-area-inset-left))",
      right: "calc(12px + env(safe-area-inset-right))",
      bottom: "calc(16px + env(safe-area-inset-bottom))",
      margin: "0 auto",
      maxWidth: 420,
      zIndex: 9998,
      background: "var(--bg-card)",
      border: "1px solid var(--border-strong)",
      borderRadius: 12,
      boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
      padding: 14,
      animation: "fadeIn 0.3s ease both",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img src="/icons/icon-192.png" alt="" width={44} height={44} style={{ borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 15, letterSpacing: "0.04em", color: "var(--text)" }}>
            {`Ilovani o${T}rnating`}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.4 }}>
            {ios
              ? `Tez kirish uchun bosh ekranga qo${T}shing`
              : `Telefoningizga ilova sifatida o${T}rnating`}
          </div>
        </div>
        <button onClick={dismiss} aria-label="Yopish" style={{
          background: "none", border: "none", color: "var(--text-muted)",
          fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1, flexShrink: 0,
        }}>{"✕"}</button>
      </div>

      {ios && showIosHelp && (
        <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--bg-input)", borderRadius: 8, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          <div style={{ marginBottom: 4 }}>
            1. Pastdagi <b style={{ color: "var(--accent)" }}>Ulashish</b> tugmasini bosing <span style={{ fontSize: 15 }}>{"↑"}</span>
          </div>
          <div>
            2. <b style={{ color: "var(--accent)" }}>{`"Bosh ekranga qo${T}shish"`}</b> ni tanlang
          </div>
        </div>
      )}

      {!showIosHelp && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={handleInstall} style={{
            flex: 1, background: "var(--accent)", color: "var(--bg)",
            border: "none", borderRadius: 8, padding: "10px 14px",
            fontFamily: "'Anton', sans-serif", fontSize: 14, letterSpacing: "0.06em",
            cursor: "pointer", fontWeight: 700,
          }}>
            {ios ? "QANDAY?" : `O${T}RNATISH`}
          </button>
          <button onClick={dismiss} style={{
            background: "var(--bg-input)", color: "var(--text-secondary)",
            border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px",
            fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
          }}>
            Keyinroq
          </button>
        </div>
      )}
    </div>
  );
}
