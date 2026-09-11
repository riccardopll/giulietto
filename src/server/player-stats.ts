import { progression, type PlayerStats, type StatsResponse } from "../shared/player-stats";

type Row = Omit<PlayerStats, "xp" | "level"> & { id: string; name: string };

const totals = `SELECT p.id, p.display_name AS name, COUNT(r.match_id) AS matches,
  COALESCE(SUM(r.outcome='won'),0) AS wins,
  COALESCE(SUM(r.rounds_played),0) AS rounds,
  COALESCE(SUM(r.tricks_won),0) AS tricks,
  COALESCE(SUM(r.exact_predictions),0) AS exactPredictions,
  COALESCE(SUM(r.prediction_error),0) AS predictionError
  FROM players p LEFT JOIN match_results r ON r.player_id=p.id
    AND r.outcome IN ('won','lost') AND r.finalized_at IS NOT NULL`;

function stats(row?: Row): PlayerStats {
  const {
    matches = 0,
    wins = 0,
    rounds = 0,
    tricks = 0,
    exactPredictions = 0,
    predictionError = 0,
  } = row ?? {};
  return {
    matches,
    wins,
    rounds,
    tricks,
    exactPredictions,
    predictionError,
    ...progression(matches, wins),
  };
}

export async function playerStats(db: D1Database, id: string): Promise<StatsResponse> {
  const results = await db.batch<Row>([
    db.prepare(`${totals} WHERE p.id=? GROUP BY p.id`).bind(id),
    db.prepare(`${totals} GROUP BY p.id HAVING matches>0
      ORDER BY (matches*10+wins*20) DESC, wins DESC, p.id ASC LIMIT 20`),
    db.prepare(`${totals} GROUP BY p.id HAVING matches>0
      ORDER BY wins DESC, (matches*10+wins*20) DESC, p.id ASC LIMIT 20`),
  ]);
  const leaders = (rows: Row[]) =>
    rows.map((row) => ({ ...stats(row), name: row.name, you: row.id === id }));
  return {
    player: stats(results[0].results[0]),
    experience: leaders(results[1].results),
    wins: leaders(results[2].results),
  };
}
