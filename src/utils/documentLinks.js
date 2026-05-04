export function toGoogleDocsPreviewUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || "").trim());
    if (url.hostname !== "docs.google.com") return null;

    const match = url.pathname.match(/^\/document\/d\/([^/]+)/);
    if (!match) return null;

    const previewUrl = new URL(`https://docs.google.com/document/d/${match[1]}/preview`);
    previewUrl.searchParams.set("rm", "minimal");
    return previewUrl.toString();
  } catch {
    return null;
  }
}
