import type { GameTable } from "./game-table";
import type { MatchQueue } from "./match-queue";
export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ROOMS: DurableObjectNamespace<GameTable>;
  MATCHMAKER: DurableObjectNamespace<MatchQueue>;
  REQUEST_LIMIT: RateLimit;
}
