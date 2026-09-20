export type Capability = {
  documented: boolean;
  implemented: boolean;
  configured: boolean;
  liveTested: boolean;
  reason?: string;
  alternative: string;
};
export interface MusicProvider {
  capabilities(): Promise<Record<string, Capability>>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
  startProduction(
    input: unknown,
  ): Promise<{ state: string; externalId?: string }>;
  getStatus(id: string): Promise<{ state: string }>;
  importResults(id: string): Promise<unknown[]>;
  getUsage(): Promise<{ credits: number | null; cost: number | null }>;
}
export class SunoProvider implements MusicProvider {
  async capabilities() {
    return {
      manual: {
        documented: true,
        implemented: true,
        configured: true,
        liveTested: false,
        alternative: "Produktionspaket exportieren und Audio importieren",
      },
      api: {
        documented: false,
        implemented: false,
        configured: false,
        liveTested: false,
        reason:
          "Suno Platform benötigt tatsächlichen Kontozugang und überprüfbare Endpoint-Dokumentation.",
        alternative: "Manueller Suno-Workflow",
      },
    };
  }
  async healthCheck() {
    return {
      ok: false,
      message: "REST-API nicht verbunden. Manueller Suno-Workflow verfügbar.",
    };
  }
  async startProduction(): Promise<{ state: string }> {
    throw new Error(
      "Suno-API nicht verfügbar. Kein externer Auftrag gesendet.",
    );
  }
  async getStatus() {
    return { state: "blocked_external" };
  }
  async importResults() {
    return [];
  }
  async getUsage() {
    return { credits: null, cost: null };
  }
}
export interface MediaProvider {
  kind: "image" | "video";
  capabilities(): Capability;
  supportsReferences: boolean;
  supportsSeed: boolean;
  generate(input: unknown, reservationId: string): Promise<unknown>;
}
export class UnconfiguredMediaProvider implements MediaProvider {
  supportsReferences = false;
  supportsSeed = false;
  constructor(public kind: "image" | "video") {}
  capabilities() {
    return {
      documented: false,
      implemented: false,
      configured: false,
      liveTested: false,
      reason: "Kein Anbieter ausdrücklich konfiguriert.",
      alternative: "Dateiimport und lokale FFmpeg-Vorlagen",
    };
  }
  async generate(): Promise<never> {
    throw new Error("Generierungsprovider und freigegebenes Budget fehlen.");
  }
}
export function postingCapability(): Capability {
  return {
    documented: true,
    implemented: false,
    configured: false,
    liveTested: false,
    reason:
      "Private interne Uploadwerkzeuge sind kein vorgesehener Direct-Post-Anwendungsfall. Neue Zulässigkeitsprüfung, Review und Kontoberechtigung erforderlich.",
    alternative: "TikTok-Exportpaket und manueller Nachweis",
  };
}
