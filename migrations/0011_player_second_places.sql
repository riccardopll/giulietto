ALTER TABLE player_stats ADD COLUMN second_places INTEGER NOT NULL DEFAULT 0;

WITH reached AS (
  SELECT m.id AS match_id, m.winner_id, o.value AS player_id, MAX(e.round) AS round
  FROM matches m
  JOIN match_events e ON e.match_id=m.id AND e.type='round_dealt'
  JOIN json_each(e.payload,'$.order') o
  WHERE m.stats_counted=1 AND m.has_bots=0 AND m.winner_id IS NOT NULL
  GROUP BY m.id, o.value
), losers AS (
  SELECT player_id, round, MAX(round) OVER (PARTITION BY match_id) AS last
  FROM reached WHERE player_id<>winner_id
), totals AS (
  SELECT player_id, COUNT(*) AS seconds FROM losers WHERE round=last GROUP BY player_id
)
UPDATE player_stats SET second_places=totals.seconds
FROM totals WHERE player_stats.player_id=totals.player_id;

CREATE TRIGGER count_second_places AFTER UPDATE OF stats_counted ON matches
WHEN OLD.stats_counted=0 AND NEW.stats_counted=1 AND NEW.has_bots=0 AND NEW.winner_id IS NOT NULL
BEGIN
  UPDATE player_stats SET second_places=second_places+1
  WHERE player_id IN (
    SELECT reached.player_id FROM (
      SELECT o.value AS player_id, MAX(e.round) AS round
      FROM match_events e, json_each(e.payload,'$.order') o
      WHERE e.match_id=NEW.id AND e.type='round_dealt' AND o.value<>NEW.winner_id
      GROUP BY o.value
    ) AS reached
    WHERE reached.round=(
      SELECT MAX(e.round) FROM match_events e, json_each(e.payload,'$.order') o
      WHERE e.match_id=NEW.id AND e.type='round_dealt' AND o.value<>NEW.winner_id
    )
  );
END;
