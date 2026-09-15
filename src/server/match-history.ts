import type { Game } from "../shared/game";

/** Idempotent outbox delivery; older snapshots cannot overwrite newer history. */
export function historyStatements(db: D1Database, game: Game, eventCount: number) {
  const guard = "EXISTS (SELECT 1 FROM matches WHERE id=? AND history_revision=?)";
  const uncounted =
    "EXISTS (SELECT 1 FROM matches WHERE id=? AND history_revision=? AND stats_counted=0)";
  const guardValues = [game.matchId!, game.revision];
  const participants = JSON.stringify(game.players);
  const finished = game.phase === "finished";
  const endedAt = finished ? game.finishedAt! : null;
  const status = finished ? (game.winner ? "completed" : "abandoned") : "active";
  return [
    db
      .prepare(`INSERT INTO players(id,display_name,created_at,last_seen_at)
      SELECT json_extract(p.value,'$.id'),json_extract(p.value,'$.name'),?,json_extract(p.value,'$.seen')
      FROM json_each(?) p WHERE true ON CONFLICT(id) DO UPDATE SET last_seen_at=excluded.last_seen_at WHERE excluded.last_seen_at>=players.last_seen_at`)
      .bind(game.startedAt!, participants),
    db
      .prepare(`INSERT INTO matches(id,room_code,status,public,player_count,started_at,completed_at,winner_id,rounds,history_revision,event_count)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,completed_at=excluded.completed_at,
        winner_id=excluded.winner_id,rounds=excluded.rounds,player_count=excluded.player_count,history_revision=excluded.history_revision,
        event_count=excluded.event_count
      WHERE matches.history_revision<excluded.history_revision AND matches.completed_at IS NULL`)
      .bind(
        game.matchId!,
        game.code,
        status,
        game.public ? 1 : 0,
        game.players.length,
        game.startedAt!,
        endedAt,
        game.winner,
        game.round,
        game.revision,
        eventCount,
      ),
    db
      .prepare(`INSERT INTO match_results(match_id,player_id,display_name,outcome,lives,
        rounds_played,tricks_won,exact_predictions,prediction_error,finalized_at)
      SELECT ?,json_extract(p.value,'$.id'),json_extract(p.value,'$.name'),
        CASE WHEN ?=0 THEN 'active' WHEN ? IS NULL THEN 'abandoned'
          WHEN json_extract(p.value,'$.id')=? THEN 'won' ELSE 'lost' END,
        json_extract(p.value,'$.lives'),json_extract(p.value,'$.stats.roundsPlayed'),
        json_extract(p.value,'$.stats.tricksWon'),json_extract(p.value,'$.stats.exactPredictions'),
        json_extract(p.value,'$.stats.predictionError'),?
      FROM json_each(?) p WHERE ${guard}
      ON CONFLICT(match_id,player_id) DO UPDATE SET outcome=excluded.outcome,lives=excluded.lives,
        rounds_played=excluded.rounds_played,tricks_won=excluded.tricks_won,
        exact_predictions=excluded.exact_predictions,prediction_error=excluded.prediction_error,
        finalized_at=excluded.finalized_at WHERE match_results.finalized_at IS NULL`)
      .bind(
        game.matchId!,
        finished ? 1 : 0,
        game.winner,
        game.winner,
        endedAt,
        participants,
        ...guardValues,
      ),
    ...(finished && game.winner
      ? [
          db
            .prepare(`UPDATE match_results AS r SET
            aces_of_coins_played=totals.aces,
            prediction_total=totals.predictions, prediction_count=totals.bids,
            play_time_ms=totals.play_time, timed_plays=totals.plays_timed,
            prediction_time_ms=totals.bid_time, timed_predictions=totals.bids_timed
          FROM (
            SELECT player_id,
              SUM(type='play' AND json_extract(payload,'$.card')=31) AS aces,
              SUM(CASE WHEN type='bid' THEN json_extract(payload,'$.bid') ELSE 0 END) AS predictions,
              SUM(type='bid') AS bids,
              SUM(CASE WHEN type='play' AND source='player' THEN json_extract(payload,'$.elapsedMs') END) AS play_time,
              COUNT(CASE WHEN type='play' AND source='player' THEN json_extract(payload,'$.elapsedMs') END) AS plays_timed,
              SUM(CASE WHEN type='bid' AND source='player' THEN json_extract(payload,'$.elapsedMs') END) AS bid_time,
              COUNT(CASE WHEN type='bid' AND source='player' THEN json_extract(payload,'$.elapsedMs') END) AS bids_timed
            FROM match_events WHERE match_id=? AND type IN ('play','bid')
            GROUP BY player_id
          ) AS totals
          WHERE r.match_id=? AND r.player_id=totals.player_id
            AND r.outcome IN ('won','lost') AND r.finalized_at IS NOT NULL AND ${uncounted}`)
            .bind(game.matchId!, game.matchId!, ...guardValues),
          db
            .prepare(`INSERT INTO player_stats(player_id,matches,wins,aces_of_coins_played,
            prediction_total,prediction_count,play_time_ms,timed_plays,prediction_time_ms,timed_predictions)
            SELECT player_id,1,outcome='won',aces_of_coins_played,
              COALESCE(prediction_total,0),COALESCE(prediction_count,0),
              COALESCE(play_time_ms,0),COALESCE(timed_plays,0),
              COALESCE(prediction_time_ms,0),COALESCE(timed_predictions,0)
            FROM match_results WHERE match_id=? AND outcome IN ('won','lost')
              AND finalized_at IS NOT NULL AND ${uncounted}
            ON CONFLICT(player_id) DO UPDATE SET
              matches=player_stats.matches+excluded.matches,
              wins=player_stats.wins+excluded.wins,
              aces_of_coins_played=CASE
                WHEN player_stats.aces_of_coins_played IS NULL AND excluded.aces_of_coins_played IS NULL THEN NULL
                ELSE COALESCE(player_stats.aces_of_coins_played,0)+COALESCE(excluded.aces_of_coins_played,0) END,
              prediction_total=player_stats.prediction_total+excluded.prediction_total,
              prediction_count=player_stats.prediction_count+excluded.prediction_count,
              play_time_ms=player_stats.play_time_ms+excluded.play_time_ms,
              timed_plays=player_stats.timed_plays+excluded.timed_plays,
              prediction_time_ms=player_stats.prediction_time_ms+excluded.prediction_time_ms,
              timed_predictions=player_stats.timed_predictions+excluded.timed_predictions`)
            .bind(game.matchId!, ...guardValues),
          db
            .prepare(
              "UPDATE matches SET stats_counted=1 WHERE id=? AND history_revision=? AND status='completed' AND stats_counted=0",
            )
            .bind(...guardValues),
        ]
      : []),
  ];
}
