import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { artistSchema, ideaSchema, lyricsSchema } from "./domain";
export const automaticArtistBrief = z.object({
  name: z.string().trim().max(160).default(""),
  genre: z.string().trim().max(500).default(""),
  appearance: z.string().trim().max(4000).default(""),
  wishes: z.string().trim().max(6000).default(""),
  language: z.string().trim().min(1).max(80).default("Deutsch"),
});
export const automaticIdentity = artistSchema;
export const automaticSong = z.object({
  idea: ideaSchema,
  lyrics: lyricsSchema.extend({
    lyrics: z.string().min(1).max(4500),
    style_prompt: z.string().max(900),
  }),
  scene_prompt: z.string().min(10).max(4000),
  clips: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        caption: z.string().min(1).max(1800),
        hashtags: z.string().max(400),
        overlay: z.string().max(120),
        segment: z.enum(["opening", "middle", "ending"]),
      }),
    )
    .length(3),
});
export const automationStageNames: Record<string, string> = {
  identity: "Künstler entwickeln",
  portrait: "Hauptporträt erstellen",
  song: "Songidee & Lyrics",
  music: "Musik produzieren",
  artwork: "Videoszene gestalten",
  music_video: "Vollständiges Musikvideo",
  video: "Drei Kurzclips rendern",
  delivery: "Bereit für TikTok",
};
export function localProductionDay(now = new Date(), zone = "Europe/Berlin") {
  return Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString();
}
export function nextProductionTime(
  now = new Date(),
  zone = "Europe/Berlin",
  time = "09:00",
) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("Ungültige Produktionszeit.");
  // Compatible chooses the later valid wall time in a spring gap and first occurrence in autumn.
  // UNIQUE(artist,local_day) still guarantees a single scheduled daily production.
  const current = Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(
    zone,
  );
  return current
    .toPlainDate()
    .add({ days: 1 })
    .toPlainDateTime(Temporal.PlainTime.from(time))
    .toZonedDateTime(zone, { disambiguation: "compatible" })
    .toInstant()
    .toString();
}
export function automaticClipRange(duration: number, segment: string) {
  if (!Number.isFinite(duration) || duration < 1)
    throw new Error("Aufnahme ist zu kurz für ein Musikvideo.");
  const length = Math.min(30, duration),
    start =
      segment === "middle"
        ? Math.max(0, (duration - length) / 2)
        : segment === "ending"
          ? Math.max(0, duration - length)
          : 0;
  return { start, end: Math.min(duration, start + length) };
}
