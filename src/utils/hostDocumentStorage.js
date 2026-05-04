const DB_NAME = "shaxsiy-oyin-host-documents";
const STORE_NAME = "documents";
const META_PREFIX = "host-document:";

function getMetaKey(roomCode) {
  return `${META_PREFIX}${roomCode}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putBlob(roomCode, blob) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(blob, roomCode);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function getBlob(roomCode) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(roomCode);
    request.onsuccess = () => resolve(request.result || null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function deleteBlob(roomCode) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(roomCode);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    return null;
  }
}

function readMeta(roomCode) {
  try {
    const raw = localStorage.getItem(getMetaKey(roomCode));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeMeta(roomCode, meta) {
  try {
    localStorage.setItem(getMetaKey(roomCode), JSON.stringify(meta));
  } catch {
    // Storage is best-effort; the game should continue even if persistence fails.
  }
}

export async function saveHostDocument(roomCode, document, viewState = {}) {
  if (!roomCode || !document) return;

  const meta = {
    source: document.source,
    title: document.title,
    kind: document.kind,
    url: document.source === "file" ? null : document.url,
    originalUrl: document.originalUrl || null,
    html: document.kind === "html" ? document.html : null,
    hasBlob: !!document.blob,
    zoom: viewState.zoom || 100,
    panePct: viewState.panePct || 55,
    savedAt: Date.now(),
  };

  if (document.blob) {
    try { await putBlob(roomCode, document.blob); } catch { meta.hasBlob = false; }
  } else {
    await deleteBlob(roomCode);
  }

  writeMeta(roomCode, meta);
}

export function saveHostDocumentViewState(roomCode, viewState = {}) {
  if (!roomCode) return;
  const meta = readMeta(roomCode);
  if (!meta) return;
  writeMeta(roomCode, {
    ...meta,
    zoom: viewState.zoom || meta.zoom || 100,
    panePct: viewState.panePct || meta.panePct || 55,
  });
}

export async function loadHostDocument(roomCode) {
  if (!roomCode) return null;
  const meta = readMeta(roomCode);
  if (!meta) return null;

  let blob = null;
  let objectUrl = null;
  if (meta.hasBlob) {
    try {
      blob = await getBlob(roomCode);
      if (blob) objectUrl = URL.createObjectURL(blob);
    } catch {
      blob = null;
    }
  }

  if (meta.hasBlob && !blob) return null;

  return {
    document: {
      source: meta.source,
      title: meta.title,
      kind: meta.kind,
      url: objectUrl || meta.url,
      originalUrl: meta.originalUrl,
      html: meta.html,
      blob,
      objectUrl,
    },
    zoom: meta.zoom || 100,
    panePct: meta.panePct || 55,
  };
}

export async function clearHostDocument(roomCode) {
  if (!roomCode) return;
  try { localStorage.removeItem(getMetaKey(roomCode)); } catch { }
  await deleteBlob(roomCode);
}
