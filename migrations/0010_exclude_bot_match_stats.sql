DELETE FROM player_stats;

INSERT INTO player_stats(player_id,matches,wins,aces_of_coins_played,
  prediction_total,prediction_count,play_time_ms,timed_plays,prediction_time_ms,timed_predictions)
SELECT r.player_id,COUNT(*),SUM(r.outcome='won'),SUM(r.aces_of_coins_played),
  COALESCE(SUM(r.prediction_total),0),COALESCE(SUM(r.prediction_count),0),
  COALESCE(SUM(r.play_time_ms),0),COALESCE(SUM(r.timed_plays),0),
  COALESCE(SUM(r.prediction_time_ms),0),COALESCE(SUM(r.timed_predictions),0)
FROM match_results r
JOIN matches m ON m.id=r.match_id
JOIN players p ON p.id=r.player_id
WHERE m.status='completed' AND m.has_bots=0 AND p.is_bot=0
  AND r.outcome IN ('won','lost') AND r.finalized_at IS NOT NULL
GROUP BY r.player_id;

UPDATE matches SET stats_counted=1 WHERE status='completed';
