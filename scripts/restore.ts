import "dotenv/config";
import { readFile, mkdir, cp } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { runProcess } from "../src/lib/process";
import { hash } from "../src/server/security";
const [backup, targetUrl, targetStorage] = process.argv.slice(2);
if (!backup || !targetUrl || !targetStorage)
  throw new Error(
    "Aufruf: npm run restore -- BACKUP NEUE_DATENBANK_URL NEUER_STORAGE",
  );
if (targetUrl === process.env.DATABASE_URL)
  throw new Error("Restore ausschließlich in eine separate leere Datenbank.");
const dest = new URL(targetUrl),
  client = new pg.Client({ connectionString: targetUrl });
await client.connect();
const tables = await client.query(
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'",
);
if (Number(tables.rows[0].count) > 0)
  throw new Error("Zieldatenbank ist nicht leer.");
await client.end();
const manifest = JSON.parse(
  await readFile(path.join(backup, "manifest.json"), "utf8"),
);
const env = {
  ...process.env,
  PGHOST: dest.hostname,
  PGPORT: dest.port || "5432",
  PGUSER: decodeURIComponent(dest.username),
  PGPASSWORD: decodeURIComponent(dest.password),
  PGDATABASE: dest.pathname.slice(1),
};
const result = await runProcess(
  "pg_restore",
  [
    "--exit-on-error",
    "--no-owner",
    "--no-acl",
    "-d",
    dest.pathname.slice(1),
    path.join(backup, "database.dump"),
  ],
  { env, timeout: 120000 },
);
if (result.code) throw new Error(result.stderr);
await mkdir(targetStorage, { recursive: true, mode: 0o700 });
for (const asset of manifest.assets) {
  if (!/^[a-f\d-]+\.[a-z\d]+$/.test(asset.storage_key))
    throw new Error("Ungültiger Assetpfad im Manifest.");
  const file = path.join(backup, "assets", asset.storage_key),
    content = await readFile(file);
  if (hash(content) !== asset.sha256)
    throw new Error("Hashprüfung fehlgeschlagen: " + asset.id);
  await cp(file, path.join(targetStorage, asset.storage_key), {
    errorOnExist: true,
    force: false,
  });
}
console.log(
  `Restore abgeschlossen. ${manifest.assets.length} Dateihashes überprüft. CLI-Auth und Token-Schlüssel separat konfigurieren.`,
);
