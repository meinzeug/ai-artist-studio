import { z } from "zod";
import { veoModel } from "../lib/video-generation";
import type { Capability } from "./contracts";

const BASE = "https://generativelanguage.googleapis.com/v1beta/";
export const operationName = z
  .string()
  .max(300)
  .regex(
    /^models\/veo-3\.1-(?:fast-)?generate-preview\/operations\/[A-Za-z0-9_-]+$/,
    "Ungültige Veo-Auftragskennung.",
  );
export class VeoError extends Error {
  constructor(
    message: string,
    public definitive = false,
  ) {
    super(message);
  }
}
export class VeoProvider {
  constructor(
    private key: string,
    private transport: typeof fetch = fetch,
  ) {}
  capabilities(): Capability {
    return {
      documented: true,
      implemented: true,
      configured: !!this.key,
      liveTested: false,
      alternative: "Bilder und Suno-Audio lokal mit FFmpeg rendern",
    };
  }
  private async request(path: string, body?: unknown, signal?: AbortSignal) {
    try {
      const response = await this.transport(BASE + path, {
        method: body ? "POST" : "GET",
        headers: {
          "x-goog-api-key": this.key,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "error",
        signal: AbortSignal.any([
          AbortSignal.timeout(30000),
          ...(signal ? [signal] : []),
        ]),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new VeoError(
          response.status === 401 || response.status === 403
            ? "Google-Zugriff abgewiesen. API-Key, Projektfreigabe und Abrechnung prüfen."
            : response.status === 429
              ? "Google-Kontingent erreicht. Quoten und Abrechnung prüfen."
              : `Veo-Anfrage fehlgeschlagen (HTTP ${response.status}).`,
          [400, 401, 403, 404, 422, 429].includes(response.status),
        );
      }
      if (!response.body) throw new Error("missing body");
      const reader = response.body.getReader(),
        parts: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 2 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("size");
        }
        parts.push(value);
      }
      return JSON.parse(Buffer.concat(parts).toString("utf8"));
    } catch (e) {
      if (e instanceof VeoError) throw e;
      // Never echo provider bodies, fetch URLs or secrets into logs/UI.
      throw new VeoError(
        "Veo-Antwort unklar oder Zeitlimit erreicht. Status prüfen; kein automatischer Neuauftrag.",
      );
    }
  }
  async healthCheck(model: string) {
    const name = "models/" + veoModel.parse(model);
    const value = await this.request(name);
    if (
      value.name !== name ||
      !value.supportedGenerationMethods?.includes("predictLongRunning")
    )
      throw new VeoError(
        "Dieses Konto meldet das gewählte Veo-Modell nicht mit Videofunktion. Modellzugang prüfen.",
        true,
      );
    return {
      ok: true,
      message:
        "Modellzugriff geprüft; keine kostenpflichtige Generation ausgeführt.",
    };
  }
  async start(
    input: {
      model: string;
      prompt: string;
      negative_prompt: string;
      duration: number;
    },
    image: Buffer,
    signal?: AbortSignal,
  ) {
    const value = await this.request(
      "models/" + veoModel.parse(input.model) + ":predictLongRunning",
      {
        instances: [
          {
            prompt: input.prompt,
            image: {
              bytesBase64Encoded: image.toString("base64"),
              mimeType: "image/jpeg",
            },
          },
        ],
        parameters: {
          aspectRatio: "9:16",
          resolution: "720p",
          durationSeconds: input.duration,
          sampleCount: 1,
          personGeneration: "allow_adult",
          ...(input.negative_prompt
            ? { negativePrompt: input.negative_prompt }
            : {}),
        },
      },
      signal,
    );
    const parsed = operationName.safeParse(value.name);
    if (
      !parsed.success ||
      !parsed.data.startsWith("models/" + input.model + "/")
    )
      throw new VeoError(
        "Veo hat keine gültige Auftragskennung geliefert. Externen Status klären.",
      );
    return parsed.data;
  }
  async status(name: string, signal?: AbortSignal) {
    const value = await this.request(
      operationName.parse(name),
      undefined,
      signal,
    );
    if (value.name !== name)
      throw new VeoError("Veo-Status gehört nicht zum angeforderten Auftrag.");
    if (value.done !== true) {
      if (value.done !== undefined && value.done !== false)
        throw new VeoError("Ungültiger Veo-Status.");
      return { state: "waiting_for_provider" as const };
    }
    if (value.error)
      return {
        state: "failed" as const,
        error:
          "Google hat den Videoauftrag beendet (Fehler oder Inhaltsprüfung). Abrechnung beim Anbieter prüfen.",
      };
    const result = value.response?.generateVideoResponse;
    const uri = result?.generatedSamples?.[0]?.video?.uri;
    if (!uri)
      return {
        state: "failed" as const,
        error:
          "Google hat kein Video geliefert; mögliche Inhaltsprüfung. Abrechnung beim Anbieter prüfen.",
      };
    return { state: "succeeded" as const, uri: z.url().parse(uri) };
  }
  async download(uri: string, signal?: AbortSignal) {
    const { downloadMedia } = await import("../server/remote-media");
    const u = new URL(uri);
    if (
      u.origin !== "https://generativelanguage.googleapis.com" ||
      u.username ||
      u.password ||
      !/^\/(?:download\/)?(?:v1|v1beta)\/files\/[A-Za-z0-9_-]+(?::download)?$/.test(
        u.pathname,
      )
    )
      throw new VeoError(
        "Unzulässige Veo-Downloadadresse. Kein API-Key übertragen.",
        true,
      );
    return downloadMedia(uri, signal, 0, {
      accept: "video/*",
      headers: { "x-goog-api-key": this.key },
    });
  }
}
