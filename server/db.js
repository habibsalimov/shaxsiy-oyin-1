import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "shaxsiy-oyin.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS game_results (
    id           TEXT PRIMARY KEY,
    host_name    TEXT NOT NULL,
    data         TEXT NOT NULL,
    player_count INTEGER NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const insertStmt = db.prepare(
  "INSERT OR IGNORE INTO game_results (id, host_name, data, player_count) VALUES (?, ?, ?, ?)"
);

const selectStmt = db.prepare(
  "SELECT id, host_name, data, player_count, created_at FROM game_results WHERE id = ?"
);

const listStmt = db.prepare(
  "SELECT id, host_name, player_count, created_at FROM game_results ORDER BY created_at DESC LIMIT ?"
);

export function saveResult(id, hostName, data) {
  const json = typeof data === "string" ? data : JSON.stringify(data);
  const playerCount = typeof data === "string" ? JSON.parse(data).players?.length || 0 : data.players?.length || 0;
  insertStmt.run(id, hostName, json, playerCount);
}

export function getResult(id) {
  const row = selectStmt.get(id);
  if (!row) return null;
  return {
    id: row.id,
    hostName: row.host_name,
    playerCount: row.player_count,
    createdAt: row.created_at,
    ...JSON.parse(row.data),
  };
}

export function listResults(limit = 50) {
  return listStmt.all(limit).map(row => ({
    id: row.id,
    hostName: row.host_name,
    playerCount: row.player_count,
    createdAt: row.created_at,
  }));
}
