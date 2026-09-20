import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, readdir, mkdir, rm } from "node:fs/promises";
import sharp from "sharp";
import { VeoProvider, VeoError } from "../src/providers/veo";
import { runProcess } from "../src/lib/process";
import { videoCost } from "../src/lib/video-generation";
const schema = "veo_" + randomBytes(5).toString("hex");
const url = new URL(process.env.TEST_DATABASE_URL!);
if (url.pathname !== "/artist_studio_test")
  throw new Error("Isolierte Testdatenbank erforderlich.");
url.searchParams.set("options", "-csearch_path=" + schema + ",public");
process.env.DATABASE_URL = url.toString();
process.env.STORAGE_ROOT = ".local/" + schema;
const { pool, query, one } = await import("../src/server/db");
const { command } = await import("../src/server/commands");
const { runVideoJob, videoConnection, queueVideoPolls } =
  await import("../src/server/video-generation");
const { recoverJobs } = await import("../src/server/jobs");
const { storage, saveUpload } = await import("../src/server/storage");
const { renderVideo } = await import("../src/server/media");
const model = "veo-3.1-fast-generate-preview";
const op = () => "models/" + model + "/operations/" + randomUUID();
let user: string, artist: string, imageId: string;
const mockCheck: typeof fetch = async () =>
  Response.json({
    name: "models/" + model,
    supportedGenerationMethods: ["predictLongRunning"],
  });
