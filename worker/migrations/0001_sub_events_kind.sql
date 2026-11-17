-- Separate planned substitutions from what actually happened in a game.
--   plan   = written by the match plan editor / tournament scheduler
--   actual = written by the live game tracker
-- Existing rows become 'plan': before this migration all rows were treated as one
-- stream, so this keeps every existing tournament total unchanged.
ALTER TABLE sub_events ADD COLUMN kind TEXT NOT NULL DEFAULT 'plan' CHECK (kind IN ('plan', 'actual'));

CREATE INDEX IF NOT EXISTS idx_sub_events_match_kind ON sub_events (match_id, kind);

-- Backfill: auto-generated tournament plans lived only in match_plans. Copy each
-- period's lineup into plan sub_events (skipping periods that already have a
-- starting lineup, and players that no longer exist) so match_plans is no longer read.
INSERT INTO sub_events (id, match_id, user_id, period, seconds_elapsed, player_id, position_abbr, kind)
SELECT
  lower(hex(randomblob(16))),
  mp.match_id,
  mp.user_id,
  mp.quarter,
  0,
  json_extract(pp.value, '$.playerId'),
  json_extract(pp.value, '$.position'),
  'plan'
FROM match_plans mp, json_each(mp.player_positions) pp
WHERE NOT EXISTS (
    SELECT 1 FROM sub_events se
    WHERE se.match_id = mp.match_id AND se.period = mp.quarter AND se.seconds_elapsed = 0
  )
  AND EXISTS (SELECT 1 FROM players p WHERE p.id = json_extract(pp.value, '$.playerId'));
