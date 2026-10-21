let serverTimeOffsetMs = 0;

export function syncServerTime(serverNow) {
  if (typeof serverNow !== "number" || !Number.isFinite(serverNow)) return;
  serverTimeOffsetMs = serverNow - Date.now();
}

export function getSyncedNow() {
  return Date.now() + serverTimeOffsetMs;
}

export function resetServerTimeSync() {
  serverTimeOffsetMs = 0;
}
