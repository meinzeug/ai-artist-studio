import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { one, query, transaction } from "./db";
import {
  AppError,
  own,
  ownArtist,
  audit,
  encrypt,
  decrypt,
  hash,
} from "./security";
import { enqueue } from "./jobs";
import { saveUpload, storage } from "./storage";
import { VeoProvider, VeoError, operationName } from "../providers/veo";
import { videoSceneSchema, veoModel, videoCost } from "../lib/video-generation";

export class VideoJobError extends Error {
  constructor(
    message: string,
    public jobState: "failed" | "unknown_external_state",
  ) {
    super(message);
  }
}
export async function videoConnection(user: string) {
  return (
    (await one(
      "SELECT model,rate_usd_second,daily_limit_usd,monthly_limit_usd,state,version,checked_at,live_tested_at FROM video_connections WHERE user_id=$1",
      [user],
    )) ?? null
  );
}
async function lockedSettings(user: string, c: any) {
  return (await one(
    "SELECT * FROM settings WHERE user_id=$1 FOR UPDATE",
    [user],
    c,
  ))!;
}
async function noOpenOrders(user: string, c: any) {
  if (
    await one(
      "SELECT id FROM video_generations WHERE user_id=$1 AND state NOT IN ('succeeded','failed','cancelled') LIMIT 1",
      [user],
      c,
    )
  )
    throw new AppError(
      "Offene Veo-Aufträge zuerst abschließen oder ihren externen Status klären.",
    );
}
export async function videoCommand(
  user: string,
  action: string,
  d: Record<string, any>,
  key: string,
) {
  if (action === "veo_connect") {
    const v = z
      .object({
        api_key: z.string().trim().max(2000).optional(),
        version: z.number().int().nonnegative().default(0),
        model: veoModel,
        rate_usd_second: z.number().positive().max(100).multipleOf(0.0001),
        daily_limit_usd: z.number().min(0).max(10000),
        monthly_limit_usd: z.number().min(0).max(100000),
      })
      .parse(d);
    const existing = await one(
      "SELECT * FROM video_connections WHERE user_id=$1",
      [user],
    );
    const apiKey =
      v.api_key || (existing ? decrypt(existing.encrypted_key) : "");
    if (!apiKey || /[\s\x00-\x1f]/.test(apiKey))
      throw new AppError(
        "Bitte einen gültigen Google-AI-Studio-API-Key eingeben.",
      );
    await new VeoProvider(apiKey).healthCheck(v.model);
    await transaction(async (c) => {
      await lockedSettings(user, c);
      await noOpenOrders(user, c);
      const current = await one(
        "SELECT version FROM video_connections WHERE user_id=$1",
        [user],
        c,
      );
      if ((current?.version ?? 0) !== v.version)
        throw new AppError(
          "Verbindung inzwischen geändert. Bitte neu laden.",
          409,
        );
      await c.query(
        "INSERT INTO video_connections(user_id,encrypted_key,model,rate_usd_second,daily_limit_usd,monthly_limit_usd) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE SET encrypted_key=$2,model=$3,rate_usd_second=$4,daily_limit_usd=$5,monthly_limit_usd=$6,state='connected',version=video_connections.version+1,checked_at=now(),live_tested_at=NULL",
        [
          user,
          encrypt(apiKey),
          v.model,
          v.rate_usd_second,
          v.daily_limit_usd,
          v.monthly_limit_usd,
        ],
      );
      await audit(
        user,
        "veo.connected",
        user,
        { model: v.model, check: "model_metadata_only" },
        c,
      );
    });
    return { ok: true };
  }
  if (action === "veo_disconnect")
    return transaction(async (c) => {
      await lockedSettings(user, c);
      await noOpenOrders(user, c);
      await c.query("DELETE FROM video_connections WHERE user_id=$1", [user]);
      await audit(user, "veo.disconnected", user, {}, c);
      return { ok: true };
    });
  if (action === "veo_generate") {
    const v = videoSceneSchema.parse(d);
    if (d.approved !== true || d.rights_confirmed !== true)
      throw new AppError(
        "Kosten und Berechtigung zur Übermittlung des Startbilds ausdrücklich bestätigen.",
      );
    await ownArtist(user, v.artist_id);
    const reference = await own(user, "assets", v.reference_asset_id);
    if (
      reference.artist_id !== v.artist_id ||
      reference.kind !== "image" ||
      reference.rights_status === "disputed"
    )
      throw new AppError("Ein verwendbares Bild dieses Künstlers auswählen.");
    if (
      v.song_id &&
      (await own(user, "songs", v.song_id)).artist_id !== v.artist_id
    )
      throw new AppError("Song gehört zu anderem Künstler.");
    return transaction(async (c) => {
      const settings = await lockedSettings(user, c);
      const existing = await one(
        "SELECT input->>'generation_id' id FROM jobs WHERE user_id=$1 AND idempotency_key=$2 AND kind='veo_generate'",
        [user, key],
        c,
      );
      if (existing) return { ...existing, existing: true };
      const connection = await one(
        "SELECT * FROM video_connections WHERE user_id=$1",
        [user],
        c,
      );
      if (!connection || connection.state !== "connected")
        throw new AppError("Veo zuerst unter Provider & Konten verbinden.");
      const cost = videoCost(v.duration, Number(connection.rate_usd_second));
      if (
        d.connection_version !== connection.version ||
        d.approved_cost_usd !== cost
      )
        throw new AppError(
          "Tarif oder Verbindung geändert. Kostenfreigabe erneut prüfen.",
          409,
        );
      const sums = await one(
        "SELECT coalesce(sum(amount_usd) FILTER(WHERE created_at>=date_trunc('day',now() AT TIME ZONE $2) AT TIME ZONE $2),0) daily,coalesce(sum(amount_usd) FILTER(WHERE created_at>=date_trunc('month',now() AT TIME ZONE $2) AT TIME ZONE $2),0) monthly FROM video_cost_reservations WHERE user_id=$1 AND state<>'released'",
        [user, settings.timezone],
        c,
      );
      const units = (value: unknown) => Math.round(Number(value) * 10000);
      if (
        units(sums!.daily) + units(cost) > units(connection.daily_limit_usd) ||
        units(sums!.monthly) + units(cost) > units(connection.monthly_limit_usd)
      )
        throw new AppError("Veo-Kostenbudget würde überschritten.", 409);
      const id = randomUUID();
      const job = await enqueue(
        user,
        v.artist_id,
        "veo_generate",
        { generation_id: id },
        key,
        c,
      );
      await c.query(
        "UPDATE jobs SET side_effect='external',max_attempts=1 WHERE id=$1",
        [job.id],
      );
      await c.query(
        "INSERT INTO video_generations(id,user_id,artist_id,song_id,reference_asset_id,reference_snapshot,name,prompt,negative_prompt,model,duration,estimated_cost_usd,job_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        [
          id,
          user,
          v.artist_id,
          v.song_id,
          reference.id,
          JSON.stringify({
            id: reference.id,
            sha256: reference.sha256,
            storage_key: reference.storage_key,
          }),
          v.name,
          v.prompt,
          v.negative_prompt,
          connection.model,
          v.duration,
          cost,
          job.id,
        ],
      );
      await c.query(
        "INSERT INTO video_cost_reservations(id,user_id,generation_id,amount_usd) VALUES($1,$2,$3,$4)",
        [randomUUID(), user, id, cost],
      );
      await audit(
        user,
        "veo.approved",
        id,
        {
          model: connection.model,
          estimated_cost_usd: cost,
          rights_confirmed: true,
          reference_hash: reference.sha256,
        },
        c,
      );
      return { id, job_id: job.id };
    });
  }
  if (action === "veo_sync" || action === "veo_reconcile")
    return transaction(async (c) => {
      await lockedSettings(user, c);
      const order = await one(
        "SELECT * FROM video_generations WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [z.uuid().parse(d.id), user],
        c,
      );
      if (!order) throw new AppError("Videoauftrag nicht gefunden.", 404);
      if (order.state === "succeeded") return { id: order.id };
      if (action === "veo_reconcile") {
        if (order.state !== "unknown_external_state" || order.operation_name)
          throw new AppError("Auftrag benötigt keine externe Zuordnung.");
        const name = operationName.parse(d.operation_name);
        if (!name.startsWith("models/" + order.model + "/"))
          throw new AppError("Auftragskennung gehört zu anderem Modell.");
        await c.query(
          "UPDATE video_generations SET operation_name=$2 WHERE id=$1",
          [order.id, name],
        );
        order.operation_name = name;
        await audit(
          user,
          "veo.operation_manually_assigned",
          order.id,
          { operation_name: name },
          c,
        );
      }
      if (!order.operation_name)
        throw new AppError(
          "Externe Auftragskennung fehlt. Bei Google klären; keine zweite Generation starten.",
        );
      const active = await one(
        "SELECT id FROM jobs WHERE kind='veo_sync' AND input->>'generation_id'=$1 AND state IN ('queued','running')",
        [order.id],
        c,
      );
      if (active) return active;
      await c.query(
        "UPDATE video_generations SET state='waiting_for_provider',error=NULL,poll_failures=0,poll_until=now()+interval '2 hours',next_poll_at=now()+interval '20 seconds' WHERE id=$1",
        [order.id],
      );
      return enqueue(
        user,
        order.artist_id,
        "veo_sync",
        { generation_id: order.id },
        randomUUID(),
        c,
      );
    });
  throw new AppError("Unbekannte Veo-Aktion.");
}

