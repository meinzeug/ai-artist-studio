ALTER TABLE jobs ADD COLUMN available_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE jobs ADD COLUMN dead_letter boolean NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN output_applied boolean NOT NULL DEFAULT false;
ALTER TABLE artist_references ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE video_projects ADD COLUMN revisions jsonb NOT NULL DEFAULT '[]';
CREATE TABLE stored_files_gc (storage_key text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX connected_social_account ON social_accounts(artist_id,platform,external_id) WHERE external_id IS NOT NULL;
