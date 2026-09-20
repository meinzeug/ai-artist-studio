CREATE TABLE video_connections (
 user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
 encrypted_key text NOT NULL,
 model text NOT NULL,
 rate_usd_second numeric NOT NULL CHECK(rate_usd_second>0),
 daily_limit_usd numeric NOT NULL DEFAULT 0 CHECK(daily_limit_usd>=0),
 monthly_limit_usd numeric NOT NULL DEFAULT 0 CHECK(monthly_limit_usd>=0),
 state text NOT NULL DEFAULT 'connected',
 version integer NOT NULL DEFAULT 1,
 checked_at timestamptz NOT NULL DEFAULT now(),
 live_tested_at timestamptz
);
CREATE TABLE video_generations (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users,
 artist_id uuid NOT NULL REFERENCES artists ON DELETE CASCADE,
 song_id uuid REFERENCES songs ON DELETE SET NULL,
 reference_asset_id uuid REFERENCES assets ON DELETE SET NULL,
 reference_snapshot jsonb NOT NULL,
 name text NOT NULL,
 prompt text NOT NULL,
 negative_prompt text NOT NULL DEFAULT '',
 model text NOT NULL,
 duration integer NOT NULL CHECK(duration IN (4,6,8)),
 estimated_cost_usd numeric NOT NULL CHECK(estimated_cost_usd>0),
 state text NOT NULL DEFAULT 'queued',
 job_id uuid REFERENCES jobs ON DELETE SET NULL,
 operation_name text UNIQUE,
 asset_id uuid REFERENCES assets ON DELETE SET NULL,
 submitted_at timestamptz,
 next_poll_at timestamptz,
 poll_until timestamptz,
 poll_failures integer NOT NULL DEFAULT 0,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz
);
CREATE TABLE video_cost_reservations (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users,
 generation_id uuid UNIQUE REFERENCES video_generations ON DELETE SET NULL,
 amount_usd numeric NOT NULL CHECK(amount_usd>0),
 state text NOT NULL DEFAULT 'reserved',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX video_generation_poll_due ON video_generations(next_poll_at) WHERE state='waiting_for_provider';
