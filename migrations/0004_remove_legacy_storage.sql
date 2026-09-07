DROP TABLE rooms;

DELETE FROM match_results
WHERE match_id IN (
  SELECT id FROM matches
  WHERE recording_version = 0
    AND NOT EXISTS (SELECT 1 FROM match_events WHERE match_id = matches.id)
);

DELETE FROM matches
WHERE recording_version = 0
  AND NOT EXISTS (SELECT 1 FROM match_events WHERE match_id = matches.id);

DELETE FROM players
WHERE NOT EXISTS (SELECT 1 FROM match_results WHERE player_id = players.id)
  AND NOT EXISTS (SELECT 1 FROM matches WHERE winner_id = players.id)
  AND NOT EXISTS (SELECT 1 FROM match_events WHERE player_id = players.id);
