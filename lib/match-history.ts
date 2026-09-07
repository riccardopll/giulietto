import type { Game } from './game';

/** These writes run in the same transaction as the room version check. */
export function historyStatements(db: D1Database, g: Game, version: number, state: string) {
  const guard = 'EXISTS (SELECT 1 FROM rooms WHERE code=? AND version=? AND state=?)';
  const guardValues = [g.code, version, state];
  const participants = JSON.stringify(g.players);
  const finished = g.phase === 'finished';
  const endedAt = finished ? g.finishedAt! : null;
  const status = finished ? g.winner ? 'completed' : 'abandoned' : 'active';
  return [
    db.prepare(`INSERT INTO players(id,display_name,created_at,last_seen_at)
      SELECT json_extract(p.value,'$.id'),json_extract(p.value,'$.name'),?,json_extract(p.value,'$.seen')
      FROM json_each(?) p WHERE ${guard} ON CONFLICT(id) DO NOTHING`)
      .bind(Date.now(), participants, ...guardValues),
    db.prepare(`INSERT INTO matches(id,room_code,status,public,player_count,started_at,completed_at,winner_id,rounds)
      SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard}
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,completed_at=excluded.completed_at,
        winner_id=excluded.winner_id,rounds=excluded.rounds,player_count=excluded.player_count
      WHERE matches.completed_at IS NULL`)
      .bind(g.matchId!, g.code, status, g.public ? 1 : 0, g.players.length, g.startedAt!,
        endedAt, g.winner, g.round, ...guardValues),
    db.prepare(`INSERT INTO match_results(match_id,player_id,display_name,outcome,lives,
        rounds_played,tricks_won,exact_predictions,prediction_error,finalized_at)
      SELECT ?,json_extract(p.value,'$.id'),json_extract(p.value,'$.name'),
        CASE WHEN json_extract(p.value,'$.left')=1 THEN 'forfeited'
          WHEN ?=0 THEN 'active' WHEN ? IS NULL THEN 'abandoned'
          WHEN json_extract(p.value,'$.id')=? THEN 'won' ELSE 'lost' END,
        json_extract(p.value,'$.lives'),json_extract(p.value,'$.stats.roundsPlayed'),
        json_extract(p.value,'$.stats.tricksWon'),json_extract(p.value,'$.stats.exactPredictions'),
        json_extract(p.value,'$.stats.predictionError'),?
      FROM json_each(?) p WHERE ${guard}
      ON CONFLICT(match_id,player_id) DO UPDATE SET outcome=excluded.outcome,lives=excluded.lives,
        rounds_played=excluded.rounds_played,tricks_won=excluded.tricks_won,
        exact_predictions=excluded.exact_predictions,prediction_error=excluded.prediction_error,
        finalized_at=excluded.finalized_at WHERE match_results.finalized_at IS NULL`)
      .bind(g.matchId!, finished ? 1 : 0, g.winner, g.winner, endedAt, participants, ...guardValues),
  ];
}

export function needsHistory(before: Game, after: Game) {
  if (!after.round || before.phase === 'finished') return false;
  return !before.matchId || before.round !== after.round ||
    (before.phase !== after.phase && ['results', 'finished'].includes(after.phase)) ||
    after.players.some(p => p.left !== before.players.find(b => b.id === p.id)?.left);
}
