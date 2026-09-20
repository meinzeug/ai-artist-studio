CREATE TABLE artist_automations (
 artist_id uuid PRIMARY KEY REFERENCES artists ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users,
 enabled boolean NOT NULL DEFAULT true,
 brief jsonb NOT NULL DEFAULT '{}',
 daily_time text NOT NULL DEFAULT '09:00',
 timezone text NOT NULL DEFAULT 'Europe/Berlin',
 next_run_at timestamptz NOT NULL DEFAULT now(),
 reference_asset_id uuid REFERENCES assets ON DELETE SET NULL,
 music_mode text NOT NULL DEFAULT 'auto' CHECK(music_mode IN ('auto','manual')),
 approved_music_version integer,
 approved_image_version integer,
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE automation_runs (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users,
 artist_id uuid NOT NULL REFERENCES artists ON DELETE CASCADE,
 local_day date NOT NULL,
 stage text NOT NULL DEFAULT 'identity',
 state text NOT NULL DEFAULT 'running',
 attempt integer NOT NULL DEFAULT 1,
 job_id uuid REFERENCES jobs ON DELETE SET NULL,
 image_generation_id uuid REFERENCES image_generations ON DELETE SET NULL,
 song_id uuid REFERENCES songs ON DELETE SET NULL,
 music_order_id uuid REFERENCES music_orders ON DELETE SET NULL,
 scene_asset_id uuid REFERENCES assets ON DELETE SET NULL,
 creative_plan jsonb,
 music_mode text,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(artist_id,local_day)
);
CREATE UNIQUE INDEX automation_one_active ON automation_runs(artist_id) WHERE state IN ('running','waiting_for_input');
CREATE TABLE automation_clips (
 id uuid PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES automation_runs ON DELETE CASCADE,
 position integer NOT NULL CHECK(position BETWEEN 0 AND 2),
 title text NOT NULL,
 caption text NOT NULL,
 hashtags text NOT NULL,
 project_id uuid REFERENCES video_projects ON DELETE SET NULL,
 job_id uuid REFERENCES jobs ON DELETE SET NULL,
 post_id uuid REFERENCES posts ON DELETE SET NULL,
 UNIQUE(run_id,position)
);
CREATE TABLE manual_tasks (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users,
 artist_id uuid NOT NULL REFERENCES artists ON DELETE CASCADE,
 run_id uuid NOT NULL REFERENCES automation_runs ON DELETE CASCADE,
 task_key text NOT NULL,
 kind text NOT NULL,
 title text NOT NULL,
 body text NOT NULL DEFAULT '',
 post_id uuid REFERENCES posts ON DELETE SET NULL,
 state text NOT NULL DEFAULT 'open',
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 UNIQUE(run_id,task_key)
);
CREATE INDEX automation_due ON artist_automations(next_run_at) WHERE enabled;
CREATE INDEX manual_tasks_inbox ON manual_tasks(user_id,state,created_at);
ALTER TABLE artist_automations ADD COLUMN creation_key uuid;
CREATE UNIQUE INDEX automation_creation_key ON artist_automations(user_id,creation_key) WHERE creation_key IS NOT NULL;
ALTER TABLE automation_runs ADD COLUMN identity_ready boolean NOT NULL DEFAULT false;
