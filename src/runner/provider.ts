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
} from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { runProcess } from "../lib/process";
import { z } from "zod";
export type ProviderName = "codex" | "gemini";
export interface TextProvider {
  detect(): Promise<unknown>;
  healthCheck(signal?: AbortSignal): Promise<unknown>;
  getCapabilities(): unknown;
  runStructuredTask(
    prompt: string,
    schema: any,
    signal?: AbortSignal,
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
      audioUnderstanding: false,
      imageGeneration: false,
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
  async runStructuredTask(prompt: string, schema: any, signal?: AbortSignal) {
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
          'web_search="disabled"',
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
          "features.image_generation=false",
          "--output-schema",
          path.join(temp, "schema.json"),
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
              core: [],
              exclude: [
                "run_shell_command",
                "read_file",
                "write_file",
                "replace",
                "list_directory",
                "glob",
                "grep_search",
                "google_web_search",
                "web_fetch",
                "save_memory",
              ],
            },
            mcpServers: {},
            context: { fileName: [] },
            general: { enableAutoUpdate: false },
          }),
        );
        await writeFile(
          path.join(temp, "deny.toml"),
          '[[rule]]\ntoolName = "*"\ndecision = "deny"\npriority = 999\n',
        );
        args = [
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
        prompt += "\nJSON-Schema: " + JSON.stringify(schema);
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
        timeout: Number(process.env.CLI_TIMEOUT_MS) || 180000,
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
      return { result: data, usage: parsed.usage };
    } finally {
      this.controller = null;
      await rm(temp, { recursive: true, force: true });
    }
  }
}
