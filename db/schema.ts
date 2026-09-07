import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';

export const rooms = sqliteTable('rooms', {
  code: text('code').primaryKey(),
  state: text('state').notNull(),
  version: integer('version').notNull().default(0),
  public: integer('public').notNull().default(0),
  phase: text('phase').notNull(),
  updated: integer('updated').notNull(),
}, t => [index('rooms_match').on(t.public, t.phase, t.updated)]);

export const players = sqliteTable('players', {
  id: text('id').primaryKey(), // SHA-256 of the anonymous browser credential.
  displayName: text('display_name').notNull(),
  createdAt: integer('created_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
});

export const matches = sqliteTable('matches', {
  id: text('id').primaryKey(),
  roomCode: text('room_code').notNull(), // History survives lobby removal.
  status: text('status', { enum: ['active', 'completed', 'abandoned'] }).notNull(),
  public: integer('public').notNull(),
  playerCount: integer('player_count').notNull(),
  startedAt: integer('started_at').notNull(),
  completedAt: integer('completed_at'),
  winnerId: text('winner_id').references(() => players.id),
  rounds: integer('rounds').notNull().default(0),
}, t => [index('matches_finished').on(t.status, t.completedAt), index('matches_room').on(t.roomCode)]);

export const matchResults = sqliteTable('match_results', {
  matchId: text('match_id').notNull().references(() => matches.id),
  playerId: text('player_id').notNull().references(() => players.id),
  displayName: text('display_name').notNull(), // Name used in this particular match.
  outcome: text('outcome', { enum: ['active', 'won', 'lost', 'forfeited', 'abandoned'] }).notNull(),
  lives: integer('lives').notNull(),
  roundsPlayed: integer('rounds_played').notNull().default(0),
  tricksWon: integer('tricks_won').notNull().default(0),
  exactPredictions: integer('exact_predictions').notNull().default(0),
  predictionError: integer('prediction_error').notNull().default(0),
  finalizedAt: integer('finalized_at'),
}, t => [primaryKey({ columns: [t.matchId, t.playerId] }), index('results_player_outcome').on(t.playerId, t.outcome)]);
