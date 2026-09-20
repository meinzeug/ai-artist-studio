import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHmac } from "node:crypto";
import {
  resolveLocalTime,
  preserveProtected,
  summarizeMetrics,
  similarity,
  timelineSchema,
} from "../src/lib/domain";
import {
  passwordHash,
  verifyPassword,
  validFilename,
  hash,
  encrypt,
  decrypt,
  verifyWebhook,
  safeRemoteUrl,
} from "../src/server/security";
import { parseProviderOutput, classifyError } from "../src/runner/provider";
import { runProcess } from "../src/lib/process";
import { assText, makeAss } from "../src/server/media";
import { saveUpload } from "../src/server/storage";
import { pool } from "../src/server/db";
import { after } from "node:test";
after(() => pool.end());
test("Sommerzeit: nicht existente und doppelte Uhrzeit werden abgelehnt", () => {
  assert.throws(() => resolveLocalTime("2026-03-29T02:30", "Europe/Berlin"));
  assert.throws(() => resolveLocalTime("2026-10-25T02:30", "Europe/Berlin"));
  assert.equal(
    resolveLocalTime("2026-10-25T02:30", "Europe/Berlin", "earlier"),
    "2026-10-25T00:30:00Z",
  );
  assert.equal(
    resolveLocalTime("2026-10-25T02:30", "Europe/Berlin", "later"),
    "2026-10-25T01:30:00Z",
  );
});
test("Geschützte menschliche Passagen dürfen nicht verändert werden", () => {
  assert.equal(
    preserveProtected("Neu\nMein Satz", ["Mein Satz"]),
    "Neu\nMein Satz",
  );
  assert.throws(() => preserveProtected("Neu\nDein Satz", ["Mein Satz"]));
});
test("Kennzahlen: null, jüngster kumulativer Wert, gewichtete Rate und Korrekturen", () => {
  const posts = [
    { id: "a", published_at: "2026-09-01T12:00:00Z" },
    { id: "b", published_at: "2026-09-01T12:00:00Z" },
    { id: "c" },
  ];
  const snapshots = [
    {
      post_id: "a",
      metric: "views",
      value: 150,
      captured_at: "2026-09-02T00:00:00Z",
    },
    ...Object.entries({ views: 100, likes: 10, comments: 0, shares: 0 }).map(
      ([metric, value]) => ({
        post_id: "a",
        metric,
        value,
        captured_at: "2026-09-03T00:00:00Z",
      }),
    ),
    ...Object.entries({ views: 900, likes: 20, comments: 10, shares: 10 }).map(
      ([metric, value]) => ({
        post_id: "b",
        metric,
        value,
        captured_at: "2026-09-03T00:00:00Z",
      }),
    ),
  ];
  const result = summarizeMetrics(posts, snapshots);
  assert.equal(result.rows[0].views, 100);
  assert.equal(result.rows[2].views, null);
  assert.equal(result.rows[2].rate, null);
  assert.equal(result.weighted_rate, 0.05);
  assert.deepEqual(result.corrections, ["a"]);
  assert.equal(result.small_sample, true);
});
test("Abweichende Beobachtungszeiten erzeugen keine scheinpräzise Rate", () => {
  const values = ["views", "likes", "comments", "shares"].map((metric, i) => ({
    post_id: "x",
    metric,
    value: 10,
    captured_at: `2026-09-0${i + 1}T12:00:00Z`,
  }));
  assert.equal(summarizeMetrics([{ id: "x" }], values).rows[0].rate, null);
});
test("Eigener Katalog: ähnliche Ideen werden erkannt", () => {
  assert.equal(similarity("Nächte voller Neon", "Nächte voller Neon"), 1);
  assert.equal(similarity("Wolken ziehen weiter", "Bahnsteig voller Neon"), 0);
});
test("Passwörter werden gesalzen und mit konstantzeitlichem Vergleich geprüft", () => {
  const p = randomBytes(20).toString("hex"),
    a = passwordHash(p),
    b = passwordHash(p);
  assert.notEqual(a, b);
  assert.equal(verifyPassword(p, a), true);
  assert.equal(verifyPassword("falsch", a), false);
});
test("Tokenverschlüsselung: Authentizität und Rundlauf", () => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const token = "test-token-kein-echtes-geheimnis";
  const encrypted = encrypt(token);
  assert.notEqual(encrypted, token);
  assert.equal(decrypt(encrypted), token);
  const parts = encrypted.split(".");
  parts[2] = Buffer.from("manipuliert").toString("base64");
  assert.throws(() => decrypt(parts.join(".")));
});
test("Dateinamen und falscher Dateiinhalt werden abgewiesen", async () => {
  for (const s of [
    "../test.wav",
    "a/b.png",
    "a\\b.png",
    "\x00file.mp4",
    ".env",
    "trick..png",
  ])
    assert.throws(() => validFilename(s));
  assert.equal(validFilename("Mein Song 01.wav"), "Mein Song 01.wav");
  await assert.rejects(
    saveUpload("musik.mp3", Buffer.from("<script>alert(1)</script>")),
  );
  await assert.rejects(saveUpload("leer.png", Buffer.alloc(0)));
});
test("SSRF: private, lokale und unsichere URL-Ziele gesperrt", async () => {
  for (const u of [
    "http://example.com",
    "https://127.0.0.1",
    "https://10.0.0.1",
    "https://192.168.1.1",
    "https://169.254.169.254",
    "https://localhost",
    "https://example.com:8000",
    "https://name:pass@example.com",
  ])
    await assert.rejects(safeRemoteUrl(u));
});
test("Webhooks: gültige, falsche und alte Signatur", () => {
  const body = '{"event":"test"}',
    time = Math.floor(Date.now() / 1000),
    secret = "test-secret";
  const sig = createHmac("sha256", secret)
    .update(time + "." + body)
    .digest("hex");
  assert.equal(verifyWebhook(body, `t=${time},s=${sig}`, secret), true);
  assert.equal(verifyWebhook(body + " ", `t=${time},s=${sig}`, secret), false);
  assert.equal(
    verifyWebhook(body, `t=${time},s=${sig}`, secret, Date.now() + 600000),
    false,
  );
  assert.equal(verifyWebhook(body, "s=broken", secret), false);
});
test("CLI-Ereignisformat und fachliches Ergebnis werden getrennt", () => {
  const r = parseProviderOutput(
    "codex",
    '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"ok\\":true}"}}\n{"type":"turn.completed","usage":{"input_tokens":5}}',
  );
  assert.deepEqual(JSON.parse(r.text), { ok: true });
  assert.deepEqual(r.usage, { input_tokens: 5 });
  const g = parseProviderOutput(
    "gemini",
    '{"response":"{\\"ok\\":true}","stats":{"tokens":10}}',
  );
  assert.deepEqual(JSON.parse(g.text), { ok: true });
  assert.throws(() => parseProviderOutput("gemini", "invalid JSON"));
  assert.throws(() =>
    parseProviderOutput(
      "codex",
      '{"type":"turn.failed","error":{"message":"quota"}}',
    ),
  );
  assert.match(classifyError("429 quota exhausted"), /Quota/);
  assert.match(classifyError("auth login expired"), /Anmeldung/);
});
test("Prozessrunner beendet Zeitüberschreitung und übergroße Ausgabe", async () => {
  await assert.rejects(
    runProcess(process.execPath, ["-e", "setTimeout(()=>{},10000)"], {
      timeout: 50,
    }),
    /Zeitlimit/,
  );
  await assert.rejects(
    runProcess(
      process.execPath,
      ["-e", 'process.stdout.write("x".repeat(5000))'],
      { maxBytes: 100 },
    ),
    /Größenlimit/,
  );
  const controller = new AbortController();
  const run = runProcess(process.execPath, ["-e", "setTimeout(()=>{},10000)"], {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(run, /abgebrochen/);
});
test("Untertitel sind Daten und können keine ASS-Befehle einschleusen", () => {
  assert.equal(assText("{\\pos(1,2)}Test\nZeile"), "pos(1,2)Test\\NZeile");
});
test("CLI-Schema ist kompatibel; fachliche URL-Prüfung bleibt separat", async () => {
  const { cliSchema } = await import("../src/runner/provider");
  const s = cliSchema({
    type: "object",
    properties: { url: { type: "string", format: "uri", default: "" } },
    required: [],
  });
  assert.equal(s.properties.url.format, undefined);
  assert.deepEqual(s.required, ["url"]);
  assert.equal(s.additionalProperties, false);
});
test("CLI erlaubt ChatGPT-Login und lehnt unbemerkte API-Abrechnung ab", async () => {
  const { requireChatgptLogin } = await import("../src/runner/provider");
  assert.doesNotThrow(() =>
    requireChatgptLogin({ auth_mode: "chatgpt", tokens: {} }),
  );
  assert.throws(
    () =>
      requireChatgptLogin({ auth_mode: "apikey", OPENAI_API_KEY: "test-only" }),
    /API-Key/,
  );
  assert.throws(
    () => requireChatgptLogin({ tokens: {}, OPENAI_API_KEY: "test-only" }),
    /API-Key/,
  );
  assert.throws(() => requireChatgptLogin({}), /Anmeldung/);
});
test("Landlock verweigert Zugriff auf Projektgeheimnisse und lokale Datenbankports", async () => {
  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  const node = await fs.realpath(process.execPath);
  const result = await runProcess(
    path.resolve(".local/studio-isolate"),
    [
      "--ro",
      "/usr",
      "--ro",
      "/etc/ssl",
      "--exec",
      "/usr/lib",
      "--exec",
      "/lib",
      "--exec",
      "/lib64",
      "--ro",
      path.dirname(path.dirname(node)),
      "--exec",
      node,
      "--",
      node,
      "-e",
      `const fs=require('fs'),net=require('net');let denied=false;try{fs.readFileSync(${JSON.stringify(path.resolve(".env"))})}catch(e){denied=e.code==='EACCES'}if(!denied)process.exit(2);const s=net.connect(56432,'127.0.0.1');s.on('connect',()=>process.exit(3));s.on('error',e=>{console.log('datei_gesperrt tcp_gesperrt');process.exit(0)});setTimeout(()=>process.exit(4),1000);`,
    ],
    { timeout: 5000 },
  );
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /datei_gesperrt tcp_gesperrt/);
});
