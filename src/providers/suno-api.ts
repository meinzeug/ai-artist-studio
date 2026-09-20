import { z } from "zod";
export const SUNO_API_BASE = "https://api.sunoapi.org";
export const sunoModel = z.enum(["V6", "V6_WILD", "V6_MINI"]);
export const sunoOptions = z.object({
  model: sunoModel,
  instrumental: z.boolean().default(false),
  vocalGender: z.enum(["m", "f"]).optional(),
  duration: z.number().int().min(10).max(360).optional(),
  styleWeight: z.number().min(0).max(1).optional(),
  weirdnessConstraint: z.number().min(0).max(1).optional(),
});
export class SunoApiError extends Error {
  constructor(
    message: string,
    public definitive = false,
  ) {
    super(message);
  }
}
export function generationRequest(
  packet: any,
  options: unknown,
  callback: string,
) {
  const opts = sunoOptions.parse(options);
  return z
    .object({
      title: z.string().min(1).max(80),
      style: z.string().min(1).max(1000),
      prompt: z.string().max(5000),
      negativeTags: z.string().max(1000),
      customMode: z.literal(true),
      callBackUrl: z.url(),
      model: sunoModel,
      instrumental: z.boolean(),
      vocalGender: z.enum(["m", "f"]).optional(),
      duration: z.number().optional(),
      styleWeight: z.number().optional(),
      weirdnessConstraint: z.number().optional(),
    })
    .refine(
      (v) => v.instrumental || !!v.prompt.trim(),
      "Lyrics für Gesangsproduktion erforderlich",
    )
    .parse({
      title: packet.title,
      style: packet.style_prompt,
      prompt: opts.instrumental ? "" : packet.lyrics,
      negativeTags: packet.negative_prompt ?? "",
      customMode: true,
      callBackUrl: callback,
      ...opts,
    });
}
const trackSchema = z
  .object({
    id: z.string().min(1).max(200),
    audio_url: z.url().optional(),
    audioUrl: z.url().optional(),
    title: z.string().optional(),
    model_name: z.string().optional(),
    duration: z.number().optional(),
  })
  .refine((t) => !!(t.audio_url || t.audioUrl), "Audio-URL fehlt");
export type SunoTrack = z.infer<typeof trackSchema>;
const statuses = [
  "PENDING",
  "TEXT_SUCCESS",
  "FIRST_SUCCESS",
  "SUCCESS",
  "CREATE_TASK_FAILED",
  "GENERATE_AUDIO_FAILED",
  "CALLBACK_EXCEPTION",
  "SENSITIVE_WORD_ERROR",
] as const;
export class SunoApiClient {
  constructor(
    private key: string,
    private transport: typeof fetch = fetch,
  ) {}
  private async request(path: string, body?: unknown, signal?: AbortSignal) {
    let response: Response;
    try {
      response = await this.transport(SUNO_API_BASE + path, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: "Bearer " + this.key,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "error",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
          : AbortSignal.timeout(20000),
      });
    } catch {
      throw new SunoApiError(
        "SunoAPI.org nicht erreichbar oder Zeitlimit erreicht. Bei gesendetem Auftrag ist der externe Status unklar.",
      );
    }
    let envelope: any;
    try {
      const text = await response.text();
      if (text.length > 2_000_000) throw new Error();
      envelope = JSON.parse(text);
    } catch {
      throw new SunoApiError(
        "SunoAPI.org lieferte keine gültige Antwort. Externen Status prüfen.",
      );
    }
    const code = envelope.code ?? response.status;
    if (!response.ok || code !== 200) {
      const messages: Record<number, string> = {
        400: "Parameter abgewiesen. Lyrics und Einstellungen prüfen.",
        401: "API-Schlüssel ungültig oder abgelaufen.",
        403: "API-Zugriff nicht freigeschaltet.",
        404: "Auftrag oder API-Ressource nicht gefunden.",
        405: "Anfragelimit erreicht.",
        413: "Text überschreitet das Anbieterlimit.",
        429: "Nicht genügend Anbieter-Credits.",
        430: "Zu viele Anfragen.",
        455: "Anbieterwartung. Später Status prüfen.",
      };
      throw new SunoApiError(
        "SunoAPI.org: " +
          (messages[code] ?? "Anbieterfehler; externen Status prüfen."),
        [400, 401, 403, 404, 405, 413, 429, 430].includes(code),
      );
    }
    return envelope.data;
  }
  async credits(signal?: AbortSignal) {
    return z
      .number()
      .nonnegative()
      .parse(await this.request("/api/v1/generate/credit", undefined, signal));
  }
  async generate(body: unknown, signal?: AbortSignal) {
    return z
      .object({ taskId: z.string().min(1).max(200) })
      .parse(await this.request("/api/v1/generate", body, signal)).taskId;
  }
  async status(taskId: string, signal?: AbortSignal) {
    const data = await this.request(
      "/api/v1/generate/record-info?" + new URLSearchParams({ taskId }),
      undefined,
      signal,
    );
    const parsed = z
      .object({
        taskId: z.string(),
        status: z.enum(statuses),
        response: z
          .object({ sunoData: z.array(z.unknown()).max(10).nullish() })
          .nullish(),
      })
      .parse(data);
    if (parsed.taskId !== taskId)
      throw new SunoApiError("Antwort gehört zu einem anderen Auftrag.");
    return {
      status: parsed.status,
      tracks: (["SUCCESS", "CALLBACK_EXCEPTION"].includes(parsed.status)
        ? z.array(trackSchema).parse(parsed.response?.sunoData ?? [])
        : []) as SunoTrack[],
    };
  }
}
