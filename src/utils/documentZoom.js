const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function getNextDocumentZoom(currentZoom, action) {
  const zoom = Number.isFinite(currentZoom) ? currentZoom : 100;
  if (action === "reset") return 100;
  if (action === "in") return clampZoom(zoom + ZOOM_STEP);
  if (action === "out") return clampZoom(zoom - ZOOM_STEP);
  return clampZoom(zoom);
}
