import { z } from "zod";
import { timelineSchema } from "./domain";
// video_scene_count in old artist/run records is retained only for compatibility.
export const sceneCount = z.number().int().min(4).max(24);
export const MAX_IMAGE_SECONDS = 5;
export const STORYBOARD_BATCH_SIZE = 8;
export function requiredSceneCount(duration: number) {
  if (!Number.isFinite(duration) || duration < 2 || duration > 1200)
    throw new Error(
      "Vollversion: Aufnahme muss zwischen 2 Sekunden und 20 Minuten lang sein.",
    );
  return Math.max(
    4,
    Math.ceil(Math.ceil(duration * 30) / (MAX_IMAGE_SECONDS * 30)),
  );
}
export function sceneWindows(
  duration: number,
  count = requiredSceneCount(duration),
) {
  const frames = Math.ceil(duration * 30);
  if (
    !Number.isInteger(count) ||
    count < requiredSceneCount(duration) ||
    count > 240 ||
    count * 15 > frames
  )
    throw new Error(
      "Für einen Bildwechsel spätestens alle 5 Sekunden werden mehr eigenständige Bilder benötigt.",
    );
  return Array.from({ length: count }, (_, i) => ({
    start: Math.floor((i * frames) / count) / 30,
    end: Math.floor(((i + 1) * frames) / count) / 30,
  }));
}
export const cameraMotion = z.enum([
  "push_in",
  "pull_out",
  "pan_left",
  "pan_right",
]);
export const musicVideoStoryboard = z.object({
  treatment: z.string().min(20).max(3000),
  visual_style: z.string().min(20).max(2000),
  caption: z.string().min(1).max(1800),
  hashtags: z.string().max(400),
  scenes: z
    .array(
      z.object({
        title: z.string().min(1).max(100),
        lyric_excerpt: z.string().min(1).max(500),
        prompt: z.string().min(40).max(1800),
        continuity: z.string().min(10).max(600),
        camera: cameraMotion,
        weight: z.number().min(0.5).max(10),
      }),
    )
    .min(1)
    .max(240),
});
export function validateStoryboard(
  raw: unknown,
  count: number,
  lyrics: string,
  previous: { prompt: string; lyric_excerpt: string }[] = [],
) {
  const value = musicVideoStoryboard.parse(raw);
  if (value.scenes.length !== count)
    throw new Error(
      `Storyboard muss genau ${count} eigenständige Bildszenen enthalten.`,
    );
  const normalize = (s: string) =>
    s.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  const source = normalize(lyrics);
  if (value.scenes.some((s) => !source.includes(normalize(s.lyric_excerpt))))
    throw new Error(
      "Ein Lyrics-Bezug des Storyboards kommt im gespeicherten Songtext nicht vor.",
    );
  if (
    new Set([...previous, ...value.scenes].map((s) => normalize(s.prompt)))
      .size !==
    count + previous.length
  )
    throw new Error("Storyboard enthält doppelte Bildmotive.");
  let cursor = 0;
  for (const scene of [...previous, ...value.scenes]) {
    const next = source.indexOf(normalize(scene.lyric_excerpt), cursor);
    if (next < 0)
      throw new Error(
        "Szenen müssen der Reihenfolge der gespeicherten Lyrics folgen.",
      );
    cursor = next;
  }
  return value;
}
export function fullMusicVideoTimeline(
  duration: number,
  title: string,
  scenes: any[],
  legacy = false,
) {
  if (!Number.isFinite(duration) || duration < 2 || duration > 1200)
    throw new Error(
      "Vollständiges Musikvideo unterstützt Aufnahmen von 2 Sekunden bis 20 Minuten.",
    );
  if (scenes.length < 4 || scenes.some((s) => !s.asset_id))
    throw new Error("Alle Storyboardbilder müssen vorhanden sein.");
  if (new Set(scenes.map((s) => s.asset_id)).size !== scenes.length)
    throw new Error("Für jede Szene ein eigenständiges Bild verwenden.");
  const windows = legacy ? null : sceneWindows(duration, scenes.length);
  const fps = 30,
    frames = Math.ceil(duration * fps),
    weight = scenes.reduce((n, s) => n + Number(s.weight), 0);
  let used = 0;
  const shots: any[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i],
      end = windows
        ? Math.round(windows[i].end * fps)
        : i === scenes.length - 1
          ? frames
          : Math.round(
              (frames *
                scenes
                  .slice(0, i + 1)
                  .reduce((n, x) => n + Number(x.weight), 0)) /
                weight,
            );
    const length = end - used;
    // A long scene gets a second, closer editorial shot with a different move.
    const split =
      legacy && length >= 300
        ? [Math.round(length * 0.58), length - Math.round(length * 0.58)]
        : [length];
    for (let j = 0; j < split.length; j++)
      shots.push({
        asset_id: s.asset_id,
        duration: split[j] / fps,
        motion: true,
        camera:
          j === 0 ? s.camera : s.camera === "push_in" ? "pan_right" : "push_in",
        zoom_base: j === 0 ? 1.02 : 1.15,
        crop_x: 0.5,
        crop_y: 0.5,
      });
    used = end;
  }
  return timelineSchema.parse({
    start: 0,
    end: duration,
    scenes: shots,
    subtitles: [],
    title,
    title_duration: 4,
    font_size: 48,
    text_y: 0.68,
    fps: "30",
    quality: "high",
    transition: "dissolve",
  });
}
