import { authDirectory, persistRefresh } from "./auth";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  copyFile,
  access,
  realpath,
  readdir,
  lstat,
} from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { runProcess } from "../lib/process";
import { z } from "zod";
export type ProviderName = "codex" | "gemini";
export type TextTaskOptions = { webSearch?: boolean; audio?: Buffer };
export function neutralizeFileMentions(prompt: string) {
  return prompt.replace(/@/g, "＠");
}
export function searchActivity(provider: ProviderName, stdout: string) {
  if (provider === "gemini") {
    const stats = JSON.parse(stdout).stats?.tools?.byName?.google_web_search;
    return {
      executed: Number(stats?.totalCalls ?? 0) > 0,
      calls: Number(stats?.totalCalls ?? 0),
    };
  }
  const calls = stdout.split("\n").flatMap((line) => {
    try {
      const e = JSON.parse(line);
      return e.type === "item.completed" && e.item?.type === "web_search"
        ? [e.item.action ?? { query: e.item.query }]
        : [];
    } catch {
      return [];
    }
  });
  return {
    executed: calls.length > 0,
    calls: calls.length,
    queries: calls
      .map((x) => x.query)
      .filter(Boolean)
      .slice(0, 10),
  };
}
export interface TextProvider {
  detect(): Promise<unknown>;
  healthCheck(signal?: AbortSignal): Promise<unknown>;
  getCapabilities(): unknown;
  runStructuredTask(
    prompt: string,
    schema: any,
    signal?: AbortSignal,
    options?: TextTaskOptions,
  ): Promise<{ result: unknown; usage: unknown }>;
  cancel(id: string): void;
  getUsage(): unknown;
}
export function parseProviderOutput(provider: ProviderName, stdout: string) {
  if (provider === "gemini") {
    const envelope = JSON.parse(stdout);
    if (envelope.error)
      throw new Error(envelope.error.message ?? "Gemini-Anbieterfehler");
    return { text: envelope.response, usage: envelope.stats ?? null };
  }
  let text = "",
    usage: unknown = null;
  for (const line of stdout.trim().split("\n")) {
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type === "item.completed" && e.item?.type === "agent_message")
      text = e.item.text;
    if (e.type === "turn.completed") usage = e.usage;
    if (e.type === "turn.failed")
      throw new Error(e.error?.message ?? "Codex-Auftrag fehlgeschlagen.");
  }
  if (!text) throw new Error("Kein fachliches Ergebnis in der CLI-Antwort.");
  return { text, usage };
}
export function classifyError(message: string) {
  if (
    /UNSUPPORTED_CLIENT|IneligibleTierError|client is no longer supported/i.test(
      message,
    )
  )
    return "Google unterstützt diesen Gemini-CLI-Zugang derzeit nicht (UNSUPPORTED_CLIENT). Die gespeicherte Anmeldung genügt nicht. Kein Wechsel zu einer kostenpflichtigen API. In Stil & Quellen kann die Höranalyse ausgelassen werden.";
  if (/quota|rate.limit|usage.limit|429|exhausted/i.test(message))
    return "Quota erreicht. Kontolimits prüfen und später manuell erneut starten.";
  if (/auth|login|credential|401|sign.in|not logged/i.test(message))
    return "CLI-Anmeldung fehlt oder ist abgelaufen. Im separaten Runner offiziell anmelden.";
  if (/Zeitlimit|timeout/i.test(message))
    return "CLI-Zeitlimit überschritten. Auftrag wurde beendet.";
  return message
    .replace(/(?:sk-|Bearer\s+)[A-Za-z0-9_.-]+/g, "[MASKIERT]")
    .slice(0, 1200);
}
export function cliSchema(schema: any): any {
  if (Array.isArray(schema)) return schema.map(cliSchema);
  if (schema && typeof schema === "object") {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(schema)) {
      if (["$schema", "default", "format"].includes(key)) continue;
      out[key] = cliSchema(value);
    }
    if (out.type === "object" && out.properties) {
      out.required = Object.keys(out.properties);
      out.additionalProperties = false;
    }
    return out;
  }
  return schema;
}
export function requireChatgptLogin(auth: Record<string, unknown>) {
  if (auth.OPENAI_API_KEY || (auth.auth_mode && auth.auth_mode !== "chatgpt"))
    throw new Error(
      "Codex benötigt den offiziellen ChatGPT-Login. API-Key-Authentifizierung ist für diesen Runner nicht freigegeben.",
    );
  if (!auth.tokens || typeof auth.tokens !== "object")
    throw new Error(
      "Codex CLI-Anmeldung fehlt. Im Runner mit ChatGPT anmelden.",
    );
}
export class CliProvider implements TextProvider {
  constructor(public provider: ProviderName) {}
  private usage: unknown = null;
  private controller: AbortController | null = null;
  cancel(_id?: string) {
    this.controller?.abort();
  }
  getUsage() {
    return this.usage;
  }
  getCapabilities() {
    return {
      structuredText: true,
      audioUnderstanding: this.provider === "gemini",
      webSearch: true,
      imageGeneration: this.provider === "codex",
      videoGeneration: false,
      musicGeneration: false,
      tools: false,
    };
  }
  async detect() {
    const r = await runProcess(this.provider, ["--version"], {
      timeout: 10000,
      env: { NODE_ENV: "production", PATH: process.env.PATH, HOME: tmpdir() },
    });
    return {
      installed: r.code === 0,
      version: r.stdout.trim(),
      capabilities: this.getCapabilities(),
    };
  }
  async healthCheck(signal?: AbortSignal) {
    return this.runStructuredTask(
      'Antworte als Verbindungstest exakt mit {"ok":true,"message":"Verbindung hergestellt"}. Keine Tools verwenden.',
      z.toJSONSchema(z.object({ ok: z.boolean(), message: z.string() })),
      signal,
    );
  }
  async runStructuredTask(
    prompt: string,
    schema: any,
    signal?: AbortSignal,
    options: TextTaskOptions = {},
  ) {
    if (options.audio && this.provider !== "gemini")
      throw new Error(
        "Audioverständnis ist nur über den ausdrücklich gewählten Gemini-CLI-Weg verfügbar.",
      );
    return this.runTask(prompt, schema, signal, undefined, options);
  }
  async runImageTask(prompt: string, reference?: Buffer, signal?: AbortSignal) {
    if (this.provider !== "codex")
      throw new Error("Native Bildgenerierung ist nur für Codex eingerichtet.");
    return this.runTask(prompt, null, signal, { reference });
  }
  private async runTask(
    prompt: string,
    schema: any,
    signal?: AbortSignal,
    image?: { reference?: Buffer },
    options: TextTaskOptions = {},
  ) {
    this.controller = new AbortController();
    const combined = signal
      ? AbortSignal.any([signal, this.controller.signal])
      : this.controller.signal;
    const temp = await mkdtemp(path.join(tmpdir(), "studio-cli-"));
    try {
      const home = path.join(temp, "home");
      await mkdir(home, { mode: 0o700 });
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: "production",
        PATH: process.env.PATH,
        HOME: home,
        LANG: "C.UTF-8",
        TMPDIR: temp,
        NO_COLOR: "1",
      };
      if (!image)
        await writeFile(
          path.join(temp, "schema.json"),
          JSON.stringify(cliSchema(schema)),
          { mode: 0o600 },
        );
      let executable = this.provider,
        args: string[] = [];
      if (this.provider === "codex") {
        const auth = await authDirectory("codex");
        const ownHome = path.join(home, ".codex");
        await mkdir(ownHome, { mode: 0o700 });
        try {
          await copyFile(
            path.join(auth, "auth.json"),
            path.join(ownHome, "auth.json"),
          );
        } catch {
          throw new Error(
            "Codex CLI-Anmeldung fehlt. codex login im Runner ausführen.",
          );
        }
        requireChatgptLogin(
          JSON.parse(await readFile(path.join(ownHome, "auth.json"), "utf8")),
        );
        env.CODEX_HOME = ownHome;
        args = [
          "exec",
          "--ignore-user-config",
          "--ignore-rules",
          "--skip-git-repo-check",
          "--ephemeral",
          "--sandbox",
          "read-only",
          "-c",
          'approval_policy="never"',
          "-c",
          options.webSearch ? 'web_search="live"' : 'web_search="disabled"',
          "-c",
          "agents.enabled=false",
          "-c",
          "features.shell_tool=false",
          "-c",
          "features.unified_exec=false",
          "-c",
          "features.apps=false",
          "-c",
          "features.hooks=false",
          "-c",
          "features.browser_use=false",
          "-c",
          "features.computer_use=false",
          "-c",
          "features.multi_agent=false",
          "-c",
          "features.image_generation=" + !!image,
          ...(image ? [] : ["--output-schema", path.join(temp, "schema.json")]),
          "--json",
          "-",
        ];
      } else {
        const auth = await authDirectory("gemini");
        const ownHome = path.join(home, ".gemini");
        await mkdir(ownHome, { mode: 0o700 });
        try {
          await copyFile(
            path.join(auth, "oauth_creds.json"),
            path.join(ownHome, "oauth_creds.json"),
          );
        } catch {
          throw new Error(
            "Gemini CLI-Anmeldung fehlt. gemini im Runner ausführen und mit Google anmelden.",
          );
        }
        await writeFile(
          path.join(ownHome, "settings.json"),
          JSON.stringify({
            security: { auth: { selectedType: "oauth-personal" } },
            tools: {
              core: options.webSearch ? ["google_web_search"] : [],
              exclude: [
                "run_shell_command",
                "read_file",
                "write_file",
                "replace",
                "list_directory",
                "glob",
                "grep_search",
                ...(options.webSearch ? [] : ["google_web_search"]),
                "web_fetch",
                "save_memory",
              ],
            },
            mcpServers: {},
            context: { fileName: [] },
            general: { enableAutoUpdate: false },
            model: { maxSessionTurns: 8 },
          }),
        );
        await writeFile(
          path.join(temp, "deny.toml"),
          '[[rule]]\ntoolName = "*"\ndecision = "deny"\npriority = 999\n' +
            (options.webSearch
              ? '\n[[rule]]\ntoolName = "google_web_search"\ndecision = "allow"\npriority = 1000\n'
              : ""),
        );
        args = [
          "--skip-trust",
          "--output-format",
          "json",
          "--approval-mode",
          "default",
          "--admin-policy",
          path.join(temp, "deny.toml"),
          "-e",
          "none",
          "-p",
          "Antworte ausschließlich mit JSON passend zum im Text angegebenen Schema.",
        ];
        // Gemini expands @file references before the model runs, including in stdin.
        // Only our fixed audio attachment may become a file inclusion.
        prompt = neutralizeFileMentions(prompt);
        if (options.audio) {
          if (options.audio.length > 4_000_000)
            throw new Error("Audioauszug zu groß.");
          await writeFile(path.join(temp, "reference.mp3"), options.audio, {
            mode: 0o600,
          });
          prompt +=
            "\nAnalysiere den tatsächlich beigefügten Audioauszug: @./reference.mp3";
        }
        prompt += "\nJSON-Schema: " + JSON.stringify(schema);
      }
      if (image?.reference) {
        const file = path.join(temp, "reference.png");
        await writeFile(file, image.reference, { mode: 0o600 });
        args.splice(args.length - 1, 0, "--image", file);
      }
      const found = await runProcess("/usr/bin/which", [executable], {
        timeout: 5000,
      });
      if (found.code) throw new Error("CLI nicht installiert.");
      const script = await realpath(found.stdout.trim());
      const isolate = path.resolve(
        process.env.RUNNER_ISOLATE_BIN || ".local/studio-isolate",
      );
      await access(isolate);
      const node = await realpath(process.execPath);
      const cliRoot = process.env.RUNNER_CLI_ROOT;
      const prefixes = [
        ...(cliRoot
          ? [
              "--ro",
              path.resolve(cliRoot),
              "--exec",
              path.join(path.resolve(cliRoot), "@openai/codex-linux-x64"),
            ]
          : []),
        "--ro",
        "/usr",
        "--exec",
        "/usr/lib",
        "--exec",
        "/usr/local/lib",
        "--exec",
        "/lib",
        "--exec",
        "/lib64",
        "--ro",
        "/etc/ssl",
        "--ro",
        "/etc/resolv.conf",
        "--ro",
        "/etc/hosts",
        "--ro",
        "/etc/nsswitch.conf",
        "--ro",
        "/etc/ld.so.cache",
        "--ro",
        "/dev/urandom",
        "--rw",
        "/dev/null",
        "--ro",
        path.dirname(path.dirname(node)),
        "--exec",
        node,
        "--ro",
        path.dirname(script),
        "--rw",
        temp,
        "--",
        node,
        script,
      ];
      const result = await runProcess(isolate, [...prefixes, ...args], {
        cwd: temp,
        env,
        input: prompt,
        timeout: image ? 540000 : Number(process.env.CLI_TIMEOUT_MS) || 180000,
        maxBytes: 4_000_000,
        signal: combined,
      });
      await persistRefresh(
        this.provider,
        await authDirectory(this.provider),
        path.join(
          home,
          this.provider === "codex" ? ".codex" : ".gemini",
          this.provider === "codex" ? "auth.json" : "oauth_creds.json",
        ),
      );
      if (result.code !== 0)
        throw new Error(classifyError(result.stderr + " " + result.stdout));
      if (image) {
        const images: { data: string }[] = [];
        let total = 0,
          count = 0;
        async function collect(dir: string, depth = 0) {
          if (depth > 4) return;
          for (const entry of await readdir(dir, { withFileTypes: true }).catch(
            () => [],
          )) {
            if (++count > 100) throw new Error("Zu viele Bildausgabedateien.");
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) await collect(file, depth + 1);
            else if (
              entry.isFile() &&
              /\.(png|jpe?g|webp)$/i.test(entry.name)
            ) {
              const info = await lstat(file);
              total += info.size;
              if (total > 15_000_000 || images.length >= 4)
                throw new Error("Bildausgabe überschreitet das Größenlimit.");
              images.push({ data: (await readFile(file)).toString("base64") });
            }
          }
        }
        await collect(path.join(home, ".codex", "generated_images"));
        if (!images.length)
          throw new Error(
            "Codex hat kein Bild ausgegeben. Native Bildfunktion und Kontingent dieses ChatGPT-Kontos prüfen. Kein API-Fallback ausgeführt.",
          );
        for (const line of result.stdout.split("\n")) {
          try {
            const event = JSON.parse(line);
            if (event.type === "turn.completed")
              this.usage = event.usage ?? null;
          } catch {}
        }
        return { result: { images }, usage: this.usage };
      }
      const parsed = parseProviderOutput(this.provider, result.stdout);
      let data;
      try {
        data = JSON.parse(parsed.text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      } catch {
        throw new Error(
          "CLI lieferte kein gültiges JSON. Es wurden keine Inhalte übernommen.",
        );
      }
      this.usage = parsed.usage;
      const activity = options.webSearch
        ? searchActivity(this.provider, result.stdout)
        : null;
      if (options.webSearch && !activity?.executed)
        throw new Error(
          "Recherche hat keine bestätigte Websuche ausgeführt. Keine Quellen als live recherchiert übernommen.",
        );
      return {
        result: data,
        usage: parsed.usage,
        ...(activity ? { research: activity } : {}),
        ...(options.audio ? { audio_input: true } : {}),
      };
    } finally {
      this.controller = null;
      await rm(temp, { recursive: true, force: true });
    }
  }
}
