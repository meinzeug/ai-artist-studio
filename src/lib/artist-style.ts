import { z } from "zod";
export const styleResearchSchema = z.object({
  summary: z.string().min(20).max(5000),
  musical_traits: z.array(z.string().min(3).max(700)).min(2).max(15),
  creative_direction: z.string().min(20).max(2500),
  style_prompt: z.string().min(10).max(900),
  uncertainty: z.string().min(5).max(1200),
  sources: z
    .array(
      z.object({
        title: z.string().min(1).max(300),
        url: z
          .url()
          .max(2000)
          .refine((s) => s.startsWith("https://")),
        finding: z.string().min(5).max(900),
      }),
    )
    .min(1)
    .max(8),
});
export const styleAudioSchema = z.object({
  heard_audio: z.boolean(),
  summary: z.string().min(10).max(3000),
  genres: z.array(z.string().max(100)).max(8),
  tempo_bpm: z.number().min(20).max(300).nullable(),
  rhythm: z.string().max(1000),
  instruments: z.array(z.string().max(160)).max(15),
  vocals: z.string().max(1000),
  production: z.string().max(1500),
  style_prompt: z.string().min(10).max(900),
  uncertainty: z.string().min(5).max(1500),
});
export function audioExcerptWindows(duration: number) {
  if (!Number.isFinite(duration) || duration < 2 || duration > 1200)
    throw new Error("Musikreferenz: 2 Sekunden bis 20 Minuten erforderlich.");
  return duration <= 90
    ? [{ start: 0, duration }]
    : [0, (duration - 30) / 2, duration - 30].map((start) => ({
        start,
        duration: 30,
      }));
}
