import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { pool } from "../src/server/db";
if (!process.env.DATABASE_URL?.endsWith("/artist_studio_test"))
  throw new Error("Testserver nur mit separater Testdatenbank erlaubt.");
await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
await pool.end();
const run = (args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const p = spawn(process.execPath, args, {
      stdio: "inherit",
      env: process.env,
    });
    p.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Testmigration fehlgeschlagen")),
    );
  });
await run(["--import", "tsx", "scripts/migrate.ts"]);
await mkdir("docs/screenshots", { recursive: true });
const web = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3212",
  ],
  { stdio: "inherit", env: process.env },
);
const worker = spawn(
  process.execPath,
  ["--import", "tsx", "src/worker/main.ts"],
  { stdio: "inherit", env: process.env },
);
function stop() {
  web.kill("SIGTERM");
  worker.kill("SIGTERM");
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
