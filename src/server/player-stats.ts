import { defaultAvatar, isAvatar } from "../shared/avatars";
import { progression, type PlayerStats, type StatsResponse } from "../shared/player-stats";

type Row = Omit<PlayerStats, "xp" | "level"> & { id: string; name: string; avatar: string | null };

const columns = `p.id, p.display_name AS name, p.avatar,
  COALESCE(s.matches,0) AS matches, COALESCE(s.wins,0) AS wins,
  CASE WHEN s.player_id IS NULL THEN 0 ELSE s.aces_of_coins_played END AS acesOfCoinsPlayed,
  1.0*s.prediction_total/NULLIF(s.prediction_count,0) AS averagePrediction,
  1.0*(s.play_time_ms+s.prediction_time_ms)
    /NULLIF(s.timed_plays+s.timed_predictions,0) AS averageDecisionMs`;

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
    db
      .prepare(`SELECT ${columns} FROM players p
      LEFT JOIN player_stats s ON s.player_id=p.id WHERE p.id=?`)
      .bind(id),
    db.prepare(`SELECT ${columns} FROM player_stats s
      JOIN players p ON p.id=s.player_id
      ORDER BY s.wins DESC, s.xp DESC, s.player_id ASC LIMIT 20`),
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
