import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import sharp from "sharp";
const schema = "manual_start_" + randomBytes(5).toString("hex");
const url = new URL(process.env.TEST_DATABASE_URL!);
if (url.pathname !== "/artist_studio_test")
  throw Error("Isolated test DB required");
url.searchParams.set("options", "-csearch_path=" + schema + ",public");
process.env.DATABASE_URL = url.toString();
process.env.STORAGE_ROOT = ".local/" + schema;
const { pool, one, query } = await import("../src/server/db");
const { command } = await import("../src/server/commands");
const { tickAutomation } = await import("../src/server/automation");
const { saveUpload, storage } = await import("../src/server/storage");
const { localProductionDay } = await import("../src/lib/automation");
before(async () => {
  await pool.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pool.query(await readFile("migrations/" + f, "utf8"));
});
after(async () => {
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
  await rm(storage.root, { recursive: true, force: true });
});
async function fixture() {
  const user = randomUUID();
  await query(
    "INSERT INTO users(id,email,password_hash) VALUES($1,$2,'synthetic-only')",
    [user, user + "@example.invalid"],
  );
  await query("INSERT INTO settings(user_id) VALUES($1)", [user]);
  const cmd = (action: string, data: any, key?: string) =>
    command(user, { action, data, key });
  const artist = await cmd("create_artist", {
    name: "Synthetic manual production",
  });
  await cmd("auto_settings", {
    artist_id: artist.id,
    version: 0,
    enabled: true,
    daily_time: "09:00",
    music_mode: "manual",
    approved: true,
    image_version: null,
    music_version: null,
    full_music_video: true,
    video_scene_count: 8,
  });
  const image = await saveUpload(
      "synthetic-reference.png",
      await sharp({
        create: { width: 16, height: 16, channels: 3, background: "#cc7733" },
      })
        .png()
        .toBuffer(),
    ),
    portrait = randomUUID();
  await query(
    "INSERT INTO assets(id,artist_id,kind,name,storage_key,mime,bytes,sha256,metadata) VALUES($1,$2,'image','Synthetic reference',$3,$4,$5,$6,$7)",
    [
      portrait,
      artist.id,
      image.storage_key,
      image.mime,
      image.bytes,
      image.sha256,
      JSON.stringify(image.metadata),
    ],
  );
  await query(
    "UPDATE artist_automations SET reference_asset_id=$2,next_run_at=now()+interval '1 day' WHERE artist_id=$1",
    [artist.id, portrait],
  );
  const policy = (await one(
    "SELECT * FROM artist_automations WHERE artist_id=$1",
    [artist.id],
  ))!;
  const data = {
    artist_id: artist.id,
    version: policy.version,
    approved: true,
    image_version: null,
    music_version: null,
  };
  return { user, artist, portrait, policy, cmd, data };
}
test("Zusatzproduktion am selben Tag: idempotent, eigener Start, Identität und Termin bleiben erhalten", async () => {
  const f = await fixture(),
    daily = randomUUID(),
    key = randomUUID();
  await query(
    "INSERT INTO automation_runs(id,user_id,artist_id,local_day,stage,state,identity_ready) VALUES($1,$2,$3,$4,'delivery','ready',true)",
    [daily, f.user, f.artist.id, localProductionDay()],
  );
  const [a, b] = await Promise.all([
    f.cmd("auto_start", f.data, key),
    f.cmd("auto_start", f.data, key),
  ]);
  assert.equal(a.run_id, b.run_id);
  assert.notEqual(a.run_id, daily);
  const run = (await one("SELECT * FROM automation_runs WHERE id=$1", [
    a.run_id,
  ]))!;
  assert.equal(run.start_kind, "manual");
  assert.equal(run.stage, "song");
  assert.equal(run.full_music_video, true);
  assert.equal(run.video_scene_count, 8);
  assert.equal(run.identity_ready, true);
  const policy = (await one(
    "SELECT * FROM artist_automations WHERE artist_id=$1",
    [f.artist.id],
  ))!;
  assert.deepEqual(policy.next_run_at, f.policy.next_run_at);
  assert.equal(policy.reference_asset_id, f.portrait);
  await assert.rejects(
    () => f.cmd("auto_start", f.data),
    /vorhandene Produktion/,
  );
  await tickAutomation();
  await tickAutomation();
  assert.equal(
    (
      await query(
        "SELECT * FROM jobs WHERE artist_id=$1 AND kind='auto_song'",
        [f.artist.id],
      )
    ).length,
    1,
  );
  assert.equal(
    (
      await query(
        "SELECT * FROM jobs WHERE artist_id=$1 AND kind='auto_identity'",
        [f.artist.id],
      )
    ).length,
    0,
  );
  await query("UPDATE automation_runs SET state='ready' WHERE id=$1", [
    a.run_id,
  ]);
  await query(
    "UPDATE artist_automations SET next_run_at=now()-interval '1 minute' WHERE artist_id=$1",
    [f.artist.id],
  );
  await tickAutomation();
  assert.equal(
    (
      await query("SELECT * FROM automation_runs WHERE artist_id=$1", [
        f.artist.id,
      ])
    ).length,
    2,
  );
});
test("Zusatzstart schützt Eigentümer, Vorschauversion, Providerfreigabe, Pause und Not-Aus", async () => {
  const f = await fixture();
  await assert.rejects(
    () => command(randomUUID(), { action: "auto_start", data: f.data }),
    /gefunden|Zugriff/,
  );
  await assert.rejects(() =>
    f.cmd("auto_start", { ...f.data, approved: false }),
  );
  await assert.rejects(
    () => f.cmd("auto_start", { ...f.data, version: 999 }),
    /inzwischen geändert/,
  );
  await assert.rejects(
    () => f.cmd("auto_start", { ...f.data, image_version: 999 }),
    /Provider oder Produktionsbudget/,
  );
  await query(
    "UPDATE artist_automations SET enabled=false WHERE artist_id=$1",
    [f.artist.id],
  );
  await assert.rejects(() => f.cmd("auto_start", f.data), /aktivieren/);
  await query("UPDATE artist_automations SET enabled=true WHERE artist_id=$1", [
    f.artist.id,
  ]);
  await query("UPDATE settings SET emergency_stop=true WHERE user_id=$1", [
    f.user,
  ]);
  await assert.rejects(() => f.cmd("auto_start", f.data), /Not-Aus/);
  assert.equal(
    (
      await query("SELECT * FROM automation_runs WHERE artist_id=$1", [
        f.artist.id,
      ])
    ).length,
    0,
  );
});
test("Zusatzstart erhöht kein KI-Budget und bleibt bei ausgeschöpftem Limit als Aufgabe erhalten", async () => {
  const f = await fixture();
  await query("UPDATE settings SET daily_ai_limit=0 WHERE user_id=$1", [
    f.user,
  ]);
  const run = await f.cmd("auto_start", f.data);
  await tickAutomation();
  const row = (await one("SELECT * FROM automation_runs WHERE id=$1", [
    run.run_id,
  ]))!;
  assert.equal(row.state, "waiting_for_input");
  assert.match(row.error, /KI-Auftragsbudget erreicht/);
  assert.equal(
    (await query("SELECT * FROM jobs WHERE artist_id=$1", [f.artist.id]))
      .length,
    0,
  );
  assert.equal(
    (await one("SELECT daily_ai_limit FROM settings WHERE user_id=$1", [
      f.user,
    ]))!.daily_ai_limit,
    0,
  );
  assert.equal(
    (
      await query(
        "SELECT * FROM manual_tasks WHERE run_id=$1 AND state='open'",
        [run.run_id],
      )
    ).length,
    1,
  );
});
