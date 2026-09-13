ALTER TABLE match_results ADD COLUMN aces_of_coins_played INTEGER;
ALTER TABLE match_results ADD COLUMN prediction_total INTEGER;
ALTER TABLE match_results ADD COLUMN prediction_count INTEGER;
ALTER TABLE match_results ADD COLUMN play_time_ms INTEGER;
ALTER TABLE match_results ADD COLUMN timed_plays INTEGER;
ALTER TABLE match_results ADD COLUMN prediction_time_ms INTEGER;
ALTER TABLE match_results ADD COLUMN timed_predictions INTEGER;

UPDATE match_results AS r SET
  aces_of_coins_played = totals.aces,
  prediction_total = totals.predictions,
  prediction_count = totals.bids
FROM (
  SELECT match_id, player_id,
    SUM(type='play' AND json_extract(payload,'$.card')=31) AS aces,
    SUM(CASE WHEN type='bid' THEN json_extract(payload,'$.bid') ELSE 0 END) AS predictions,
    SUM(type='bid') AS bids
  FROM match_events WHERE type IN ('play','bid')
  GROUP BY match_id, player_id
) AS totals
WHERE r.match_id=totals.match_id AND r.player_id=totals.player_id
  AND r.outcome IN ('won','lost') AND r.finalized_at IS NOT NULL;
