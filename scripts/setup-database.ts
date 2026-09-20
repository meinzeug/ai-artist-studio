import "dotenv/config";
import pg from "pg";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { runProcess } from "../src/lib/process";
const url = new URL(process.env.DATABASE_URL!);
if (url.hostname !== "127.0.0.1" || url.port !== "56432")
  throw new Error("Lokales Setup nur für eigenen Cluster auf 56432.");
const c = new pg.Client({
  host: "/tmp",
  port: 56432,
  user: decodeURIComponent(url.username),
  database: "postgres",
});
await c.connect();
for (const database of ["artist_studio", "artist_studio_test"])
  if (
    !(await c.query("SELECT 1 FROM pg_database WHERE datname=$1", [database]))
      .rowCount
  )
    await c.query(`CREATE DATABASE ${database}`);
if (!url.password) {
  url.password = randomBytes(24).toString("hex");
}
{
  const role = decodeURIComponent(url.username).replaceAll('"', '""');
  const pass = decodeURIComponent(url.password).replaceAll("'", "''");
  await c.query(`ALTER ROLE "${role}" PASSWORD '${pass}'`);
}
await c.end();
// Change only this project's cluster; preserve unrelated env configuration.
const env = await readFile(".env", "utf8");
const testUrl = new URL(url);
testUrl.pathname = "/artist_studio_test";
let updated = env.replace(
  /^DATABASE_URL=.*$/m,
  "DATABASE_URL=" + url.toString(),
);
updated = /^TEST_DATABASE_URL=/m.test(updated)
  ? updated.replace(
      /^TEST_DATABASE_URL=.*$/m,
      "TEST_DATABASE_URL=" + testUrl.toString(),
    )
  : updated.trimEnd() + "\nTEST_DATABASE_URL=" + testUrl.toString() + "\n";
await writeFile(".env", updated, { mode: 0o600 });
const hba = await readFile(".local/postgres/pg_hba.conf", "utf8");
await writeFile(
  ".local/postgres/pg_hba.conf",
  hba
    .replace(/^(host\S*\s+.*\s)trust(\s*)$/gm, "$1scram-sha-256$2")
    .replace(/^(local\s+.*\s)trust(\s*)$/gm, "$1peer$2"),
);
const reload = await runProcess("/usr/lib/postgresql/16/bin/pg_ctl", [
  "-D",
  ".local/postgres",
  "reload",
]);
if (reload.code)
  throw new Error(
    "Projekt-Datenbankkonfiguration konnte nicht neu geladen werden.",
  );
console.log(
  "Eigener Datenbankcluster: TCP mit Passwort, lokaler Socket mit Peer-Anmeldung.",
);
