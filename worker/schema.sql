CREATE TABLE IF NOT EXISTS rosters (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
  id        TEXT PRIMARY KEY,
  roster_id TEXT NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL,
  name      TEXT NOT NULL,
  position  TEXT
);

CREATE TABLE IF NOT EXISTS game_formats (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  name              TEXT NOT NULL,
  team_size         INTEGER NOT NULL,
  number_of_periods INTEGER NOT NULL,
  period_duration   INTEGER NOT NULL,
  is_temporary      INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS positions (
  id             TEXT PRIMARY KEY,
  game_format_id TEXT NOT NULL REFERENCES game_formats(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL,
  name           TEXT NOT NULL,
  abbreviation   TEXT NOT NULL,
  icon           TEXT
);

CREATE TABLE IF NOT EXISTS matches (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  name            TEXT,
  team1_roster_id TEXT REFERENCES rosters(id),
  team2_roster_id TEXT REFERENCES rosters(id),
  game_format_id  TEXT REFERENCES game_formats(id),
  start_time      TEXT,
  end_time        TEXT
);

CREATE TABLE IF NOT EXISTS match_plans (
  id               TEXT PRIMARY KEY,
  match_id         TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  quarter          INTEGER NOT NULL,
  player_positions TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tournaments (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tournament_matches (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  match_id      TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  PRIMARY KEY (tournament_id, match_id)
);
