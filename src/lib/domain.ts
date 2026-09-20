import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
export const id = z.string().uuid();
export const text = z.string().trim().max(20000);
export const short = z.string().trim().max(500);
export const identitySchema = z.object({
  aliases: text.default(""),
  handles: text.default(""),
  personality: text.default(""),
  fiction: text.default(""),
  confirmedFacts: text.default(""),
  internalInstructions: text.default(""),
  themes: text.default(""),
  taboos: text.default(""),
  visual: text.default(""),
  outfits: text.default(""),
  colors: text.default(""),
  features: text.default(""),
  lighting: text.default(""),
  variations: text.default(""),
  negativeVisual: text.default(""),
  voice: text.default(""),
  pronunciation: text.default(""),
  instrumentation: text.default(""),
  rhythm: text.default(""),
  structures: text.default(""),
  signature: text.default(""),
  exclusions: text.default(""),
  goals: text.default(""),
});
export const artistSchema = z.object({
  name: short.min(1),
  bio: text.default(""),
  language: short.default("Deutsch"),
  market: short.default("DACH"),
  genre: short.default(""),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#ff875d"),
  identity: identitySchema.default(() => identitySchema.parse({})),
});
export const lyricsSchema = z.object({
  title: short.min(1),
  lyrics: text.min(1),
  style_prompt: text.default(""),
  negative_prompt: text.default(""),
  pronunciation: text.default(""),
  notes: text.default(""),
  hooks: z.array(short).max(10).default([]),
  protected_lines: z.array(z.string().max(1000)).max(100).default([]),
});
export const ideaSchema = z.object({
  title: short.min(1),
  premise: text,
  conflict: text,
  hook: text,
  direction: text,
  video_idea: text,
  rationale: text,
  sources: z
    .array(
      z.object({ url: z.url(), title: short, retrieved_at: z.iso.datetime() }),
    )
    .max(20)
    .default([]),
});
export const subtitleSchema = z
  .object({
    start: z.number().min(0).max(600),
    end: z.number().positive().max(600),
    text: z.string().max(300),
  })
  .refine((x) => x.end > x.start, "Ende muss nach Start liegen.");
export const timelineSchema = z
  .object({
    start: z.number().min(0).max(14400),
    end: z.number().positive().max(14400),
    scenes: z
      .array(
        z.object({
          asset_id: id,
          duration: z.number().min(0.5).max(180),
          crop_x: z.number().min(0).max(1).default(0.5),
          crop_y: z.number().min(0).max(1).default(0.5),
          motion: z.boolean().default(true),
        }),
      )
      .min(1)
      .max(12),
    subtitles: z.array(subtitleSchema).max(100).default([]),
    title: short.default(""),
    font_size: z.number().int().min(28).max(96).default(56),
    text_y: z.number().min(0.15).max(0.8).default(0.65),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#ffffff"),
    fps: z.enum(["24", "25", "30"]).default("30"),
    quality: z.enum(["preview", "standard", "high"]).default("standard"),
    transition: z.enum(["fade", "cut"]).default("fade"),
  })
  .refine(
    (x) => x.end > x.start && x.end - x.start <= 180,
    "Ausschnitt muss zwischen 0 und 180 Sekunden lang sein.",
  );
