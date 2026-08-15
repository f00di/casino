CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE game_type AS ENUM ('poker', 'blackjack');
CREATE TYPE room_status AS ENUM ('lobby', 'starting', 'active', 'paused', 'completed', 'expired');

CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code varchar(6) NOT NULL UNIQUE CHECK (room_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  game_type game_type NOT NULL,
  status room_status NOT NULL DEFAULT 'lobby',
  host_player_id uuid,
  expected_player_count smallint NOT NULL CHECK (expected_player_count BETWEEN 1 AND 9),
  password_hash text,
  settings jsonb NOT NULL,
  current_state_version bigint NOT NULL DEFAULT 0 CHECK (current_state_version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  normalized_display_name varchar(24) NOT NULL,
  display_name varchar(24) NOT NULL,
  seat_index smallint NOT NULL CHECK (seat_index BETWEEN 0 AND 8),
  reconnect_token_hash char(64),
  ready boolean NOT NULL DEFAULT false,
  connected boolean NOT NULL DEFAULT false,
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  eliminated boolean NOT NULL DEFAULT false,
  spectator boolean NOT NULL DEFAULT false,
  permanently_left boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rooms ADD CONSTRAINT rooms_host_player_fk
  FOREIGN KEY (host_player_id) REFERENCES players(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE game_snapshots (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  state_version bigint NOT NULL CHECK (state_version >= 0),
  authoritative_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, state_version)
);

CREATE TABLE game_events (
  id bigserial PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  state_version bigint NOT NULL,
  sequence_number bigint NOT NULL,
  player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  action_type varchar(80) NOT NULL,
  sanitized_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, sequence_number)
);

CREATE TABLE processed_actions (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  client_action_id uuid NOT NULL,
  resulting_state_version bigint NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, player_id, client_action_id)
);

CREATE TABLE shuffle_audits (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  hand_or_round_number integer NOT NULL CHECK (hand_or_round_number > 0),
  game_type game_type NOT NULL,
  commitment_hash char(64) NOT NULL,
  nonce text NOT NULL,
  canonical_deck_order text NOT NULL,
  reveal_eligibility boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, game_type, hand_or_round_number)
);

CREATE INDEX rooms_active_expiry_idx ON rooms (expires_at) WHERE status NOT IN ('completed', 'expired');
CREATE INDEX players_room_connected_idx ON players (room_id, connected);
CREATE UNIQUE INDEX players_active_room_name_unique ON players (room_id, normalized_display_name) WHERE permanently_left=false;
CREATE UNIQUE INDEX players_active_room_seat_unique ON players (room_id, seat_index) WHERE permanently_left=false;
CREATE INDEX game_snapshots_latest_idx ON game_snapshots (room_id, state_version DESC);
CREATE INDEX game_events_room_version_idx ON game_events (room_id, state_version);
CREATE INDEX processed_actions_created_idx ON processed_actions (created_at);

-- The backend connects with DATABASE_URL and owns these tables. Browser roles receive no grants.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
