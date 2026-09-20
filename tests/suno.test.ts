import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir, mkdir, rm } from "node:fs/promises";
import {
  SunoApiClient,
  SunoApiError,
  generationRequest,
} from "../src/providers/suno-api";
const schema = "suno_" + randomBytes(5).toString("hex");
const url = new URL(process.env.TEST_DATABASE_URL!);
if (url.pathname !== "/artist_studio_test")
  throw new Error("Nur Testdatenbank.");
url.searchParams.set("options", "-csearch_path=" + schema + ",public");
process.env.DATABASE_URL = url.toString();
process.env.STORAGE_ROOT = ".local/" + schema;
const { pool, query, one } = await import("../src/server/db");
const { command } = await import("../src/server/commands");
const { runSunoJob, musicConnection } = await import("../src/server/suno");
const { publicAddress } = await import("../src/server/remote-media");
let user: string, artist: string, song: string, lyrics: string;
const mockFetch: typeof fetch = async (_url, init) =>
  Response.json(
    init?.method === "POST"
      ? { code: 200, data: { taskId: randomUUID() } }
      : { code: 200, data: 1000 },
  );
before(async () => {
  await pool.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pool.query(await readFile("migrations/" + f, "utf8"));
  user = randomUUID();
  await query(
    "INSERT INTO users(id,email,password_hash) VALUES($1,'suno-test@example.invalid','not-a-login')",
    [user],
  );
  await query("INSERT INTO settings(user_id) VALUES($1)", [user]);
  artist = (
    await command(user, {
      action: "create_artist",
      data: { name: "Suno API Test", genre: "Synthpop" },
    })
  ).id;
  song = (
    await command(user, {
      action: "create_song",
      data: { artist_id: artist, title: "Synthetischer Test" },
    })
  ).id;
  lyrics = (
    await command(user, {
      action: "save_lyrics",
      data: {
        song_id: song,
        base_version: 0,
        title: "Synthetischer Test",
        lyrics: "[Verse]\nNur Testdaten.",
        style_prompt: "Synthpop",
        negative_prompt: "",
        pronunciation: "",
        notes: "",
        hooks: [],
        protected_lines: [],
      },
    })
  ).id;
  const native = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    await command(user, {
      action: "suno_connect",
      data: {
        api_key: "test-key-only",
        callback_url: "https://example.com/api/suno/callback",
        credits_per_generation: 5,
        daily_credit_limit: 500,
        monthly_credit_limit: 1000,
      },
    });
  } finally {
    globalThis.fetch = native;
  }
});
after(async () => {
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
  await rm(process.env.STORAGE_ROOT!, { recursive: true, force: true });
});
async function order() {
  return (
    await command(user, {
      action: "prepare_music_generation",
      data: { song_id: song, lyrics_version_id: lyrics },
    })
  ).id;
}
async function generate(oid: string) {
  return command(user, {
    action: "suno_generate",
    data: {
      order_id: oid,
      approved: true,
      approved_credits: 5,
      options: { model: "V6" },
    },
  });
}
test("Suno-Verbindung speichert Schlüssel verschlüsselt; Browserprojektion enthält kein Secret", async () => {
  assert.notEqual(
    (await one("SELECT encrypted_key FROM music_connections WHERE user_id=$1", [
      user,
    ]))!.encrypted_key,
    "test-key-only",
  );
  assert.ok(
    !JSON.stringify(await musicConnection(user)).includes("test-key-only"),
  );
  assert.equal((await musicConnection(user))!.remaining_credits, "1000");
});
test("Dokumentierte Requests, Limits und sichere Fehlerklassifizierung", async () => {
  const packet = { title: "Titel", lyrics: "Text", style_prompt: "Pop" };
  assert.equal(
    generationRequest(packet, { model: "V6" }, "https://example.com/hook")
      .prompt,
    "Text",
  );
  assert.throws(() =>
    generationRequest(
      { ...packet, lyrics: "x".repeat(5001) },
      { model: "V6" },
      "https://example.com",
    ),
  );
  const seen: string[] = [];
  const client = new SunoApiClient("secret-test", async (url, init) => {
    seen.push(String(url));
    assert.equal((init?.headers as any).Authorization, "Bearer secret-test");
    return Response.json({ code: 200, data: 23 });
  });
  assert.equal(await client.credits(), 23);
  assert.equal(seen[0], "https://api.sunoapi.org/api/v1/generate/credit");
  await assert.rejects(
    new SunoApiClient("secret-test", async () =>
      Response.json({ code: 429, msg: "private secret-test" }),
    ).generate({}),
    (e) =>
      e instanceof SunoApiError &&
      e.definitive &&
      !e.message.includes("secret-test"),
  );
  await assert.rejects(
    new SunoApiClient("test", async () => new Response("broken")).generate({}),
    (e) => e instanceof SunoApiError && !e.definitive,
  );
});
test("Musikfreigabe, Ownership, geschützter Startweg und Tagesbudget", async () => {
  const oid = await order();
  await assert.rejects(
    command(user, { action: "suno_generate", data: { order_id: oid } }),
    /Freigegeben|freigegeben/,
  );
  await assert.rejects(
    command(randomUUID(), {
      action: "suno_generate",
      data: { order_id: oid, approved: true },
    }),
    /fehlt/,
  );
  await assert.rejects(
    command(user, {
      action: "queue_ai",
      data: {
        kind: "suno_generate",
        artist_id: artist,
        input: { order_id: oid },
      },
    }),
    /Freigabeweg/,
  );
  await query(
    "UPDATE music_connections SET daily_credit_limit=5 WHERE user_id=$1",
    [user],
  );
  const others = await Promise.all([order(), order()]);
  const results = await Promise.allSettled(others.map(generate));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  for (const r of results)
    if (r.status === "fulfilled")
      await command(user, { action: "cancel_job", data: { id: r.value.id } });
  assert.equal(
    Number(
      (await one(
        "SELECT count(*) n FROM music_credit_reservations WHERE state='reserved'",
      ))!.n,
    ),
    0,
  );
  await query(
    "UPDATE music_connections SET daily_credit_limit=500 WHERE user_id=$1",
    [user],
  );
});
test("Doppelklick erzeugt nur einen Auftrag und eine Creditreservierung", async () => {
  const oid = await order();
  const a = await Promise.all([generate(oid), generate(oid)]);
  assert.equal(a[0].id, a[1].id);
  assert.equal(
    Number(
      (await one(
        "SELECT count(*) n FROM music_credit_reservations WHERE order_id=$1",
        [oid],
      ))!.n,
    ),
    1,
  );
});
test("Unbekannter externer Zustand nach POST wird niemals blind erneut gesendet", async () => {
  const oid = await order(),
    start = await generate(oid),
    job = await one("SELECT * FROM jobs WHERE id=$1", [start.id]);
  let posts = 0;
  const transport: typeof fetch = async (_u, init) => {
    if (init?.method === "POST") {
      posts++;
      throw new Error("Timeout");
    }
    return Response.json({ code: 200, data: 1000 });
  };
  await assert.rejects(
    runSunoJob(job, new AbortController().signal, transport),
    /unklar/,
  );
  assert.equal(
    (await one("SELECT state FROM music_orders WHERE id=$1", [oid]))!.state,
    "unknown_external_state",
  );
  await assert.rejects(
    runSunoJob(job, new AbortController().signal, transport),
    /kein zweiter/,
  );
  assert.equal(posts, 1);
  assert.equal(
    (await one(
      "SELECT state FROM music_credit_reservations WHERE order_id=$1",
      [oid],
    ))!.state,
    "reserved",
  );
  await command(user, {
    action: "suno_resume",
    data: { order_id: oid, task_id: "existing-task" },
  });
  assert.equal(
    (await one("SELECT external_id FROM music_orders WHERE id=$1", [oid]))!
      .external_id,
    "existing-task",
  );
});
test("Definitive Ablehnung gibt Reservierung frei und bleibt ohne automatischen Neuauftrag", async () => {
  const oid = await order(),
    start = await generate(oid),
    job = await one("SELECT * FROM jobs WHERE id=$1", [start.id]);
  await assert.rejects(
    runSunoJob(job, new AbortController().signal, async (_u, init) =>
      Response.json(
        init?.method === "POST" ? { code: 401 } : { code: 200, data: 1000 },
      ),
    ),
    /Schlüssel/,
  );
  assert.equal(
    (await one("SELECT state FROM music_orders WHERE id=$1", [oid]))!.state,
    "failed",
  );
  assert.equal(
    (await one(
      "SELECT state FROM music_credit_reservations WHERE order_id=$1",
      [oid],
    ))!.state,
    "released",
  );
});
test("Generierung, Polling und tatsächlicher Audioimport sind wiederaufnehmbar und dedupliziert", async () => {
  const oid = await order(),
    start = await generate(oid),
    job = await one("SELECT * FROM jobs WHERE id=$1", [start.id]);
  await runSunoJob(job, new AbortController().signal, mockFetch);
  const saved = await one("SELECT * FROM music_orders WHERE id=$1", [oid]);
  assert.equal(saved!.state, "waiting_for_provider");
  const transport: typeof fetch = async () =>
    Response.json({
      code: 200,
      data: {
        taskId: saved!.external_id,
        status: "SUCCESS",
        response: {
          sunoData: [
            {
              id: "audio-one",
              audio_url: "https://example.com/test.wav",
              title: "SYNTHETISCHER TEST",
              duration: 1,
            },
            {
              id: "audio-two",
              audio_url: "https://example.com/test2.wav",
              title: "SYNTHETISCHER TEST 2",
              duration: 1,
            },
          ],
        },
      },
    });
  const { runProcess } = await import("../src/lib/process");
  await mkdir(process.env.STORAGE_ROOT!, { recursive: true });
  const fixture = process.env.STORAGE_ROOT! + "/fixture.wav";
  assert.equal(
    (
      await runProcess("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1",
        "-y",
        fixture,
      ])
    ).code,
    0,
  );
  const download = async () => readFile(fixture);
  await runSunoJob(
    { ...job, kind: "suno_sync" },
    new AbortController().signal,
    transport,
    download,
  );
  await runSunoJob(
    { ...job, kind: "suno_sync" },
    new AbortController().signal,
    transport,
    download,
  );
  assert.equal(
    (await one("SELECT state FROM music_orders WHERE id=$1", [oid]))!.state,
    "succeeded",
  );
  assert.equal(
    Number(
      (await one("SELECT count(*) n FROM audio_variants WHERE order_id=$1", [
        oid,
      ]))!.n,
    ),
    2,
  );
  assert.equal(
    Number(
      (await one(
        "SELECT count(*) n FROM rights_records WHERE provider='SunoAPI.org' AND status='unclear'",
      ))!.n,
    ),
    2,
  );
});
test("Audio-Downloads blockieren interne, reservierte und gemappte IP-Adressen", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "192.168.1.1",
    "100.64.1.2",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "2001:db8::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("1.1.1.1"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
});
