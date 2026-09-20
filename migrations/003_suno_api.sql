CREATE TABLE music_connections (
 user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
 encrypted_key text NOT NULL,
 state text NOT NULL DEFAULT 'connected',
 model text NOT NULL DEFAULT 'V6',
 callback_url text NOT NULL DEFAULT '',
 credits_per_generation numeric CHECK(credits_per_generation>0),
 daily_credit_limit numeric NOT NULL DEFAULT 0 CHECK(daily_credit_limit>=0),
 monthly_credit_limit numeric NOT NULL DEFAULT 0 CHECK(monthly_credit_limit>=0),
 remaining_credits numeric,
 checked_at timestamptz NOT NULL DEFAULT now(),
 error text,
 version integer NOT NULL DEFAULT 1
);
ALTER TABLE music_orders ADD COLUMN job_id uuid REFERENCES jobs ON DELETE SET NULL;
ALTER TABLE music_orders ADD COLUMN api_options jsonb NOT NULL DEFAULT '{}';
ALTER TABLE music_orders ADD COLUMN error text;
ALTER TABLE music_orders ADD COLUMN provider_status text;
ALTER TABLE music_orders ADD COLUMN submitted_at timestamptz;
ALTER TABLE music_orders ADD COLUMN next_poll_at timestamptz;
ALTER TABLE music_orders ADD COLUMN poll_failures integer NOT NULL DEFAULT 0;
ALTER TABLE music_orders ADD COLUMN poll_sequence integer NOT NULL DEFAULT 0;
ALTER TABLE music_orders ADD COLUMN finished_at timestamptz;
CREATE UNIQUE INDEX music_external_task ON music_orders(provider,external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX music_external_variant ON audio_variants(order_id,external_id) WHERE order_id IS NOT NULL AND external_id<>'';
CREATE TABLE music_credit_reservations (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users,
 order_id uuid UNIQUE REFERENCES music_orders ON DELETE SET NULL,
 units numeric NOT NULL CHECK(units>0),
 state text NOT NULL DEFAULT 'reserved',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX music_poll_due ON music_orders(next_poll_at) WHERE provider='sunoapi_org';
