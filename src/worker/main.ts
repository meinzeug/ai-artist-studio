import "dotenv/config";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { randomUUID } from "node:crypto";
import { pool, one, query, transaction } from "../server/db";
import { recoverJobs } from "../server/jobs";
import { runTask } from "./tasks";
import { storage } from "../server/storage";
import { queueMusicPolls, SunoJobError } from "../server/suno";
import { queueVideoPolls, VideoJobError } from "../server/video-generation";
import { tickAutomation } from "../server/automation";
import { recoverImageJobs, ImageJobError } from "../server/image-generation";
const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://127.0.0.1:57379",
  { maxRetriesPerRequest: null },
);
const queue = new Queue(process.env.QUEUE_NAME ?? "studio", {
  connection: connection as any,
});
const controllers = new Map<string, AbortController>();
let pumping = false;
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    await recoverJobs();
    await recoverImageJobs();
    await queueMusicPolls();
    await queueVideoPolls();
    await tickAutomation();
    for (const file of await query(
      "SELECT storage_key FROM stored_files_gc LIMIT 20",
    )) {
      try {
        await storage.remove(file.storage_key);
        await query("DELETE FROM stored_files_gc WHERE storage_key=$1", [
          file.storage_key,
        ]);
      } catch {
        console.error(
          "worker.storage_cleanup",
          "Datei wird beim nächsten Durchlauf erneut gelöscht.",
        );
      }
    }
    await query(
      "UPDATE outbox SET dispatched_at=NULL WHERE dispatched_at<now()-interval '2 minutes' AND job_id IN (SELECT id FROM jobs WHERE state='queued')",
    );
    await query(
      "UPDATE jobs SET state='waiting_for_input',error='Vorgänger benötigt Eingriff.' WHERE state='queued' AND depends_on IN (SELECT id FROM jobs WHERE state IN ('failed','cancelled','unknown_external_state'))",
    );
    const rows = await query(
      "SELECT j.id FROM jobs j JOIN outbox o ON o.job_id=j.id JOIN settings s ON s.user_id=j.user_id WHERE j.state='queued' AND j.available_at<=now() AND o.dispatched_at IS NULL AND NOT s.emergency_stop AND (j.depends_on IS NULL OR EXISTS(SELECT 1 FROM jobs d WHERE d.id=j.depends_on AND d.state='succeeded')) LIMIT 20",
    );
    for (const row of rows) {
      await queue.add(
        "execute",
        { id: row.id },
        { jobId: row.id, removeOnComplete: true, removeOnFail: true },
      );
      await query("UPDATE outbox SET dispatched_at=now() WHERE job_id=$1", [
        row.id,
      ]);
    }
  } catch (e) {
    console.error("worker.dispatch", (e as Error).message);
  } finally {
    pumping = false;
  }
}
const worker = new Worker(
  process.env.QUEUE_NAME ?? "studio",
  async (item) => {
    const job: any = await transaction(async (c) => {
      const j = await one(
        "SELECT j.* FROM jobs j JOIN settings s ON s.user_id=j.user_id WHERE j.id=$1 AND j.state='queued' AND NOT s.emergency_stop FOR UPDATE OF j",
        [item.data.id],
        c,
      );
      if (!j) {
        await c.query(
          "UPDATE outbox SET dispatched_at=NULL WHERE job_id=$1 AND EXISTS(SELECT 1 FROM jobs WHERE id=$1 AND state='queued')",
          [item.data.id],
        );
        return null;
      }
      await c.query(
        "UPDATE jobs SET state='running',attempt_count=attempt_count+1,lease_until=now()+interval '45 seconds',updated_at=now() WHERE id=$1",
        [j.id],
      );
      await c.query("UPDATE workflows SET state='running' WHERE id=$1", [
        j.workflow_id,
      ]);
      return { ...j, attempt_count: j.attempt_count + 1 };
    });
    if (!job) return;
    const attempt = randomUUID();
    await query(
      "INSERT INTO job_attempts(id,job_id,attempt,state) VALUES($1,$2,$3,'running')",
      [attempt, job.id, job.attempt_count],
    );
    const controller = new AbortController();
    controllers.set(job.id, controller);
    const heartbeat = setInterval(async () => {
      const current = await one("SELECT cancelled_at FROM jobs WHERE id=$1", [
        job.id,
      ]);
      if (current?.cancelled_at) {
        controller.abort();
        void fetch(
          (process.env.RUNNER_URL ?? "http://127.0.0.1:3211") + "/cancel",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + process.env.RUNNER_TOKEN,
            },
            body: JSON.stringify({ id: job.id }),
          },
        ).catch(() => {});
      } else
        await query(
          "UPDATE jobs SET lease_until=now()+interval '45 seconds' WHERE id=$1 AND state='running'",
          [job.id],
        );
    }, 10000);
    const timeout = setTimeout(
      () => controller.abort(),
      job.kind === "render_video"
        ? 1800000
        : job.kind === "image_generate"
          ? 600000
          : 240000,
    );
    try {
      const output = await runTask(job, controller.signal, async (n) => {
        await query(
          "UPDATE jobs SET progress=$2,updated_at=now() WHERE id=$1",
          [job.id, n],
        );
      });
      await transaction(async (c) => {
        const latest = await one(
          "SELECT cancelled_at FROM jobs WHERE id=$1 FOR UPDATE",
          [job.id],
          c,
        );
        const state =
          latest?.cancelled_at && job.side_effect !== "external"
            ? "cancelled"
            : "succeeded";
        await c.query(
          "UPDATE jobs SET state=$2,output=$3,progress=100,lease_until=NULL,updated_at=now() WHERE id=$1",
          [job.id, state, JSON.stringify(output.result)],
        );
        await c.query(
          "UPDATE job_attempts SET state=$2,usage=$3,finished_at=now() WHERE id=$1",
          [attempt, state, JSON.stringify(output.usage)],
        );
        await c.query(
          "UPDATE budget_reservations SET state='consumed' WHERE job_id=$1",
          [job.id],
        );
        await c.query(
          "UPDATE workflows SET state=CASE WHEN EXISTS(SELECT 1 FROM jobs WHERE workflow_id=$1 AND state IN ('queued','running')) THEN 'running' WHEN $2='succeeded' AND EXISTS(SELECT 1 FROM jobs WHERE workflow_id=$1 AND kind='prepare_music_package') THEN 'waiting_for_input' ELSE $2 END WHERE id=$1",
          [job.workflow_id, state],
        );
        if (["suno_generate", "veo_generate"].includes(job.kind))
          await c.query(
            "UPDATE workflows SET state='waiting_for_provider' WHERE id=$1",
            [job.workflow_id],
          );
      });
      console.log(JSON.stringify({ job: job.id, state: "succeeded" }));
    } catch (e) {
      const message = (e as Error).message.slice(0, 2000);
      const current = await one("SELECT cancelled_at FROM jobs WHERE id=$1", [
        job.id,
      ]);
      const state =
        e instanceof SunoJobError ||
        e instanceof VideoJobError ||
        e instanceof ImageJobError
          ? e.jobState
          : current?.cancelled_at
            ? "cancelled"
            : job.side_effect === "external"
              ? "unknown_external_state"
              : job.attempt_count < job.max_attempts &&
                  /ECONNRESET|EAI_AGAIN|temporär|Runner ausgelastet/.test(
                    message,
                  )
                ? "queued"
                : "failed";
      await transaction(async (c) => {
        await c.query(
          "UPDATE jobs SET state=$2,error=$3,lease_until=NULL,dead_letter=($2='failed'),available_at=now()+interval '5 seconds'*power(2,attempt_count),updated_at=now() WHERE id=$1",
          [job.id, state, message],
        );
        if (state === "queued")
          await c.query(
            "UPDATE outbox SET dispatched_at=NULL WHERE job_id=$1",
            [job.id],
          );
        await c.query(
          "UPDATE job_attempts SET state=$2,error=$3,finished_at=now() WHERE id=$1",
          [attempt, state, message],
        );
        await c.query(
          "UPDATE budget_reservations SET state='consumed' WHERE job_id=$1",
          [job.id],
        );
        await c.query(
          "UPDATE workflows SET state=CASE WHEN EXISTS(SELECT 1 FROM jobs WHERE workflow_id=$1 AND state IN ('queued','running')) THEN 'running' WHEN $2='succeeded' AND EXISTS(SELECT 1 FROM jobs WHERE workflow_id=$1 AND kind='prepare_music_package') THEN 'waiting_for_input' ELSE $2 END WHERE id=$1",
          [job.workflow_id, state],
        );
        if (job.kind === "render_video")
          await c.query("UPDATE renders SET state=$2,error=$3 WHERE id=$1", [
            job.input.render_id,
            state,
            message,
          ]);
      });
      console.error(JSON.stringify({ job: job.id, state, error: message }));
    } finally {
      clearInterval(heartbeat);
      clearTimeout(timeout);
      controllers.delete(job.id);
    }
  },
  { connection: connection as any, concurrency: 1, lockDuration: 60000 },
);
worker.on("error", (e) => console.error("worker.queue", e.message));
await pump();
const timer = setInterval(pump, 2000);
console.log("Worker bereit.");
async function shutdown() {
  clearInterval(timer);
  for (const c of controllers.values()) c.abort();
  await worker.close();
  await queue.close();
  await connection.quit();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
