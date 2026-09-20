import "dotenv/config";
import { pool, one, query } from "../src/server/db";
import { runProcess } from "../src/lib/process";
import IORedis from "ioredis";
const check = async (name: string, fn: () => Promise<unknown>) => {
  try {
    console.log(name, await fn());
  } catch (e) {
    console.log(name, "FEHLER:", (e as Error).message);
  }
};
await check("PostgreSQL", async () => !!(await one("SELECT 1")));
await check("Redis", async () => {
  const r = new IORedis(process.env.REDIS_URL!, {
    retryStrategy: () => null,
    connectTimeout: 3000,
  });
  try {
    return await r.ping();
  } finally {
    r.disconnect();
  }
});
await check(
  "Web",
  async () =>
    (
      await fetch(
        (process.env.APP_ORIGIN ?? "http://127.0.0.1:3210") + "/api/health",
        { signal: AbortSignal.timeout(5000) },
      )
    ).status,
);
await check(
  "Runner",
  async () =>
    (
      await fetch(
        (process.env.RUNNER_URL ?? "http://127.0.0.1:3211") + "/health",
        {
          headers: { Authorization: "Bearer " + process.env.RUNNER_TOKEN },
          signal: AbortSignal.timeout(15000),
        },
      )
    ).status,
);
for (const bin of ["ffmpeg", "ffprobe"])
  await check(
    bin,
    async () => (await runProcess(bin, ["-version"])).stdout.split("\n")[0],
  );
await check("Jobs", async () =>
  query("SELECT state,count(*)::int FROM jobs GROUP BY state"),
);
await pool.end();
