import { pool, transaction } from "../src/server/db";
import { readdir, readFile } from "node:fs/promises";
await pool.query(
  "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
);
for (const name of (await readdir("migrations"))
  .filter((x) => x.endsWith(".sql"))
  .sort())
  await transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(772120)");
    if (
      (
        await c.query("SELECT name FROM schema_migrations WHERE name=$1", [
          name,
        ])
      ).rowCount
    )
      return;
    await c.query(await readFile(`migrations/${name}`, "utf8"));
    await c.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
    console.log(`Migration: ${name}`);
  });
await pool.end();
