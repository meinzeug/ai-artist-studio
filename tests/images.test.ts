import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, readdir, rm } from "node:fs/promises";
import sharp from "sharp";
import {
  GeminiImageProvider,
  ImageProviderError,
  boundedJson,
} from "../src/providers/images";
const schema = "images_" + randomBytes(5).toString("hex");
const url = new URL(process.env.TEST_DATABASE_URL!);
if (url.pathname !== "/artist_studio_test")
  throw new Error("Isolierte Testdatenbank erforderlich.");
url.searchParams.set("options", "-csearch_path=" + schema + ",public");
process.env.DATABASE_URL = url.toString();
process.env.STORAGE_ROOT = ".local/" + schema;
const { pool, query, one } = await import("../src/server/db");
const { command } = await import("../src/server/commands");
const { imageCommand, imageConnection, runImageJob, recoverImageJobs } =
  await import("../src/server/image-generation");
const { recoverJobs } = await import("../src/server/jobs");
const { saveUpload, storage } = await import("../src/server/storage");
const model = "gemini-3.1-flash-image";
let user: string, artist: string, imageId: string, image: Buffer;
const check: typeof fetch = async (uri) =>
  String(uri).endsWith("/health")
    ? Response.json({
        providers: [
          {
            provider: "codex",
            installed: true,
            authenticated: true,
            capabilities: { imageGeneration: true },
          },
        ],
      })
    : Response.json({
        name: "models/" + model,
        supportedGenerationMethods: ["generateContent"],
      });
