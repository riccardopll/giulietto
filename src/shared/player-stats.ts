import type { AvatarId } from "./avatars";
export type Profile = { name: string; avatar: AvatarId };
export type PlayerStats = {
  matches: number;
  wins: number;
  acesOfCoinsPlayed: number | null;
  averagePrediction: number | null;
  averageDecisionMs: number | null;
  xp: number;
  level: number;
};

export function progression(matches: number, wins: number) {
  const xp = matches * 10 + wins * 20;
  return { xp, level: 1 + Math.floor(xp / 100) };
}

export type Leader = PlayerStats & Profile & { you: boolean };
export type StatsResponse = {
  player: PlayerStats;
  profile: Profile;
  leaders: Leader[];
};
