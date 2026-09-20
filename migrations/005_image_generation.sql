CREATE TABLE image_connections (
 user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
 provider text NOT NULL CHECK(provider IN ('manual','codex','gemini_api')),
 encrypted_key text,
 model text,
 estimated_cost_usd numeric CHECK(estimated_cost_usd>0),
 daily_limit integer NOT NULL DEFAULT 10 CHECK(daily_limit>=0),
 monthly_limit integer NOT NULL DEFAULT 100 CHECK(monthly_limit>=0),
 daily_limit_usd numeric NOT NULL DEFAULT 0 CHECK(daily_limit_usd>=0),
 monthly_limit_usd numeric NOT NULL DEFAULT 0 CHECK(monthly_limit_usd>=0),
 state text NOT NULL DEFAULT 'configured',
 version integer NOT NULL DEFAULT 1,
 checked_at timestamptz,
 live_tested_at timestamptz
);
CREATE TABLE image_generations (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users,
 artist_id uuid NOT NULL REFERENCES artists ON DELETE CASCADE,
 song_id uuid REFERENCES songs ON DELETE SET NULL,
 reference_asset_id uuid REFERENCES assets ON DELETE SET NULL,
 reference_snapshot jsonb,
 identity_snapshot jsonb NOT NULL,
 name text NOT NULL,
 prompt text NOT NULL,
 aspect_ratio text NOT NULL,
 provider text NOT NULL,
 model text NOT NULL,
 connection_version integer NOT NULL,
 estimated_cost_usd numeric,
 state text NOT NULL DEFAULT 'queued',
 job_id uuid REFERENCES jobs ON DELETE SET NULL,
 asset_id uuid REFERENCES assets ON DELETE SET NULL,
 submitted_at timestamptz,
 error text,
 resolution_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz
);
CREATE TABLE image_reservations (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users,
 generation_id uuid UNIQUE REFERENCES image_generations ON DELETE SET NULL,
 amount_usd numeric CHECK(amount_usd>0),
 state text NOT NULL DEFAULT 'reserved',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX image_generation_user_state ON image_generations(user_id,state);
