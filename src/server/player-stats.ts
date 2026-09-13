import { defaultAvatar, isAvatar } from "../shared/avatars";
import { progression, type PlayerStats, type StatsResponse } from "../shared/player-stats";

type Row = Omit<PlayerStats, "xp" | "level"> & { id: string; name: string; avatar: string | null };

const totals = `SELECT p.id, p.display_name AS name, p.avatar, COUNT(r.match_id) AS matches,
  COALESCE(SUM(r.outcome='won'),0) AS wins,
  CASE WHEN COUNT(r.match_id)=0 THEN 0 ELSE SUM(r.aces_of_coins_played) END AS acesOfCoinsPlayed,
  1.0*SUM(r.prediction_total)/NULLIF(SUM(r.prediction_count),0) AS averagePrediction,
  1.0*SUM(COALESCE(r.play_time_ms,0)+COALESCE(r.prediction_time_ms,0))
    /NULLIF(SUM(COALESCE(r.timed_plays,0)+COALESCE(r.timed_predictions,0)),0) AS averageDecisionMs
  FROM players p LEFT JOIN match_results r ON r.player_id=p.id
    AND r.outcome IN ('won','lost') AND r.finalized_at IS NOT NULL`;

function stats(row?: Row): PlayerStats {
  const {
    matches = 0,
    wins = 0,
    acesOfCoinsPlayed = 0,
    averagePrediction = null,
    averageDecisionMs = null,
  } = row ?? {};
  return {
    matches,
    wins,
    acesOfCoinsPlayed,
    averagePrediction,
    averageDecisionMs,
    ...progression(matches, wins),
  };
}

export async function playerStats(db: D1Database, id: string): Promise<StatsResponse> {
  const results = await db.batch<Row>([
    db.prepare(`${totals} WHERE p.id=? GROUP BY p.id`).bind(id),
    db.prepare(`${totals} GROUP BY p.id HAVING matches>0
      ORDER BY wins DESC, (matches*10+wins*20) DESC, p.id ASC LIMIT 20`),
  ]);
  const leaders = (rows: Row[]) =>
    rows.map((row) => ({
      ...stats(row),
      name: row.name,
      avatar: isAvatar(row.avatar) ? row.avatar : defaultAvatar(row.id),
      you: row.id === id,
    }));
  return {
    player: stats(results[0].results[0]),
    profile: {
      name: results[0].results[0]?.name ?? "",
      avatar: isAvatar(results[0].results[0]?.avatar)
        ? results[0].results[0].avatar
        : defaultAvatar(id),
    },
    leaders: leaders(results[1].results),
  };
}
