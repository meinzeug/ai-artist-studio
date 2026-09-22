-- Existing productions retain their snapshot and timing; new productions mark max_image_seconds=5.
ALTER TABLE music_video_productions DROP CONSTRAINT music_video_productions_scene_count_check;
ALTER TABLE music_video_productions ADD CONSTRAINT music_video_productions_scene_count_check CHECK(scene_count BETWEEN 4 AND 240);
ALTER TABLE music_video_scenes DROP CONSTRAINT music_video_scenes_position_check;
ALTER TABLE music_video_scenes ADD CONSTRAINT music_video_scenes_position_check CHECK(position BETWEEN 0 AND 239);
ALTER TABLE music_video_scenes ADD COLUMN continuity text;
ALTER TABLE music_video_productions ADD COLUMN storyboard_plan jsonb;
