import type { Game } from "../shared/game";

/** Idempotent outbox delivery; older snapshots cannot overwrite newer history. */
export function historyStatements(db: D1Database, g: Game, recording: { eventCount: number }) {
  const guard = "EXISTS (SELECT 1 FROM matches WHERE id=? AND history_revision=?)";
  const guardValues = [g.matchId!, g.revision];
  const participants = JSON.stringify(g.players);
  const finished = g.phase === "finished";
  const endedAt = finished ? g.finishedAt! : null;
  const status = finished ? (g.winner ? "completed" : "abandoned") : "active";
  return [
    db
      .prepare(`INSERT INTO players(id,display_name,created_at,last_seen_at)
      SELECT json_extract(p.value,'$.id'),json_extract(p.value,'$.name'),?,json_extract(p.value,'$.seen')
      FROM json_each(?) p WHERE true ON CONFLICT(id) DO UPDATE SET last_seen_at=excluded.last_seen_at WHERE excluded.last_seen_at>=players.last_seen_at`)
      .bind(g.startedAt!, participants),
    db
      .prepare(`INSERT INTO matches(id,room_code,status,public,player_count,started_at,completed_at,winner_id,rounds,history_revision,event_count)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,completed_at=excluded.completed_at,
        winner_id=excluded.winner_id,rounds=excluded.rounds,player_count=excluded.player_count,history_revision=excluded.history_revision,
        event_count=excluded.event_count
      WHERE matches.history_revision<excluded.history_revision AND matches.completed_at IS NULL`)
      .bind(
        g.matchId!,
        g.code,
        status,
        g.public ? 1 : 0,
        g.players.length,
        g.startedAt!,
        endedAt,
        g.winner,
        g.round,
        g.revision,
        recording.eventCount,
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
        g.matchId!,
        finished ? 1 : 0,
        g.winner,
        g.winner,
        endedAt,
        participants,
        ...guardValues,
      ),
    ...(finished && g.winner
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
            AND r.outcome IN ('won','lost') AND r.finalized_at IS NOT NULL AND ${guard}`)
            .bind(g.matchId!, g.matchId!, ...guardValues),
        ]
      : []),
  ];
}
