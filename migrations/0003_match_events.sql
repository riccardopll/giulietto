ALTER TABLE matches ADD COLUMN recording_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN history_complete INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN event_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE match_events (
  match_id TEXT NOT NULL REFERENCES matches(id),
  sequence INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  round INTEGER NOT NULL,
  type TEXT NOT NULL,
  player_id TEXT,
  source TEXT NOT NULL CHECK(source IN ('player','timeout','system')),
  command_id TEXT,
  occurred_at INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  PRIMARY KEY (match_id, sequence)
);

CREATE INDEX events_round ON match_events(match_id, round, sequence);
CREATE INDEX events_player_type ON match_events(player_id, type);
