ALTER TABLE automation_runs ADD COLUMN start_kind text NOT NULL DEFAULT 'daily' CHECK(start_kind IN ('daily','manual'));
ALTER TABLE automation_runs ADD COLUMN start_key uuid;
ALTER TABLE automation_runs DROP CONSTRAINT automation_runs_artist_id_local_day_key;
CREATE UNIQUE INDEX automation_daily_once ON automation_runs(artist_id,local_day) WHERE start_kind='daily';
CREATE UNIQUE INDEX automation_manual_start_key ON automation_runs(user_id,start_key) WHERE start_key IS NOT NULL;