export async function queueVideoPolls() {
  // A crashed external submit is never repeated; known operations remain pollable.
  await query(
    "UPDATE video_generations v SET state=CASE WHEN v.operation_name IS NOT NULL THEN 'waiting_for_provider' WHEN v.submitted_at IS NOT NULL THEN 'unknown_external_state' WHEN j.state='cancelled' THEN 'cancelled' ELSE 'failed' END,error='Übermittlung unterbrochen; externen Status prüfen.',next_poll_at=now() FROM jobs j WHERE j.id=v.job_id AND v.state IN ('queued','submitting') AND j.state IN ('cancelled','failed','unknown_external_state')",
  );
  await query(
    "UPDATE video_cost_reservations r SET state='released' FROM video_generations v WHERE v.id=r.generation_id AND v.submitted_at IS NULL AND v.state IN ('cancelled','failed')",
  );
  await query(
    "UPDATE video_generations SET state='waiting_for_input',error='Automatische Abfrage nach zwei Stunden angehalten. Vorhandenen Auftrag erneut abfragen; keine neue Generation nötig.' WHERE state='waiting_for_provider' AND poll_until<now() AND next_poll_at<=now()",
  );
  for (const item of await query(
    "SELECT v.id,v.user_id FROM video_generations v JOIN settings s ON s.user_id=v.user_id WHERE v.state='waiting_for_provider' AND v.operation_name IS NOT NULL AND v.next_poll_at<=now() AND NOT s.emergency_stop LIMIT 10",
  )) {
    await transaction(async (c) => {
      await lockedSettings(item.user_id, c);
      const row = await one(
        "SELECT * FROM video_generations WHERE id=$1 AND state='waiting_for_provider' AND next_poll_at<=now() FOR UPDATE",
        [item.id],
        c,
      );
      if (
        !row ||
        (await one(
          "SELECT id FROM jobs WHERE kind='veo_sync' AND input->>'generation_id'=$1 AND state IN ('queued','running')",
          [item.id],
          c,
        ))
      )
        return;
      await enqueue(
        row.user_id,
        row.artist_id,
        "veo_sync",
        { generation_id: row.id },
        randomUUID(),
        c,
      );
      await c.query(
        "UPDATE video_generations SET next_poll_at=now()+interval '20 seconds',poll_failures=0 WHERE id=$1",
        [row.id],
      );
    });
  }
}
export async function runVideoJob(
  job: any,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
  downloader?: (uri: string, signal: AbortSignal) => Promise<Buffer>,
) {
  const order = await one(
    "SELECT * FROM video_generations WHERE id=$1 AND user_id=$2",
    [job.input.generation_id, job.user_id],
  );
  if (!order) throw new VideoJobError("Videoauftrag nicht gefunden.", "failed");
  if (order.asset_id)
    return { result: { asset_id: order.asset_id }, usage: null };
  const connection = await one(
    "SELECT * FROM video_connections WHERE user_id=$1",
    [job.user_id],
  );
  if (!connection) throw new VideoJobError("Veo-Verbindung fehlt.", "failed");
  const provider = new VeoProvider(
    decrypt(connection.encrypted_key),
    transport,
  );
  if (job.kind === "veo_generate") {
    if (order.operation_name)
      return { result: { operation_name: order.operation_name }, usage: null };
    if (order.submitted_at)
      throw new VideoJobError(
        "Übermittlung bereits begonnen. Externen Status klären.",
        "unknown_external_state",
      );
    let submitted = false;
    try {
      const currentReference = await one(
        "SELECT rights_status,sha256 FROM assets WHERE id=$1 AND artist_id=$2",
        [order.reference_asset_id, order.artist_id],
      );
      if (
        !currentReference ||
        currentReference.rights_status === "disputed" ||
        currentReference.sha256 !== order.reference_snapshot.sha256
      )
        throw new VeoError(
          "Startbild fehlt, wurde verändert oder ist inzwischen gesperrt.",
          true,
        );
      const reference = await storage.get(order.reference_snapshot.storage_key);
      if (hash(reference) !== order.reference_snapshot.sha256)
        throw new VeoError(
          "Startbild wurde verändert. Auftrag erneut prüfen.",
          true,
        );
      const image = await sharp(reference, { limitInputPixels: 40000000 })
        .rotate()
        .resize(720, 1280, { fit: "cover" })
        .jpeg({ quality: 92 })
        .toBuffer();
      await transaction(async (c) => {
        const settings = await lockedSettings(job.user_id, c);
        const current = await one(
          "SELECT cancelled_at FROM jobs WHERE id=$1 FOR UPDATE",
          [job.id],
          c,
        );
        if (settings.emergency_stop || current?.cancelled_at || signal.aborted)
          throw new VeoError("Übermittlung vor dem Start angehalten.", true);
        const row = await one(
          "UPDATE video_generations SET state='submitting',submitted_at=now() WHERE id=$1 AND submitted_at IS NULL RETURNING id",
          [order.id],
          c,
        );
        if (!row)
          throw new VideoJobError(
            "Übermittlung bereits begonnen.",
            "unknown_external_state",
          );
      });
      submitted = true;
      const name = await provider.start(order as any, image, signal);
      await transaction(async (c) => {
        await c.query(
          "UPDATE video_generations SET operation_name=$2,state='waiting_for_provider',next_poll_at=now(),poll_until=now()+interval '2 hours',error=NULL WHERE id=$1",
          [order.id, name],
        );
        await c.query(
          "UPDATE video_cost_reservations SET state='consumed' WHERE generation_id=$1",
          [order.id],
        );
      });
      return {
        result: { operation_name: name, state: "waiting_for_provider" },
        usage: null,
      };
    } catch (e) {
      if (e instanceof VideoJobError) throw e;
      const definite = !submitted || (e instanceof VeoError && e.definitive),
        state = definite ? "failed" : "unknown_external_state";
      const message =
        e instanceof VeoError
          ? e.message
          : "Vorbereitung oder Übermittlung des Videoauftrags fehlgeschlagen.";
      await query(
        "UPDATE video_generations SET state=$2,error=$3 WHERE id=$1",
        [order.id, state, message],
      );
      await query(
        "UPDATE video_cost_reservations SET state=$2 WHERE generation_id=$1",
        [order.id, definite ? "released" : "reserved"],
      );
      throw new VideoJobError(message, state);
    }
  }
  try {
    if (!order.operation_name) throw new Error("Auftragskennung fehlt.");
    const status = await provider.status(order.operation_name, signal);
    if (status.state === "failed") {
      await query(
        "UPDATE video_generations SET state='failed',error=$2,finished_at=now() WHERE id=$1",
        [order.id, status.error],
      );
      await query(
        "UPDATE workflows SET state='failed' WHERE id=(SELECT workflow_id FROM jobs WHERE id=$1)",
        [order.job_id],
      );
      // Keep the reservation until provider billing is known; never assume a refund.
      return { result: status, usage: null };
    }
    if (status.state === "waiting_for_provider") {
      await query(
        "UPDATE video_generations SET next_poll_at=now()+interval '20 seconds',poll_failures=0 WHERE id=$1",
        [order.id],
      );
      return { result: status, usage: null };
    }
    const bytes = downloader
      ? await downloader(status.uri, signal)
      : await provider.download(status.uri, signal);
    const uploaded = await saveUpload("Veo-" + order.id + ".mp4", bytes);
    let stored = false;
    try {
      if (uploaded.kind !== "video" || uploaded.mime !== "video/mp4")
        throw new Error("Veo-Datei ist kein lesbares MP4-Video.");
      const assetId = await transaction(async (c) => {
        const settings = await lockedSettings(job.user_id, c);
        const latest = await one(
          "SELECT asset_id FROM video_generations WHERE id=$1 FOR UPDATE",
          [order.id],
          c,
        );
        if (latest?.asset_id) return latest.asset_id;
        const current = await one(
          "SELECT cancelled_at FROM jobs WHERE id=$1",
          [job.id],
          c,
        );
        if (settings.emergency_stop || signal.aborted || current?.cancelled_at)
          throw new Error(
            "Import angehalten. Vorhandenen Auftrag später abfragen.",
          );
        const used = await one(
          "SELECT coalesce(sum(x.bytes),0) bytes FROM assets x JOIN artists a ON a.id=x.artist_id WHERE a.user_id=$1",
          [job.user_id],
          c,
        );
        if (
          Number(used!.bytes) + uploaded.bytes >
          settings.storage_limit_mb * 1024 * 1024
        )
          throw new Error(
            "Speicherlimit erreicht. Platz schaffen und erneut abfragen.",
          );
        const id = randomUUID();
        await c.query(
          "INSERT INTO assets(id,artist_id,song_id,parent_id,kind,name,storage_key,mime,bytes,sha256,metadata,origin) VALUES($1,$2,$3,$4,'video',$5,$6,$7,$8,$9,$10,'google_veo')",
          [
            id,
            order.artist_id,
            order.song_id,
            order.reference_asset_id,
            order.name + ".mp4",
            uploaded.storage_key,
            uploaded.mime,
            uploaded.bytes,
            uploaded.sha256,
            JSON.stringify({
              ...uploaded.metadata,
              generation_id: order.id,
              model: order.model,
              prompt: order.prompt,
              negative_prompt: order.negative_prompt,
              reference: order.reference_snapshot,
              operation_name: order.operation_name,
              estimated_cost_usd: order.estimated_cost_usd,
              audio_use:
                "Szenenton wird im Musikvideo durch die gewählte Suno-Aufnahme ersetzt.",
              ai_generated: true,
            }),
          ],
        );
        await c.query(
          "UPDATE video_generations SET state='succeeded',asset_id=$2,error=NULL,finished_at=now() WHERE id=$1",
          [order.id, id],
        );
        await c.query(
          "UPDATE workflows SET state='succeeded' WHERE id=(SELECT workflow_id FROM jobs WHERE id=$1)",
          [order.job_id],
        );
        await c.query(
          "UPDATE video_connections SET live_tested_at=now() WHERE user_id=$1",
          [job.user_id],
        );
        await enqueue(
          job.user_id,
          order.artist_id,
          "analyze_asset",
          { asset_id: id },
          "veo-cover-" + order.id,
          c,
        );
        await audit(
          job.user_id,
          "veo.asset_imported",
          id,
          { generation_id: order.id },
          c,
        );
        return id;
      });
      stored =
        (await one("SELECT storage_key FROM assets WHERE id=$1", [assetId]))
          ?.storage_key === uploaded.storage_key;
      return { result: { asset_id: assetId }, usage: null };
    } finally {
      if (!stored) await storage.remove(uploaded.storage_key);
    }
  } catch (e) {
    const message =
      e instanceof VeoError
        ? e.message
        : e instanceof z.ZodError
          ? "Ungültige Veo-Antwort. Vorhandenen Auftrag erneut prüfen."
          : (e as Error).message;
    await query(
      "UPDATE video_generations SET poll_failures=poll_failures+1,state=CASE WHEN poll_failures>=4 THEN 'waiting_for_input' ELSE 'waiting_for_provider' END,error=$2,next_poll_at=now()+interval '30 seconds'*power(2,least(poll_failures,5)) WHERE id=$1 AND state<>'succeeded'",
      [order.id, message],
    );
    throw new Error(message);
  }
}