before(async () => {
  assert.equal(
    (await one("SELECT current_database() name"))!.name,
    "artist_studio_test",
  );
  await pool.query(`CREATE SCHEMA ${schema}`);
  for (const file of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pool.query(await readFile("migrations/" + file, "utf8"));
  user = randomUUID();
  await query(
    "INSERT INTO users(id,email,password_hash) VALUES($1,'image@example.invalid','test-no-login')",
    [user],
  );
  await query("INSERT INTO settings(user_id) VALUES($1)", [user]);
  artist = (
    await command(user, {
      action: "create_artist",
      data: {
        name: "Bild-Testkünstler",
        genre: "Test",
        identity: { visual: "Kupferfarben", negativeVisual: "Keine Logos" },
      },
    })
  ).id;
  image = await sharp({
    create: { width: 180, height: 320, channels: 3, background: "#198d85" },
  })
    .png()
    .toBuffer();
  const saved = await saveUpload("SYNTHETIC.png", image);
  imageId = randomUUID();
  await query(
    "INSERT INTO assets(id,artist_id,kind,name,storage_key,mime,bytes,sha256,metadata) VALUES($1,$2,'image','SYNTHETISCHES TESTBILD',$3,$4,$5,$6,$7)",
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
  await configure();
});
after(async () => {
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
  await rm(storage.root, { recursive: true, force: true });
});
async function configure(extra: any = {}) {
  return imageCommand(
    user,
    "image_configure",
    {
      provider: "gemini_api",
      api_key: "private-image-test-key",
      version: 0,
      model,
      estimated_cost_usd: 0.1,
      daily_limit: 100,
      monthly_limit: 1000,
      daily_limit_usd: 100,
      monthly_limit_usd: 1000,
      ...extra,
    },
    randomUUID(),
    check,
  );
}
function input(extra: any = {}) {
  return {
    artist_id: artist,
    name: "SYNTHETISCHES TESTBILD",
    prompt: "Ein eigenständiges geometrisches Testmotiv.",
    aspect_ratio: "9:16",
    reference_asset_id: imageId,
    connection_version: 1,
    approved: true,
    rights_confirmed: true,
    approved_cost_usd: 0.1,
    ...extra,
  };
}
async function create(extra: any = {}, key = randomUUID()) {
  return command(user, { action: "image_generate", data: input(extra), key });
}
async function job(id: string) {
  return (await one(
    "SELECT j.* FROM jobs j JOIN image_generations g ON g.job_id=j.id WHERE g.id=$1",
    [id],
  ))!;
}
async function close(id: string) {
  await query("UPDATE image_generations SET state='failed' WHERE id=$1", [id]);
  await query(
    "UPDATE image_reservations SET state='released' WHERE generation_id=$1",
    [id],
  );
}
const signal = () => new AbortController().signal;
const generated: typeof fetch = async () =>
  Response.json({
    candidates: [
      {
        content: {
          parts: [
            {
              inlineData: {
                mimeType: "image/png",
                data: image.toString("base64"),
              },
            },
          ],
        },
      },
    ],
    usageMetadata: { candidatesTokenCount: 1120 },
  });
test("Bildprovider: sicherer Modelltest, Schlüsselverschlüsselung, keine behauptete Livegeneration", async () => {
  assert.notEqual(
    (await one("SELECT encrypted_key FROM image_connections"))!.encrypted_key,
    "private-image-test-key",
  );
  assert.ok(
    !JSON.stringify(await imageConnection(user)).includes(
      "private-image-test-key",
    ),
  );
  assert.equal((await imageConnection(user))!.live_tested_at, null);
  await new GeminiImageProvider("test-key", async (uri, init) => {
    assert.equal(
      String(uri),
      "https://generativelanguage.googleapis.com/v1/models/" + model,
    );
    assert.equal(init!.method, "GET");
    assert.equal(new Headers(init!.headers).get("x-goog-api-key"), "test-key");
    return check(uri, init);
  }).healthCheck(model);
  await assert.rejects(configure({ version: 0 }), /inzwischen geändert/);
  await assert.rejects(
    imageCommand(
      user,
      "image_configure",
      { provider: "codex", version: 1, daily_limit: 10, monthly_limit: 100 },
      randomUUID(),
      async () =>
        Response.json({
          providers: [
            {
              provider: "codex",
              installed: true,
              authenticated: false,
              capabilities: { imageGeneration: true },
            },
          ],
        }),
    ),
    /ChatGPT-Anmeldung fehlt/,
  );
});
test("Gemini-Bildadapter sendet dokumentierte Parameter und Referenz; blockiert fremde Modellpfade und maskiert Fehler", async () => {
  const output = await new GeminiImageProvider("secret", async (uri, init) => {
    assert.equal(
      String(uri),
      "https://generativelanguage.googleapis.com/v1/models/" +
        model +
        ":generateContent",
    );
    assert.equal(init!.redirect, "error");
    const body = JSON.parse(String(init!.body));
    assert.equal(
      body.generationConfig.responseFormat.image.aspectRatio,
      "9:16",
    );
    assert.equal(body.generationConfig.responseFormat.image.imageSize, "1K");
    assert.equal(body.generationConfig.candidateCount, 1);
    assert.equal(
      body.contents[0].parts[1].inlineData.data,
      image.toString("base64"),
    );
    return generated(uri, init);
  }).generate({ model, prompt: "test", aspect_ratio: "9:16" }, image);
  assert.equal(output.result.images.length, 1);
  await assert.rejects(
    new GeminiImageProvider("secret").healthCheck("../../private"),
  );
  for (const status of [403, 429, 500])
    await assert.rejects(
      new GeminiImageProvider(
        "secret",
        async () => new Response("secret", { status }),
      ).healthCheck(model),
      (e: any) =>
        e instanceof ImageProviderError &&
        !e.message.includes("secret") &&
        e.definitive === (status !== 500),
    );
  await assert.rejects(
    new GeminiImageProvider("secret", async () =>
      Response.json({ candidates: [] }),
    ).generate({ model, prompt: "test", aspect_ratio: "9:16" }),
    /kein Bild/,
  );
  await assert.rejects(
    boundedJson(new Response("x".repeat(40)), 30),
    /zu groß/,
  );
});
test("Freigabe, Verbindungsversion, Besitz, Referenzrechte und Not-Aus erzwingen", async () => {
  for (const extra of [
    { approved: false },
    { rights_confirmed: false },
    { connection_version: 2 },
    { approved_cost_usd: 0 },
    { artist_id: randomUUID() },
  ])
    await assert.rejects(create(extra));
  await assert.rejects(
    command(user, {
      action: "queue_ai",
      data: { kind: "image_generate", artist_id: artist },
    }),
    /Freigabeweg/,
  );
  await query("UPDATE assets SET rights_status='disputed' WHERE id=$1", [
    imageId,
  ]);
  await assert.rejects(create(), /verwendbare Bildreferenz/);
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
test("Parallele Bildaufträge reservieren Kosten atomar; Doppelklick erstellt nur einen Auftrag", async () => {
  await query(
    "UPDATE image_connections SET daily_limit_usd=0.1 WHERE user_id=$1",
    [user],
  );
  const results = await Promise.allSettled([create(), create()]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  for (const r of results)
    if (r.status === "fulfilled") await close(r.value.id);
  await query(
    "UPDATE image_connections SET daily_limit_usd=100 WHERE user_id=$1",
    [user],
  );
  const key = randomUUID();
  const [a, b] = await Promise.all([create({}, key), create({}, key)]);
  assert.equal(a.id, b.id);
  await assert.rejects(configure({ version: 1 }), /Offene Bildaufträge/);
  await close(a.id);
});
test("Bildimport ist echt dekodierbar, versioniert, privat zugeordnet und dedupliziert", async () => {
  const { id } = await create();
  const j = await job(id);
  let posts = 0;
  const output = await runImageJob(j, signal(), async (uri, init) => {
    posts++;
    const body = JSON.parse(String(init!.body));
    assert.ok(body.contents[0].parts[0].text.includes("Keine Logos"));
    return generated(uri, init);
  });
  const asset = (await one("SELECT * FROM assets WHERE id=$1", [
    (output.result as any).asset_id,
  ]))!;
  assert.equal(asset.kind, "image");
  assert.equal(asset.rights_status, "unclear");
  assert.equal(asset.parent_id, imageId);
  assert.equal(asset.metadata.identity_snapshot.version, 1);
  assert.equal(
    (await sharp(await storage.get(asset.storage_key)).metadata()).width,
    180,
  );
  await runImageJob(j, signal(), async () => {
    throw new Error("Keine zweite Anfrage");
  });
  assert.equal(posts, 1);
  assert.ok((await imageConnection(user))!.live_tested_at);
  // Import committed, then process died before the job's success was written.
  await query(
    "UPDATE jobs SET state='running',lease_until=now()-interval '1 minute',attempt_count=1 WHERE id=$1",
    [j.id],
  );
  await recoverJobs();
  await recoverImageJobs();
  assert.equal(
    (await one("SELECT state FROM jobs WHERE id=$1", [j.id]))!.state,
    "succeeded",
  );
});
test("Unklare Übermittlung und Neustart erzeugen keinen zweiten Bildauftrag; manuelle Klärung behält Kosten", async () => {
  const { id } = await create();
  let count = 0;
  const j = await job(id);
  const ambiguous: typeof fetch = async () => {
    count++;
    throw new Error("lost response");
  };
  await assert.rejects(runImageJob(j, signal(), ambiguous));
  await assert.rejects(
    runImageJob(j, signal(), ambiguous),
    /bereits übermittelt/,
  );
  assert.equal(count, 1);
  assert.equal(
    (await one("SELECT state FROM image_generations WHERE id=$1", [id]))!.state,
    "unknown_external_state",
  );
  await assert.rejects(
    command(user, {
      action: "image_resolve",
      data: { id, note: "Abrechnung geprüft", acknowledged: false },
    }),
  );
  await command(user, {
    action: "image_resolve",
    data: {
      id,
      note: "Kein Ergebnis verfügbar, Verbrauch geprüft.",
      acknowledged: true,
    },
  });
  assert.equal(
    (await one("SELECT state FROM image_reservations WHERE generation_id=$1", [
      id,
    ]))!.state,
    "consumed",
  );
  const next = await create();
  const nextJob = await job(next.id);
  await query(
    "UPDATE image_generations SET submitted_at=now(),state='submitting' WHERE id=$1",
    [next.id],
  );
  await query(
    "UPDATE jobs SET state='running',lease_until=now()-interval '1 minute',attempt_count=1 WHERE id=$1",
    [nextJob.id],
  );
  await recoverJobs();
  await recoverImageJobs();
  assert.equal(
    (await one("SELECT state FROM image_generations WHERE id=$1", [next.id]))!
      .state,
    "unknown_external_state",
  );
  await command(user, {
    action: "image_resolve",
    data: {
      id: next.id,
      note: "Manuell importierte Testdatei zugeordnet.",
      asset_id: imageId,
      acknowledged: true,
    },
  });
});
test("Abbruch vor dem Start gibt Budget frei; fremde oder defekte Bildantworten werden nicht importiert", async () => {
  const { id } = await create();
  const j = await job(id);
  await command(user, { action: "cancel_job", data: { id: j.id } });
  await recoverImageJobs();
  assert.equal(
    (await one("SELECT state FROM image_generations WHERE id=$1", [id]))!.state,
    "cancelled",
  );
  assert.equal(
    (await one("SELECT state FROM image_reservations WHERE generation_id=$1", [
      id,
    ]))!.state,
    "released",
  );
  let sent = 0;
  await assert.rejects(
    runImageJob(j, signal(), async () => {
      sent++;
      return generated("unused");
    }),
  );
  assert.equal(sent, 0);
  const wrong = await create();
  await assert.rejects(
    runImageJob(await job(wrong.id), signal(), async () =>
      Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: Buffer.from("not an image").toString("base64"),
                  },
                },
              ],
            },
          },
        ],
      }),
    ),
  );
  assert.equal(
    (await one("SELECT asset_id FROM image_generations WHERE id=$1", [
      wrong.id,
    ]))!.asset_id,
    null,
  );
  await command(user, {
    action: "image_resolve",
    data: {
      id: wrong.id,
      note: "Testantwort ungültig. Kein Bild verfügbar.",
      acknowledged: true,
    },
  });
});
test("Codex nutzt ausschließlich Runner und ChatGPT-Kontingent; Import behält Herkunft, Wechsel ist versioniert", async () => {
  await configure({ provider: "codex", version: 1 });
  assert.equal(
    (await one("SELECT encrypted_key FROM image_connections"))!.encrypted_key,
    null,
  );
  const { id } = await create({
    connection_version: 2,
    approved_cost_usd: null,
  });
  const output = await runImageJob(
    await job(id),
    signal(),
    async (uri, init) => {
      if (String(uri).endsWith("/health")) return check(uri, init);
      assert.equal(
        String(uri),
        (process.env.RUNNER_URL ?? "http://127.0.0.1:3211") + "/image",
      );
      const body = JSON.parse(String(init!.body));
      assert.ok(body.reference);
      assert.equal(body.api_key, undefined);
      return Response.json({
        result: { images: [{ data: image.toString("base64") }] },
        usage: null,
      });
    },
  );
  assert.equal(
    (await one("SELECT origin FROM assets WHERE id=$1", [
      (output.result as any).asset_id,
    ]))!.origin,
    "codex_chatgpt_image",
  );
  assert.equal(
    (await one(
      "SELECT amount_usd FROM image_reservations WHERE generation_id=$1",
      [id],
    ))!.amount_usd,
    null,
  );
  await configure({ provider: "manual", version: 2 });
  await assert.rejects(
    create({ connection_version: 3, approved_cost_usd: null }),
    /auswählen und verbinden/,
  );
});
