import { config } from "dotenv";
config({ path: process.env.RUNNER_ENV_FILE ?? ".env.runner", quiet: true });
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { CliProvider, classifyError } from "./provider";
import { z } from "zod";
import { imageResult } from "../lib/image-generation";
import {
  startLogin,
  loginStatus,
  submitLoginCode,
  cancelLogin,
  disconnectLogin,
  loginBusy,
  authStatus,
} from "./auth";
if (process.getuid?.() === 0)
  throw new Error("Runner darf nicht als Root laufen.");
const token = process.env.RUNNER_TOKEN;
if (!token || token.length < 32)
  throw new Error("RUNNER_TOKEN mit mindestens 32 Zeichen erforderlich.");
// Drop unrelated application secrets before any CLI process can be spawned.
for (const key of Object.keys(process.env))
  if (
    /DATABASE|REDIS|TIKTOK|SUNO|ENCRYPTION|OPENAI_API_KEY|CODEX_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY/.test(
      key,
    )
  )
    delete process.env[key];
const active = new Map<string, AbortController>();
const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const supplied = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
  if (
    supplied.length !== token.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
  ) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: "Nicht autorisiert." }));
    return;
  }
  try {
    if (req.method === "GET" && req.url === "/health") {
      const results = await Promise.allSettled(
        ["codex", "gemini"].map((x) =>
          Promise.all([
            new CliProvider(x as "codex" | "gemini").detect(),
            authStatus(x as "codex" | "gemini"),
          ]).then(([d, a]) => ({ ...d, ...a })),
        ),
      );
      res.end(
        JSON.stringify({
          providers: results.map((r, i) => ({
            provider: i ? "gemini" : "codex",
            ...(r.status === "fulfilled"
              ? (r.value as object)
              : { installed: false, error: "CLI nicht gefunden." }),
          })),
          active: active.size,
        }),
      );
      return;
    }
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > (req.url === "/image" ? 6_000_000 : 200000))
        throw new Error("Eingabe zu groß.");
    }
    const data = JSON.parse(raw);
    if (req.method !== "POST") throw new Error("POST erforderlich.");
    if (req.url === "/auth") {
      const d = z
        .object({
          action: z.enum(["start", "status", "code", "cancel", "disconnect"]),
          provider: z.enum(["codex", "gemini"]),
          owner: z.uuid(),
          id: z.uuid().optional(),
          code: z.string().max(2048).optional(),
        })
        .parse(data);
      if (active.size && ["start", "disconnect"].includes(d.action))
        throw new Error(
          "KI-Auftrag läuft. Anmeldung nach dessen Abschluss ändern.",
        );
      const result =
        d.action === "start"
          ? await startLogin(d.provider, d.owner)
          : d.action === "disconnect"
            ? await disconnectLogin(d.provider)
            : d.action === "status"
              ? loginStatus(d.id!, d.owner)
              : d.action === "cancel"
                ? cancelLogin(d.id!, d.owner)
                : submitLoginCode(d.id!, d.owner, d.code ?? "");
      res.end(JSON.stringify(result));
      return;
    }
    if (req.url !== "/cancel" && req.url !== "/run" && req.url !== "/image")
      throw new Error("Unbekannte Runner-Funktion.");
    if (req.url === "/cancel") {
      active.get(z.string().uuid().parse(data.id))?.abort();
      res.end('{"ok":true}');
      return;
    }
    const input = z
      .object({
        id: z.string().uuid(),
        provider: z.enum(["codex", "gemini"]).default("codex"),
        reference: z
          .string()
          .max(5_500_000)
          .regex(/^[A-Za-z0-9+/]+={0,2}$/)
          .optional(),
        prompt: z.string().max(150000),
        schema: z.record(z.string(), z.unknown()).default({}),
      })
      .parse(data);
    if (active.size >= 1 || loginBusy()) {
      res.writeHead(429);
      res.end('{"error":"Runner ausgelastet."}');
      return;
    }
    const controller = new AbortController();
    active.set(input.id, controller);
    try {
      const result =
        req.url === "/image"
          ? await new CliProvider("codex").runImageTask(
              input.prompt,
              input.reference
                ? Buffer.from(input.reference, "base64")
                : undefined,
              controller.signal,
            )
          : await new CliProvider(input.provider).runStructuredTask(
              input.prompt,
              input.schema,
              controller.signal,
            );
      if (req.url === "/image") imageResult.parse(result.result);
      res.end(JSON.stringify(result));
    } finally {
      active.delete(input.id);
    }
  } catch (e) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: classifyError((e as Error).message) }));
  }
});
server.listen(
  Number(process.env.RUNNER_PORT) || 3211,
  process.env.RUNNER_BIND || "127.0.0.1",
  () => console.log("CLI-Runner bereit (Parallelität 1)."),
);
