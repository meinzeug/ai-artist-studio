import "dotenv/config";
import { mkdir, cp, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pool, query } from "../src/server/db";
import { runProcess } from "../src/lib/process";
import { storage } from "../src/server/storage";
const target = path.resolve(
  process.argv[2] ??
    ".local/backups/" + new Date().toISOString().replaceAll(":", "-"),
);
await mkdir(target, { recursive: true, mode: 0o700 });
if ((await readdir(target)).length) throw new Error("Backupziel muss leer sein.");
// App writes must be paused for a cross-file consistent production backup.
const active = await query("SELECT id FROM jobs WHERE state='running'");
if (active.length)
  throw new Error(
    "Backup benötigt ruhenden Worker: aktive Jobs zuerst beenden/abbrechen.",
  );
const dbUrl = new URL(process.env.DATABASE_URL!);
const env = {
  ...process.env,
  PGHOST: dbUrl.hostname,
  PGPORT: dbUrl.port || "5432",
  PGUSER: decodeURIComponent(dbUrl.username),
  PGPASSWORD: decodeURIComponent(dbUrl.password),
  PGDATABASE: dbUrl.pathname.slice(1),
};
const dump = await runProcess(
  "pg_dump",
  ["-Fc", "--no-owner", "--no-acl", "-f", path.join(target, "database.dump")],
  { env, timeout: 120000 },
);
if (dump.code) throw new Error("pg_dump fehlgeschlagen: " + dump.stderr);
await mkdir(path.join(target, "assets"), { recursive: true });
const assets = await query("SELECT id,storage_key,sha256,bytes FROM assets");
for (const asset of assets)
  await cp(
    storage.path(asset.storage_key),
    path.join(target, "assets", asset.storage_key),
    { errorOnExist: true, force: false },
  );
await writeFile(
  path.join(target, "manifest.json"),
  JSON.stringify(
    {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      version: 1,
      assets,
      cliCredentialsIncluded: false,
      encryptionKeyIncluded: false,
      encryptedProviderTokensInDatabase: true,
      restore:
        "Datenbank in neue leere Datenbank mit pg_restore; Assets in neuen privaten Storage; Hashes prüfen.",
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
await pool.end();
console.log("Backup erstellt:", target);
