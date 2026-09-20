import { z } from "zod";
import { timelineSchema } from "./domain";
export const sceneCount = z.number().int().min(4).max(24);
export const cameraMotion = z.enum([
  "push_in",
  "pull_out",
  "pan_left",
  "pan_right",
]);
export const musicVideoStoryboard = z.object({
  treatment: z.string().min(20).max(3000),
  visual_style: z.string().min(20).max(2000),
  caption: z.string().min(10).max(1800),
  hashtags: z.string().max(400),
  scenes: z
    .array(
      z.object({
        title: z.string().min(1).max(100),
        lyric_excerpt: z.string().min(1).max(500),
        prompt: z.string().min(40).max(4000),
        camera: cameraMotion,
        weight: z.number().min(0.5).max(10),
      }),
    )
    .min(4)
    .max(24),
});
export function validateStoryboard(
  raw: unknown,
  count: number,
  lyrics: string,
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
  if (new Set(value.scenes.map((s) => normalize(s.prompt))).size !== count)
    throw new Error("Storyboard enthält doppelte Bildmotive.");
  return value;
}
export function fullMusicVideoTimeline(
  duration: number,
  title: string,
  scenes: any[],
) {
  if (!Number.isFinite(duration) || duration < 2 || duration > 1200)
    throw new Error(
      "Vollständiges Musikvideo unterstützt Aufnahmen von 2 Sekunden bis 20 Minuten.",
    );
  if (scenes.length < 4 || scenes.some((s) => !s.asset_id))
    throw new Error("Alle Storyboardbilder müssen vorhanden sein.");
  if (new Set(scenes.map((s) => s.asset_id)).size !== scenes.length)
    throw new Error("Für jede Szene ein eigenständiges Bild verwenden.");
  const fps = 30,
    frames = Math.ceil(duration * fps),
    weight = scenes.reduce((n, s) => n + Number(s.weight), 0);
  let used = 0;
  const shots: any[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i],
      end =
        i === scenes.length - 1
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
      length >= 300
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
