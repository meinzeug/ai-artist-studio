import "dotenv/config";
import pg from "pg";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { runProcess } from "../src/lib/process";
const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dennis@127.0.0.1:56432/artist_studio_test";
if (new URL(connectionString).pathname !== "/artist_studio_test")
  throw new Error("Nur Testdatenbank erlaubt.");
const schema = "recovery_" + randomUUID().replaceAll("-", "");
const c = new pg.Client({ connectionString });
await c.connect();
await c.query(`CREATE SCHEMA ${schema}`);
await c.query(`SET search_path TO ${schema},public`);
for (const f of (await readdir("migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort())
  await c.query(await readFile("migrations/" + f, "utf8"));
await mkdir(".local/recovery-assets", { recursive: true });
const key = randomUUID() + ".wav";
const result = await runProcess("ffmpeg", [
  "-v",
  "error",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=180",
  "-y",
  ".local/recovery-assets/" + key,
]);
if (result.code) throw new Error("Fixture fehlgeschlagen.");
const user = randomUUID(),
  artist = randomUUID(),
  asset = randomUUID(),
  job = randomUUID(),
  workflow = randomUUID();
await c.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)", [
  user,
  "recovery@example.invalid",
  "test-no-login",
]);
await c.query("INSERT INTO settings(user_id) VALUES($1)", [user]);
await c.query("INSERT INTO artists(id,user_id,name) VALUES($1,$2,$3)", [
  artist,
  user,
  "Synthetischer Wiederaufnahmetest",
]);
await c.query(
  "INSERT INTO assets(id,artist_id,kind,name,storage_key,mime,bytes,sha256) VALUES($1,$2,'audio','SYNTHETISCHE-TESTDATEI.wav',$3,'audio/wav',1,'test')",
  [asset, artist, key],
);
await c.query(
  "INSERT INTO workflows(id,user_id,artist_id,name) VALUES($1,$2,$3,'Wiederaufnahme')",
  [workflow, user, artist],
);
await c.query(
  "INSERT INTO jobs(id,user_id,artist_id,workflow_id,kind,input,idempotency_key) VALUES($1,$2,$3,$4,'analyze_asset',$5,$6)",
  [
    job,
    user,
    artist,
    workflow,
    JSON.stringify({ asset_id: asset }),
    randomUUID(),
  ],
);
await c.query("INSERT INTO outbox(id,job_id) VALUES($1,$2)", [
  randomUUID(),
  job,
]);
const url = new URL(connectionString);
url.searchParams.set("options", "-csearch_path=" + schema + ",public");
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  STORAGE_ROOT: ".local/recovery-assets",
  QUEUE_NAME: "recovery-" + schema,
};
const launch = () =>
  spawn(process.execPath, ["--import", "tsx", "src/worker/main.ts"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
let worker = launch();
let log = "";
const record = (p: ReturnType<typeof launch>) => {
  p.stdout?.on("data", (b) => (log += b));
  p.stderr?.on("data", (b) => (log += b));
};
record(worker);
async function waitState(expected: string, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const row = (await c.query("SELECT state FROM jobs WHERE id=$1", [job]))
      .rows[0];
    if (row.state === expected) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("State timeout " + expected + " " + log);
}
try {
  await waitState("running");
  worker.kill("SIGKILL");
  await new Promise<void>((r) => worker.once("exit", () => r()));
  await c.query(
    "UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1",
    [job],
  );
  worker = launch();
  record(worker);
  await waitState("succeeded", 130000);
  const row = (
    await c.query("SELECT state,attempt_count FROM jobs WHERE id=$1", [job])
  ).rows[0];
  if (row.attempt_count !== 2)
    throw new Error("Erwartet zwei Versuche: " + JSON.stringify(row));
  const metadata = (
    await c.query("SELECT metadata FROM assets WHERE id=$1", [asset])
  ).rows[0].metadata;
  if (!metadata.waveform?.length)
    throw new Error("Keine Audioanalyse nach Neustart.");
  await writeFile(
    ".local/recovery-evidence.json",
    JSON.stringify(
      {
        test: "real SIGKILL worker restart",
        passed: true,
        attempts: row.attempt_count,
        leaseExpiryAccelerated: true,
        bullmqStalledRecovery: true,
        finishedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: Echter Worker-Abbruch, BullMQ-Stalled-Recovery, zweiter Versuch mit gespeicherter Audioanalyse.",
  );
} finally {
  worker.kill("SIGTERM");
  await new Promise<void>((r) => worker.once("exit", () => r()));
  await c.query(`DROP SCHEMA ${schema} CASCADE`);
  await c.end();
}
