CREATE TABLE artist_style_profiles (
 artist_id uuid PRIMARY KEY REFERENCES artists ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users,
 reference_asset_id uuid REFERENCES assets,
 research_query text NOT NULL DEFAULT '',
 research_job_id uuid REFERENCES jobs,
 audio_job_id uuid REFERENCES jobs,
 research_result jsonb,
 audio_result jsonb,
 research_at timestamptz,
 audio_at timestamptz,
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now()
);