before(async () => {
  assert.equal(
    (await one("SELECT current_database() name"))!.name,
    "artist_studio_test",
    "Testpool darf niemals Produktionsdaten verwenden.",
  );
  await pool.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pool.query(await readFile("migrations/" + f, "utf8"));
  user = randomUUID();
  await query(
    "INSERT INTO users(id,email,password_hash) VALUES($1,'veo@example.invalid','no-login')",
    [user],
  );
  await query("INSERT INTO settings(user_id) VALUES($1)", [user]);
  artist = (
    await command(user, {
      action: "create_artist",
      data: { name: "Veo-Testkünstler", genre: "Test" },
    })
  ).id;
  const saved = await saveUpload(
    "SYNTHETISCHES-TESTBILD.png",
    await sharp({
      create: { width: 180, height: 320, channels: 3, background: "#284379" },
    })
      .png()
      .toBuffer(),
  );
  imageId = randomUUID();
  await query(
    "INSERT INTO assets(id,artist_id,kind,name,storage_key,mime,bytes,sha256,metadata) VALUES($1,$2,'image','SYNTHETISCHE TESTDATEI',$3,$4,$5,$6,$7)",
    [
      imageId,
      artist,
      saved.storage_key,
      saved.mime,
      saved.bytes,
      saved.sha256,
      JSON.stringify(saved.metadata),
    ],
  );
  const native = globalThis.fetch;
  globalThis.fetch = mockCheck;
  try {
    await command(user, {
      action: "veo_connect",
      data: {
        api_key: "private-test-key",
        model,
        rate_usd_second: 0.12,
        daily_limit_usd: 100,
        monthly_limit_usd: 1000,
      },
    });
  } finally {
    globalThis.fetch = native;
  }
});
after(async () => {
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
  await rm(storage.root, { recursive: true, force: true });
});
function data(extra: any = {}) {
  return {
    artist_id: artist,
    name: "Synthetische KI-Szene",
    prompt: "A slow camera motion",
    reference_asset_id: imageId,
    duration: 4,
    approved: true,
    rights_confirmed: true,
    connection_version: 1,
    approved_cost_usd: 0.48,
    ...extra,
  };
}
async function create(extra: any = {}, key = randomUUID()) {
  return command(user, { action: "veo_generate", data: data(extra), key });
}
async function job(id: string) {
  return (await one(
    "SELECT j.* FROM jobs j JOIN video_generations v ON v.job_id=j.id WHERE v.id=$1",
    [id],
  ))!;
}
async function release(id: string) {
  await query("UPDATE video_generations SET state='failed' WHERE id=$1", [id]);
  await query(
    "UPDATE video_cost_reservations SET state='released' WHERE generation_id=$1",
    [id],
  );
}
const signal = () => new AbortController().signal;
test("Veo-Verbindung: verschlüsselter Key, kein Secret in Dashboardprojektion, GET statt Generierung", async () => {
  assert.notEqual(
    (await one("SELECT encrypted_key FROM video_connections"))!.encrypted_key,
    "private-test-key",
  );
  assert.ok(
    !JSON.stringify(await videoConnection(user)).includes("private-test-key"),
  );
  assert.equal((await videoConnection(user))!.live_tested_at, null);
  const client = new VeoProvider("test-key", async (uri, init) => {
    assert.equal(init?.method, "GET");
    assert.equal(
      String(uri),
      "https://generativelanguage.googleapis.com/v1beta/models/" + model,
    );
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "test-key");
    return mockCheck(uri, init);
  });
  assert.equal((await client.healthCheck(model)).ok, true);
  await assert.rejects(
    new VeoProvider("x", async () =>
      Response.json({ name: "models/" + model }),
    ).healthCheck(model),
    /Videofunktion/,
  );
});
test("Veo-Antrag enthält dokumentierte Bildparameter; Fehler und Downloads geben keinen Key preis", async () => {
  const name = op();
  const client = new VeoProvider("secret-value", async (uri, init) => {
    assert.equal(
      String(uri),
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        model +
        ":predictLongRunning",
    );
    const body = JSON.parse(init!.body as string);
    assert.equal(
      body.instances[0].image.bytesBase64Encoded,
      Buffer.from("image").toString("base64"),
    );
    assert.equal(body.parameters.aspectRatio, "9:16");
    assert.equal(body.parameters.sampleCount, 1);
    assert.equal(body.parameters.personGeneration, "allow_adult");
    assert.equal(body.parameters.generateAudio, undefined);
    return Response.json({ name });
  });
  assert.equal(
    await client.start(
      { model, prompt: "test", negative_prompt: "", duration: 4 },
      Buffer.from("image"),
    ),
    name,
  );
  for (const uri of [
    "http://127.0.0.1/private",
    "https://evil.invalid/v1beta/files/a:download",
    "https://generativelanguage.googleapis.com@evil.invalid/v1beta/files/a:download",
    "https://generativelanguage.googleapis.com/v1beta/models/a",
  ])
    await assert.rejects(client.download(uri), /Unzulässige/);
  for (const status of [403, 429, 500])
    await assert.rejects(
      new VeoProvider(
        "secret-value",
        async () => new Response("secret-value", { status }),
      ).healthCheck(model),
      (e: any) =>
        e instanceof VeoError &&
        !e.message.includes("secret-value") &&
        e.definitive === (status !== 500),
    );
  assert.equal(videoCost(4, 0.12), 0.48);
});
test("Kosten, Bildrechte, Objektbesitz und Not-Aus können nicht durch queue_ai umgangen werden", async () => {
  for (const extra of [
    { approved: false },
    { rights_confirmed: false },
    { approved_cost_usd: 0 },
    { connection_version: 99 },
    { reference_asset_id: randomUUID() },
  ])
    await assert.rejects(create(extra));
  await assert.rejects(
    command(user, {
      action: "queue_ai",
      data: { artist_id: artist, kind: "veo_generate", input: {} },
    }),
    /Freigabeweg/,
  );
  await query("UPDATE assets SET rights_status='disputed' WHERE id=$1", [
    imageId,
  ]);
  await assert.rejects(create(), /verwendbares Bild/);
  await query("UPDATE assets SET rights_status='unclear' WHERE id=$1", [
    imageId,
  ]);
  await query("UPDATE settings SET emergency_stop=true WHERE user_id=$1", [
    user,
  ]);
  await assert.rejects(create(), /Not-Aus/);
  await query("UPDATE settings SET emergency_stop=false WHERE user_id=$1", [
    user,
  ]);
});
test("Gleichzeitige Kostenreservierungen und doppelte Klicks", async () => {
  await query(
    "UPDATE video_connections SET daily_limit_usd=0.48 WHERE user_id=$1",
    [user],
  );
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () => create()),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const first = (
    results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>
  ).value;
  await release(first.id);
  const key = randomUUID();
  const [a, b] = await Promise.all([create({}, key), create({}, key)]);
  assert.equal(a.id, b.id);
  assert.equal(
    Number(
      (await one(
        "SELECT count(*) n FROM video_cost_reservations WHERE generation_id=$1",
        [a.id],
      ))!.n,
    ),
    1,
  );
  await release(a.id);
  await query(
    "UPDATE video_connections SET daily_limit_usd=100 WHERE user_id=$1",
    [user],
  );
});
test("Unklare POST-Antwort und Neustart erzeugen keinen zweiten externen Auftrag", async () => {
  const { id } = await create(),
    j = await job(id);
  let posts = 0;
  const ambiguous: typeof fetch = async () => {
    posts++;
    return new Response("invalid JSON");
  };
  await assert.rejects(runVideoJob(j, signal(), ambiguous), /unklar/);
  assert.equal(
    (await one("SELECT state FROM video_generations WHERE id=$1", [id]))!.state,
    "unknown_external_state",
  );
  await assert.rejects(runVideoJob(j, signal(), ambiguous), /bereits begonnen/);
  assert.equal(posts, 1);
  assert.equal(
    (await one(
      "SELECT state FROM video_cost_reservations WHERE generation_id=$1",
      [id],
    ))!.state,
    "reserved",
  );
  const next = await create(),
    nextJob = await job(next.id);
  await query(
    "UPDATE video_generations SET submitted_at=now(),state='submitting' WHERE id=$1",
    [next.id],
  );
  await query(
    "UPDATE jobs SET state='running',lease_until=now()-interval '1 minute',attempt_count=1 WHERE id=$1",
    [nextJob.id],
  );
  await recoverJobs();
  await queueVideoPolls();
  assert.equal(
    (await one("SELECT state FROM video_generations WHERE id=$1", [next.id]))!
      .state,
    "unknown_external_state",
  );
  await assert.rejects(
    command(user, { action: "veo_disconnect", data: {} }),
    /Offene/,
  );
});
test("Bekannte Operation abfragen und manuelle Zuordnung prüfen; kein Neuauftrag", async () => {
  const { id } = await create();
  const name = op();
  await runVideoJob(await job(id), signal(), async () =>
    Response.json({ name }),
  );
  await runVideoJob(await job(id), signal(), async () => {
    throw new Error("Second POST forbidden");
  });
  const sync = await command(user, { action: "veo_sync", data: { id } });
  await runVideoJob(sync, signal(), async (uri, init) => {
    assert.equal(init?.method, "GET");
    assert.ok(String(uri).endsWith(name));
    return Response.json({ name, done: false });
  });
  assert.equal(
    (await one("SELECT state FROM video_generations WHERE id=$1", [id]))!.state,
    "waiting_for_provider",
  );
  await assert.rejects(
    command(randomUUID(), { action: "veo_sync", data: { id } }),
  );
  const unknown = (await one(
    "SELECT id FROM video_generations WHERE state='unknown_external_state' LIMIT 1",
  ))!;
  await assert.rejects(
    command(user, {
      action: "veo_reconcile",
      data: { id: unknown.id, operation_name: "https://evil.invalid" },
    }),
  );
  const attached = op();
  await command(user, {
    action: "veo_reconcile",
    data: { id: unknown.id, operation_name: attached },
  });
  assert.equal(
    (await one("SELECT operation_name FROM video_generations WHERE id=$1", [
      unknown.id,
    ]))!.operation_name,
    attached,
  );
});
test("Import ist dedupliziert; reales MP4 nutzt Suno-MP3 statt Szenenton", async () => {
  const { id } = await create(),
    name = op();
  await runVideoJob(await job(id), signal(), async () =>
    Response.json({ name }),
  );
  const sync = await command(user, { action: "veo_sync", data: { id } });
  const scenePath = storage.root + "/scene-test.mp4",
    audioPath = storage.root + "/suno-test.mp3";
  await mkdir(storage.root, { recursive: true });
  const scene = await runProcess("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=180x320:d=1",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=999:duration=1",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-y",
    scenePath,
  ]);
  assert.equal(scene.code, 0, scene.stderr);
  assert.equal(
    (
      await runProcess("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=2",
        "-c:a",
        "libmp3lame",
        "-y",
        audioPath,
      ])
    ).code,
    0,
  );
  const resultFetch: typeof fetch = async () =>
    Response.json({
      name,
      done: true,
      response: {
        generateVideoResponse: {
          generatedSamples: [
            {
              video: {
                uri: "https://generativelanguage.googleapis.com/v1beta/files/test:download?alt=media",
              },
            },
          ],
        },
      },
    });
  const result = await runVideoJob(sync, signal(), resultFetch, async () =>
    readFile(scenePath),
  );
  await runVideoJob(sync, signal(), async () => {
    throw new Error("Must not repoll completed import");
  });
  assert.equal(
    Number(
      (await one("SELECT count(*) n FROM assets WHERE origin='google_veo'"))!.n,
    ),
    1,
  );
  const asset = (await one("SELECT * FROM assets WHERE id=$1", [
    (result.result as any).asset_id,
  ]))!;
  assert.equal(
    (await one(
      "SELECT w.state FROM workflows w JOIN jobs j ON j.workflow_id=w.id WHERE j.id=$1",
      [(await job(id)).id],
    ))!.state,
    "succeeded",
  );
  assert.equal(asset.rights_status, "unclear");
  assert.equal(asset.parent_id, imageId);
  const audio = await saveUpload(
    "SYNTHETISCHER-SUNO-IMPORT.mp3",
    await readFile(audioPath),
  );
  const output = await renderVideo(
    {
      template: "scenes",
      timeline: {
        start: 0,
        end: 1,
        scenes: [
          {
            asset_id: asset.id,
            duration: 1,
            crop_x: 0.5,
            crop_y: 0.5,
            motion: false,
          },
        ],
        title: "SYNTHETISCHER TEST",
        subtitles: [],
        font_size: 40,
        text_y: 0.65,
        color: "#ffffff",
        fps: "24",
        quality: "preview",
        transition: "cut",
      },
    },
    [asset],
    audio,
    async () => {},
  );
  const videoStream = output.metadata.streams.find(
    (s: any) => s.type === "video",
  );
  assert.equal(videoStream.width, 1080);
  assert.equal(videoStream.height, 1920);
  assert.equal(videoStream.codec, "h264");
  assert.ok(
    output.metadata.streams.some(
      (s: any) => s.type === "audio" && s.codec === "aac",
    ),
  );
  assert.ok(Math.abs(output.metadata.duration - 1) < 0.1);
  const pcmPath = storage.root + "/test.pcm";
  assert.equal(
    (
      await runProcess("ffmpeg", [
        "-v",
        "error",
        "-i",
        storage.path(output.storage_key),
        "-vn",
        "-ar",
        "8000",
        "-ac",
        "1",
        "-f",
        "s16le",
        "-y",
        pcmPath,
      ])
    ).code,
    0,
  );
  const pcm = await readFile(pcmPath);
  const power = (frequency: number) => {
    let re = 0,
      im = 0;
    const n = Math.min(6000, pcm.length / 2);
    for (let i = 800; i < n; i++) {
      const sample = pcm.readInt16LE(i * 2);
      re += sample * Math.cos((2 * Math.PI * frequency * i) / 8000);
      im += sample * Math.sin((2 * Math.PI * frequency * i) / 8000);
    }
    return re * re + im * im;
  };
  assert.ok(
    power(440) > power(999) * 100,
    "Suno-Ton muss dominieren; Szenenton darf nicht beigemischt sein.",
  );
});
test("Vor dem Senden abgebrochen gibt Budget frei; Anbieterfehler und ungültige Dateien bleiben sichtbar", async () => {
  const { id } = await create();
  const j = await job(id);
  await command(user, { action: "cancel_job", data: { id: j.id } });
  await queueVideoPolls();
  assert.equal(
    (await one("SELECT state FROM video_generations WHERE id=$1", [id]))!.state,
    "cancelled",
  );
  assert.equal(
    (await one(
      "SELECT state FROM video_cost_reservations WHERE generation_id=$1",
      [id],
    ))!.state,
    "released",
  );
  const name = op();
  const { id: failure } = await create();
  await runVideoJob(await job(failure), signal(), async () =>
    Response.json({ name }),
  );
  const sync = await command(user, {
    action: "veo_sync",
    data: { id: failure },
  });
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      runVideoJob(
        sync,
        signal(),
        async () =>
          Response.json({
            name,
            done: true,
            response: {
              generateVideoResponse: {
                generatedSamples: [
                  {
                    video: {
                      uri: "https://generativelanguage.googleapis.com/v1beta/files/test:download",
                    },
                  },
                ],
              },
            },
          }),
        async () => Buffer.from("not a video"),
      ),
    );
  assert.equal(
    (await one("SELECT state FROM video_generations WHERE id=$1", [failure]))!
      .state,
    "waiting_for_input",
  );
  await runVideoJob(sync, signal(), async () =>
    Response.json({
      name,
      done: true,
      error: { code: 3, message: "sensitive provider body" },
    }),
  );
  const row = (await one("SELECT * FROM video_generations WHERE id=$1", [
    failure,
  ]))!;
  assert.equal(row.state, "failed");
  assert.ok(!row.error.includes("sensitive provider body"));
});

