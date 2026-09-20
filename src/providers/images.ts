import { imageModel, imageResult, aspectRatio } from "../lib/image-generation";
export class ImageProviderError extends Error {
  constructor(
    message: string,
    public definitive = false,
    public rejected = false,
  ) {
    super(message);
  }
}
export async function boundedJson(response: Response, limit = 22_000_000) {
  if (!response.body) throw new Error("Leere Antwort.");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error("Bildantwort zu groß.");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export class GeminiImageProvider {
  constructor(
    private key: string,
    private transport: typeof fetch = fetch,
  ) {}
  private async request(model: string, body?: unknown, signal?: AbortSignal) {
    try {
      const r = await this.transport(
        "https://generativelanguage.googleapis.com/v1/models/" +
          imageModel.parse(model) +
          (body ? ":generateContent" : ""),
        {
          method: body ? "POST" : "GET",
          headers: {
            "x-goog-api-key": this.key,
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          redirect: "error",
          signal: AbortSignal.any([
            AbortSignal.timeout(body ? 180000 : 15000),
            ...(signal ? [signal] : []),
          ]),
        },
      );
      if (!r.ok) {
        await r.body?.cancel();
        const rejected = [400, 401, 403, 404, 422, 429].includes(r.status);
        throw new ImageProviderError(
          r.status === 429
            ? "Gemini-Bildkontingent erreicht. Quote und Abrechnung prüfen."
            : [401, 403].includes(r.status)
              ? "Gemini-Bildzugriff abgewiesen. API-Key und Projektfreigabe prüfen."
              : `Gemini-Bildanfrage fehlgeschlagen (HTTP ${r.status}).`,
          rejected,
          rejected,
        );
      }
      return await boundedJson(r);
    } catch (e) {
      if (e instanceof ImageProviderError) throw e;
      throw new ImageProviderError(
        "Gemini-Bildantwort unklar oder Zeitlimit erreicht. Kein automatischer Neuauftrag; Abrechnung prüfen.",
      );
    }
  }
  async healthCheck(model: string) {
    const value = await this.request(model);
    if (
      value.name !== "models/" + model ||
      !value.supportedGenerationMethods?.includes("generateContent")
    )
      throw new ImageProviderError(
        "Das gewählte Bildmodell ist für diesen API-Key nicht verfügbar.",
        true,
        true,
      );
    return { ok: true, check: "model_metadata_only" };
  }
  async generate(
    input: { model: string; prompt: string; aspect_ratio: string },
    reference?: Buffer,
    signal?: AbortSignal,
  ) {
    const parts: unknown[] = [{ text: input.prompt }];
    if (reference)
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: reference.toString("base64"),
        },
      });
    const response = await this.request(
      input.model,
      {
        contents: [{ role: "user", parts }],
        generationConfig: {
          candidateCount: 1,
          responseModalities: ["TEXT", "IMAGE"],
          responseFormat: {
            image: {
              aspectRatio: aspectRatio.parse(input.aspect_ratio),
              ...(input.model === "gemini-2.5-flash-image"
                ? {}
                : { imageSize: "1K" }),
            },
          },
        },
      },
      signal,
    );
    const images = (response.candidates?.[0]?.content?.parts ?? [])
      .filter(
        (p: any) =>
          p.inlineData &&
          !p.thought &&
          ["image/png", "image/jpeg", "image/webp"].includes(
            p.inlineData.mimeType,
          ),
      )
      .map((p: any) => ({ data: p.inlineData.data }));
    if (!images.length)
      throw new ImageProviderError(
        "Gemini hat kein Bild geliefert (mögliche Inhaltsprüfung). Prompt prüfen; eventuellen Verbrauch beim Anbieter prüfen.",
        true,
      );
    return {
      result: imageResult.parse({ images }),
      usage: response.usageMetadata ?? null,
    };
  }
}
