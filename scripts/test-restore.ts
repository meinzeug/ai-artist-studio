import "dotenv/config";
import pg from "pg";
import { randomBytes, createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { runProcess } from "../src/lib/process";

const source = new URL(process.env.TEST_DATABASE_URL!);
if (source.pathname !== "/artist_studio_test")
  throw new Error("Nur separate Testdatenbank erlaubt.");
const target = new URL(source);
target.pathname = "/artist_studio_restore_" + randomBytes(5).toString("hex");
const adminUrl = new URL(source);
adminUrl.pathname = "/postgres";
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
await admin.query(`CREATE DATABASE ${target.pathname.slice(1)}`);
await admin.end();
const root = ".local/restore-acceptance-" + Date.now();
const backup = root + "/backup",
  assets = root + "/assets";
const env = {
  ...process.env,
  DATABASE_URL: source.toString(),
  STORAGE_ROOT: ".local/test-assets",
};
for (const args of [
  ["--import", "tsx", "scripts/backup.ts", backup],
  ["--import", "tsx", "scripts/restore.ts", backup, target.toString(), assets],
]) {
  const r = await runProcess(process.execPath, args, { env, timeout: 120000 });
  if (r.code) throw new Error(r.stderr);
  console.log(r.stdout.trim());
}
async function snapshot(url: URL) {
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const tables = (
      await client.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows;
    const result: Record<string, { count: number; sha256: string }> = {};
    for (const { tablename } of tables) {
      if (!/^[a-z_]+$/.test(tablename))
        throw new Error("Unbekannter Tabellenname.");
      const rows = (
        await client.query(
          `SELECT to_jsonb(t)::text AS data FROM "${tablename}" t ORDER BY to_jsonb(t)::text`,
        )
      ).rows;
      result[tablename] = {
        count: rows.length,
        sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
      };
    }
    return result;
  } finally {
    await client.end();
  }
}
const original = await snapshot(source),
  restored = await snapshot(target);
if (JSON.stringify(original) !== JSON.stringify(restored))
  throw new Error("Tabellendaten unterscheiden sich nach Restore.");
const manifest = JSON.parse(await readFile(backup + "/manifest.json", "utf8"));
if (!manifest.assets.length)
  throw new Error("Keine Testdateien im Backup; E2E zuerst ausführen.");
for (const asset of manifest.assets) {
  const bytes = await readFile(assets + "/" + asset.storage_key);
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
    throw new Error("Wiederhergestellte Datei verändert.");
}
const entries = (await readdir(backup)).sort();
if (
  JSON.stringify(entries) !==
  JSON.stringify(["assets", "database.dump", "manifest.json"])
)
  throw new Error("Unerwartete Dateien im Backup.");
// A real restart of this project's own database, while all application processes are stopped.
const restart = await runProcess(
  "/usr/lib/postgresql/16/bin/pg_ctl",
  [
    "-D",
    ".local/postgres",
    "-l",
    ".local/postgres.log",
    "restart",
    "-m",
    "fast",
  ],
  { timeout: 30000 },
);
if (restart.code) throw new Error(restart.stderr);
if (JSON.stringify(await snapshot(target)) !== JSON.stringify(restored))
  throw new Error("Daten nach Neustart verändert.");
await writeFile(
  ".local/restore-evidence.json",
  JSON.stringify(
    {
      testedAt: new Date().toISOString(),
      passed: true,
      database: target.pathname.slice(1),
      backup,
      storage: assets,
      tableCount: Object.keys(restored).length,
      rowCount: Object.values(restored).reduce((n, r) => n + r.count, 0),
      verifiedAssetHashes: manifest.assets.length,
      databaseRestartVerified: true,
      cliAuthIncluded: false,
    },
    null,
    2,
  ),
);
console.log(
  `PASS: ${Object.keys(restored).length} Tabellen identisch, ${manifest.assets.length} Dateien verifiziert, Datenbank-Neustart bestanden.`,
);
