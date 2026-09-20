import { randomUUID } from "node:crypto";
import { one, query, transaction, type Client } from "./db";
import { AppError, audit } from "./security";
import type { JobKind } from "@/lib/domain";
export async function enqueue(
  userId: string,
  artistId: string | null,
  kind: JobKind,
  input: unknown,
  key: string,
  c?: Client,
) {
  const execute = async (c: Client) => {
    await c.query("SELECT user_id FROM settings WHERE user_id=$1 FOR UPDATE", [
      userId,
    ]);
    const existing = await one(
      "SELECT * FROM jobs WHERE user_id=$1 AND idempotency_key=$2",
      [userId, key],
      c,
    );
    if (existing) return existing;
    const settings = await one(
      "SELECT * FROM settings WHERE user_id=$1",
      [userId],
      c,
    );
    if (settings!.emergency_stop)
      throw new AppError(
        "Not-Aus aktiv. Neue Produktionsaufträge sind gesperrt.",
        409,
      );
    const type =
      kind === "render_video"
        ? "render"
        : [
              "analyze_asset",
              "sync_metrics",
              "prepare_music_package",
              "suno_generate",
              "suno_sync",
            ].includes(kind)
          ? "analysis"
          : "ai";
    const sums = await one(
      "SELECT coalesce(sum(units) FILTER (WHERE created_at>=date_trunc('day',now() AT TIME ZONE $3) AT TIME ZONE $3),0) AS daily,coalesce(sum(units) FILTER(WHERE created_at>=date_trunc('month',now() AT TIME ZONE $3) AT TIME ZONE $3),0) AS monthly FROM budget_reservations WHERE user_id=$1 AND kind=$2 AND state IN ('reserved','consumed')",
      [userId, type, settings!.timezone],
      c,
    );
    if (
      type === "ai" &&
      (Number(sums!.daily) >= settings!.daily_ai_limit ||
        Number(sums!.monthly) >= settings!.monthly_ai_limit)
    )
      throw new AppError("KI-Auftragsbudget erreicht.", 409);
    if (
      type === "render" &&
      Number(sums!.daily) >= settings!.daily_render_limit
    )
      throw new AppError("Tägliche Renderkapazität erreicht.", 409);
    const artist = artistId
      ? await one("SELECT * FROM artists WHERE id=$1", [artistId], c)
      : null;
    const storedInput = {
      ...(input as Record<string, unknown>),
      ...(artist ? { artist_snapshot: artist } : {}),
    };
    const id = randomUUID(),
      workflow = randomUUID();
    await c.query(
      "INSERT INTO workflows(id,user_id,artist_id,name) VALUES($1,$2,$3,$4)",
      [workflow, userId, artistId, kind],
    );
    await c.query(
      "INSERT INTO jobs(id,user_id,artist_id,workflow_id,kind,input,idempotency_key,max_attempts) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        userId,
        artistId,
        workflow,
        kind,
        JSON.stringify(storedInput),
        key,
        type === "ai" ? 1 : 2,
      ],
    );
    await c.query("INSERT INTO outbox(id,job_id) VALUES($1,$2)", [
      randomUUID(),
      id,
    ]);
    await c.query(
      "INSERT INTO budget_reservations(id,user_id,job_id,kind,units,cost) VALUES($1,$2,$3,$4,1,NULL)",
      [randomUUID(), userId, id, type],
    );
    await audit(userId, "job.queued", id, { kind }, c);
    return (await one("SELECT * FROM jobs WHERE id=$1", [id], c))!;
  };
  return c ? execute(c) : transaction(execute);
}
export async function recoverJobs() {
  return transaction(async (c) => {
    const jobs = await query(
      "SELECT * FROM jobs WHERE state='running' AND lease_until<now() FOR UPDATE SKIP LOCKED",
      [],
      c,
    );
    for (const j of jobs) {
      const state =
        j.side_effect === "external"
          ? "unknown_external_state"
          : j.attempt_count >= j.max_attempts
            ? "failed"
            : "queued";
      await c.query(
        "UPDATE jobs SET state=$2,error=$3,lease_until=NULL,updated_at=now() WHERE id=$1",
        [
          j.id,
          state,
          state === "queued"
            ? "Nach Prozessabbruch erneut eingereiht."
            : "Prozessabbruch; Statusprüfung oder manueller Neustart erforderlich.",
        ],
      );
      await c.query(
        "UPDATE job_attempts SET state='interrupted',finished_at=now() WHERE job_id=$1 AND state='running'",
        [j.id],
      );
      if (state === "queued")
        await c.query("UPDATE outbox SET dispatched_at=NULL WHERE job_id=$1", [
          j.id,
        ]);
      else
        await c.query(
          "UPDATE budget_reservations SET state='consumed' WHERE job_id=$1",
          [j.id],
        );
      if (j.kind === "suno_generate") {
        await c.query(
          "UPDATE music_orders SET state=CASE WHEN external_id IS NOT NULL THEN 'waiting_for_provider' WHEN submitted_at IS NOT NULL THEN 'unknown_external_state' ELSE 'failed' END,error='Worker unterbrochen; vorhandenen externen Auftrag prüfen.',next_poll_at=now() WHERE job_id=$1 AND state IN ('queued','submitting')",
          [j.id],
        );
        await c.query(
          "UPDATE music_credit_reservations SET state='released' WHERE order_id IN (SELECT id FROM music_orders WHERE job_id=$1 AND submitted_at IS NULL)",
          [j.id],
        );
      }
    }
    return jobs.length;
  });
}