test("Medien-Redirect entfernt Google-Key vor fremdem Host und pinnt DNS", async () => {
  const { syncBuiltinESMExports } = await import("node:module");
  const { default: https } = await import("node:https");
  const dns = await import("node:dns/promises");
  const { PassThrough } = await import("node:stream");
  const { EventEmitter } = await import("node:events");
  const { mock } = await import("node:test");
  const { downloadMedia } = await import("../src/server/remote-media");
  const seen: any[] = [];
  const lookupMock = mock.method(dns.default, "lookup", async () => [
    { address: "8.8.8.8", family: 4 },
  ]);
  const getMock = mock.method(
    https,
    "get",
    (url: URL, options: any, callback: any) => {
      seen.push({ url: url.toString(), headers: options.headers });
      options.lookup(url.hostname, {}, (_err: any, address: string) =>
        assert.equal(address, "8.8.8.8"),
      );
      const req: any = new EventEmitter();
      req.setTimeout = () => req;
      req.destroy = () => req;
      queueMicrotask(() => {
        const res: any = new PassThrough();
        res.statusCode = seen.length === 1 ? 302 : 200;
        res.headers =
          seen.length === 1
            ? { location: "https://cdn.example.invalid/file.mp4" }
            : {};
        callback(res);
        res.end(seen.length === 1 ? "" : "synthetic media bytes");
      });
      return req;
    },
  );
  syncBuiltinESMExports();
  try {
    const bytes = await downloadMedia(
      "https://generativelanguage.googleapis.com/v1beta/files/test:download",
      undefined,
      0,
      { accept: "video/*", headers: { "x-goog-api-key": "never-forward" } },
    );
    assert.equal(bytes.toString(), "synthetic media bytes");
    assert.equal(seen.length, 2);
    assert.equal(seen[0].headers["x-goog-api-key"], "never-forward");
    assert.equal(seen[1].headers["x-goog-api-key"], undefined);
  } finally {
    lookupMock.mock.restore();
    getMock.mock.restore();
    syncBuiltinESMExports();
  }
});
