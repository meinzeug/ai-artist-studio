ALTER TABLE artist_automations ADD COLUMN full_music_video boolean NOT NULL DEFAULT false;
ALTER TABLE artist_automations ADD COLUMN video_scene_count integer NOT NULL DEFAULT 8 CHECK(video_scene_count BETWEEN 4 AND 24);
ALTER TABLE automation_runs ADD COLUMN full_music_video boolean NOT NULL DEFAULT false;
ALTER TABLE automation_runs ADD COLUMN video_scene_count integer NOT NULL DEFAULT 8 CHECK(video_scene_count BETWEEN 4 AND 24);
ALTER TABLE video_projects DROP CONSTRAINT video_projects_template_check;
ALTER TABLE video_projects ADD CONSTRAINT video_projects_template_check CHECK(template IN ('character','scenes','visualizer','music_video'));
CREATE TABLE music_video_productions (
 id uuid PRIMARY KEY,
 run_id uuid NOT NULL UNIQUE REFERENCES automation_runs ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users,
 artist_id uuid NOT NULL REFERENCES artists ON DELETE CASCADE,
 song_id uuid NOT NULL REFERENCES songs ON DELETE CASCADE,
 variant_id uuid NOT NULL REFERENCES audio_variants,
 lyrics_version_id uuid NOT NULL REFERENCES lyrics_versions,
 reference_asset_id uuid NOT NULL REFERENCES assets,
 connection_version integer,
 scene_count integer NOT NULL CHECK(scene_count BETWEEN 4 AND 24),
 snapshot jsonb NOT NULL,
 storyboard jsonb,
 state text NOT NULL DEFAULT 'planning' CHECK(state IN ('planning','images','rendering','ready','blocked','cancelled')),
 job_id uuid REFERENCES jobs,
 project_id uuid REFERENCES video_projects,
 post_id uuid REFERENCES posts,
 error text,
 version integer NOT NULL DEFAULT 1,
 attempt integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE music_video_scenes (
 id uuid PRIMARY KEY,
 production_id uuid NOT NULL REFERENCES music_video_productions ON DELETE CASCADE,
 position integer NOT NULL CHECK(position BETWEEN 0 AND 23),
 title text NOT NULL,
 lyric_excerpt text NOT NULL,
 prompt text NOT NULL,
 camera text NOT NULL,
 weight numeric NOT NULL CHECK(weight>0 AND weight<=10),
 generation_id uuid REFERENCES image_generations,
 asset_id uuid REFERENCES assets,
 UNIQUE(production_id,position)
);
CREATE INDEX music_video_pending ON music_video_productions(state);
