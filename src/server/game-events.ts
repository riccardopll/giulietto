import { legalBids, type Game } from "../shared/game.ts";

export type EventSource = { source: "player" | "timeout" | "system"; commandId?: string };
export type GameEvent = {
  sequence: number;
  match_id: string;
  revision: number;
  round: number;
  type: string;
  player_id: string | null;
  source: EventSource["source"];
  command_id: string | null;
  occurred_at: number;
  payload: string;
};

// Private training data stays in storage, never in Game or its client-facing view.
export function gameEvents(before: Game, after: Game, origin: EventSource, now: number) {
  const events: Omit<GameEvent, "sequence">[] = [];
  if (!after.matchId || before.phase === "finished") return events;
  const add = (type: string, playerId: string | null, payload: object) => {
    events.push({
      match_id: after.matchId!,
      revision: after.revision,
      round: after.round,
      type,
      player_id: playerId,
      source: origin.source,
      command_id: origin.commandId ?? null,
      occurred_at: now,
      payload: JSON.stringify(payload),
    });
  };
  if (after.round !== before.round) {
    add("round_dealt", null, {
      rulesVersion: 1,
      count: after.count,
      cycle: after.cycle,
      blind: after.count === 1,
      order: after.order,
      players: after.players.map((p, seat) => ({
        id: p.id,
        name: p.name,
        seat,
        hand: p.hand,
        lives: p.lives,
      })),
    });
  } else if (
    (before.phase === "bidding" && after.turn !== before.turn) ||
    (before.phase === "bidding" && after.phase === "playing")
  ) {
    const id = before.order[before.turn];
    add("bid", id, {
      bid: after.players.find((p) => p.id === id)!.bid,
      position: before.turn + 1,
      legalBids: legalBids(before),
    });
  } else if (before.phase === "playing" && after.trick.length > before.trick.length) {
    const move = after.trick[after.trick.length - 1];
    const trick = before.players.reduce((sum, p) => sum + p.taken, 0) + 1;
    add("play", move.player, {
      card: move.card,
      mode: move.mode ?? null,
      trick,
      position: after.trick.length,
      handBefore: before.players.find((p) => p.id === move.player)!.hand,
    });
    if (after.phase === "trick") add("trick_won", after.lastWinner, { trick, plays: after.trick });
  }
  if (before.phase === "trick" && ["results", "finished"].includes(after.phase)) {
    add("round_scored", null, {
      results: after.results,
      tie: after.tie,
      players: after.players.map((p) => ({
        id: p.id,
        lives: p.lives,
        stats: p.stats,
      })),
    });
  }
  if (after.phase === "finished")
    add("match_finished", after.winner, { winner: after.winner, finishedAt: after.finishedAt });
  return events;
}

export function eventStatements(db: D1Database, g: Game, events: GameEvent[]) {
  return [
    // Events may be delivered over several bounded batches before finalizing the summary.
    db
      .prepare(`INSERT INTO matches(id,room_code,status,public,player_count,started_at)
      VALUES(?,?,'active',?,?,?) ON CONFLICT(id) DO NOTHING`)
      .bind(g.matchId!, g.code, g.public ? 1 : 0, g.players.length, g.startedAt!),
    db
      .prepare(`INSERT INTO match_events(match_id,sequence,revision,round,type,player_id,source,command_id,occurred_at,payload)
      SELECT json_extract(value,'$.match_id'),json_extract(value,'$.sequence'),
        json_extract(value,'$.revision'),json_extract(value,'$.round'),json_extract(value,'$.type'),
        json_extract(value,'$.player_id'),json_extract(value,'$.source'),json_extract(value,'$.command_id'),
        json_extract(value,'$.occurred_at'),json_extract(value,'$.payload')
      FROM json_each(?) WHERE true ON CONFLICT(match_id,sequence) DO NOTHING`)
      .bind(JSON.stringify(events)),
  ];
}