export function resolveLocalTime(
  local: string,
  zone: string,
  disambiguation: "reject" | "earlier" | "later" = "reject",
): string {
  try {
    return Temporal.PlainDateTime.from(local)
      .toZonedDateTime(zone, { disambiguation })
      .toInstant()
      .toString();
  } catch {
    throw new Error(
      "Diese lokale Uhrzeit existiert nicht oder ist doppeldeutig. Bitte andere Uhrzeit oder explizit früher/später wählen.",
    );
  }
}
export function similarity(a: string, b: string) {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .split(/\s+/)
        .filter((x) => x.length > 2),
    );
  const x = tokens(a),
    y = tokens(b);
  return (
    [...x].filter((w) => y.has(w)).length /
    Math.max(1, new Set([...x, ...y]).size)
  );
}
export function preserveProtected(next: string, lines: string[]) {
  for (const line of lines)
    if (line && !next.includes(line))
      throw new Error(
        "Eine geschützte Passage wurde verändert. Änderung nicht übernommen.",
      );
  return next;
}
export function summarizeMetrics(
  posts: Record<string, any>[],
  snapshots: Record<string, any>[],
) {
  const latest = new Map<string, Record<string, any>>();
  const corrections: string[] = [];
  for (const s of [...snapshots].sort(
    (a, b) =>
      new Date(a.captured_at).valueOf() - new Date(b.captured_at).valueOf(),
  )) {
    const key = s.post_id + ":" + s.metric;
    const prev = latest.get(key);
    if (
      prev?.value != null &&
      s.value != null &&
      Number(s.value) < Number(prev.value)
    )
      corrections.push(s.post_id);
    latest.set(key, s);
  }
  const rows = posts.map((p) => {
    const get = (m: string) => {
      const v = latest.get(p.id + ":" + m)?.value;
      return v == null ? null : Number(v);
    };
    const views = get("views"),
      likes = get("likes"),
      comments = get("comments"),
      shares = get("shares");
    const dates = ["views", "likes", "comments", "shares"]
      .map((m) => latest.get(p.id + ":" + m)?.captured_at)
      .filter(Boolean)
      .map((v) => new Date(v).valueOf());
    const aligned =
      dates.length === 4 && Math.max(...dates) - Math.min(...dates) <= 3600000;
    return {
      ...p,
      views,
      likes,
      comments,
      shares,
      watchtime: get("watchtime"),
      rate:
        views && likes != null && comments != null && shares != null && aligned
          ? (likes + comments + shares) / views
          : null,
      age_days:
        p.published_at && dates.length
          ? Math.round(
              (Math.max(...dates) - new Date(p.published_at).valueOf()) /
                86400000,
            )
          : null,
    };
  });
  const valid = rows.filter((r) => r.rate != null);
  const totalViews = valid.reduce((s, r) => s + (r.views ?? 0), 0);
  return {
    rows,
    weighted_rate: totalViews
      ? valid.reduce(
          (s, r) => s + (r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0),
          0,
        ) / totalViews
      : null,
    sample_size: valid.length,
    small_sample: valid.length < 10,
    corrections: [...new Set(corrections)],
  };
}
export const jobKinds = [
  "health_check",
  "artist_concepts",
  "create_song_ideas",
  "write_lyrics",
  "revise_lyrics",
  "create_storyboard",
  "prepare_campaign",
  "analyze_metrics",
  "draft_reply",
  "render_video",
  "analyze_asset",
  "sync_metrics",
  "prepare_music_package",
  "suno_generate",
  "suno_sync",
  "veo_generate",
  "veo_sync",
] as const;
export type JobKind = (typeof jobKinds)[number];
export const statuses: Record<string, string> = {
  draft: "Entwurf",
  proposed: "Vorschlag",
  accepted: "Angenommen",
  rejected: "Abgelehnt",
  archived: "Archiviert",
  queued: "In Warteschlange",
  running: "In Arbeit",
  submitting: "Wird an Anbieter gesendet",
  waiting_for_input: "Wartet auf Import",
  waiting_for_approval: "Freigabe offen",
  waiting_for_provider: "Wartet auf Anbieter",
  succeeded: "Abgeschlossen",
  failed: "Fehlgeschlagen",
  cancelled: "Abgebrochen",
  blocked_external: "Extern nicht verfügbar",
  unknown_external_state: "Externer Status unklar",
  approved: "Freigegeben",
  invalidated: "Freigabe ungültig",
  published: "Manuell veröffentlicht",
  manual: "Manuell",
  unclear: "Rechte ungeklärt",
  operator_approved: "Durch Betreiber freigegeben",
  noncommercial: "Nur nichtkommerziell",
  disputed: "Gesperrt / streitig",
};
