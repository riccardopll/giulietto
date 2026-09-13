CREATE TABLE player_stats (
  player_id TEXT PRIMARY KEY NOT NULL REFERENCES players(id),
  matches INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  aces_of_coins_played INTEGER,
  prediction_total INTEGER NOT NULL DEFAULT 0,
  prediction_count INTEGER NOT NULL DEFAULT 0,
  play_time_ms INTEGER NOT NULL DEFAULT 0,
  timed_plays INTEGER NOT NULL DEFAULT 0,
  prediction_time_ms INTEGER NOT NULL DEFAULT 0,
  timed_predictions INTEGER NOT NULL DEFAULT 0,
  xp INTEGER GENERATED ALWAYS AS (matches * 10 + wins * 20) STORED
);
CREATE INDEX player_stats_ranking ON player_stats(wins DESC, xp DESC, player_id ASC);
ALTER TABLE matches ADD COLUMN stats_counted INTEGER NOT NULL DEFAULT 0;

INSERT INTO player_stats(player_id,matches,wins,aces_of_coins_played,
  prediction_total,prediction_count,play_time_ms,timed_plays,prediction_time_ms,timed_predictions)
SELECT player_id,COUNT(*),SUM(outcome='won'),SUM(aces_of_coins_played),
  COALESCE(SUM(prediction_total),0),COALESCE(SUM(prediction_count),0),
  COALESCE(SUM(play_time_ms),0),COALESCE(SUM(timed_plays),0),
  COALESCE(SUM(prediction_time_ms),0),COALESCE(SUM(timed_predictions),0)
FROM match_results WHERE outcome IN ('won','lost') AND finalized_at IS NOT NULL
GROUP BY player_id;

UPDATE matches SET stats_counted=1 WHERE status='completed';
