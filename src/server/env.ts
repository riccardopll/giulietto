import type { GameRoom } from "./game-room";
import type { Matchmaker } from "./matchmaker";
export interface Env {
  DB: D1Database;
  ROOMS: DurableObjectNamespace<GameRoom>;
  MATCHMAKER: DurableObjectNamespace<Matchmaker>;
  REQUEST_LIMIT: RateLimit;
}
