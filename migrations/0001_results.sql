CREATE TABLE IF NOT EXISTS game_results (
  id TEXT PRIMARY KEY,
  host_name TEXT NOT NULL,
  data TEXT NOT NULL,
  player_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS game_results_created_at ON game_results(created_at DESC);
