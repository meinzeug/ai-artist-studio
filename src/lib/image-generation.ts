import { z } from "zod";
export const imageProviders = {
  manual: "Manueller Import",
  codex: "Codex · ChatGPT-Konto",
  gemini_api: "Gemini · Bild-API",
} as const;
export const imageProvider = z.enum(["manual", "codex", "gemini_api"]);
export const imageModels = [
  "gemini-3.1-flash-image",
  "gemini-3-pro-image",
  "gemini-2.5-flash-image",
] as const;
export const imageModel = z.enum(imageModels);
export const aspectRatio = z.enum(["9:16", "1:1", "16:9"]);
export const imageRequest = z.object({
  artist_id: z.uuid(),
  song_id: z.uuid().nullable().default(null),
  reference_asset_id: z.uuid().nullable().default(null),
  name: z.string().trim().min(1).max(160),
  prompt: z.string().trim().min(5).max(8000),
  aspect_ratio: aspectRatio.default("9:16"),
  connection_version: z.number().int().positive(),
  approved: z.literal(true),
  rights_confirmed: z.literal(true),
  approved_cost_usd: z.number().positive().nullable(),
});
export const imageResult = z.object({
  images: z
    .array(
      z.object({
        data: z
          .string()
          .min(4)
          .max(20_000_000)
          .regex(/^[A-Za-z0-9+/]+={0,2}$/),
      }),
    )
    .min(1)
    .max(4),
});
