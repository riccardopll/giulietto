export type PlayerStats = {
  matches: number;
  wins: number;
  rounds: number;
  tricks: number;
  exactPredictions: number;
  predictionError: number;
  xp: number;
  level: number;
};

export function progression(matches: number, wins: number) {
  const xp = matches * 10 + wins * 20;
  return { xp, level: 1 + Math.floor(xp / 100) };
}

export type Leader = PlayerStats & { name: string; you: boolean };
export type StatsResponse = {
  player: PlayerStats;
  experience: Leader[];
  wins: Leader[];
};
