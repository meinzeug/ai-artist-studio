import { z } from "zod";

// Explicitly documented preview models; availability is checked with models.get.
export const veoModels = [
  "veo-3.1-fast-generate-preview",
  "veo-3.1-generate-preview",
] as const;
export const veoModel = z.enum(veoModels);
export const videoSceneSchema = z.object({
  artist_id: z.uuid(),
  song_id: z.uuid().nullable().default(null),
  name: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(5).max(3000),
  negative_prompt: z.string().max(1000).default(""),
  reference_asset_id: z.uuid(),
  duration: z.union([z.literal(4), z.literal(6), z.literal(8)]).default(8),
});
export function videoCost(duration: number, rate: number) {
  return Math.ceil(duration * rate * 10000) / 10000;
}
