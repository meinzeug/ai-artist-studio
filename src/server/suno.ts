import { z } from "zod";
import { randomUUID } from "node:crypto";
import { one, query, transaction } from "./db";
import { AppError, own, audit, encrypt, decrypt } from "./security";
import { enqueue } from "./jobs";
import { saveUpload, storage } from "./storage";
import { downloadAudio } from "./remote-media";
import {
  SunoApiClient,
  SunoApiError,
  generationRequest,
  sunoModel,
  sunoOptions,
} from "../providers/suno-api";
export class SunoJobError extends Error {
  constructor(
    message: string,
    public jobState: "failed" | "unknown_external_state",
  ) {
    super(message);
  }
}
export async function musicConnection(user: string) {
  return (
    (await one(
      "SELECT state,model,callback_url,credits_per_generation,daily_credit_limit,monthly_credit_limit,remaining_credits,checked_at,error,version FROM music_connections WHERE user_id=$1",
      [user],
    )) ?? null
  );
}
function callbackUrl(value: string) {
  if (!value) return "";
  const u = new URL(z.url().parse(value));
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.hostname === "localhost" ||
    u.hostname.endsWith(".localhost") ||
    !u.hostname.includes(".") ||
    /^\d+\./.test(u.hostname) ||
    u.hostname.includes(":")
  )
    throw new AppError(
      "Callback: öffentliche HTTPS-Adresse unter eigener Kontrolle erforderlich.",
    );
  return u.toString();
}
export async function sunoCommand(
  user: string,
  action: string,
  d: Record<string, any>,
) {
  if (action === "suno_connect") {
    const v = z
      .object({
        api_key: z.string().trim().max(2000).optional(),
        version: z.number().int().nonnegative().default(0),
        model: sunoModel.default("V6"),
        callback_url: z.string().default(""),
        credits_per_generation: z
          .number()
          .positive()
          .max(1e6)
          .nullable()
          .default(null),
        daily_credit_limit: z.number().min(0).max(1e7).default(0),
        monthly_credit_limit: z.number().min(0).max(1e8).default(0),
      })
      .parse(d);
    const existing = await one(
      "SELECT * FROM music_connections WHERE user_id=$1",
      [user],
    );
    const key = v.api_key || (existing ? decrypt(existing.encrypted_key) : "");
    if (!key || /[\s\x00-\x1f]/.test(key))
      throw new AppError(
        "Bitte einen gültigen API-Schlüssel von SunoAPI.org eingeben.",
      );
    const callback = callbackUrl(v.callback_url);
    const credits = await new SunoApiClient(key).credits();
    await transaction(async (c) => {
      await c.query(
        "SELECT user_id FROM settings WHERE user_id=$1 FOR UPDATE",
        [user],
      );
      const current = await one(
        "SELECT version FROM music_connections WHERE user_id=$1",
        [user],
        c,
      );
      if ((current?.version ?? 0) !== v.version)
        throw new AppError(
          "Verbindung wurde inzwischen geändert. Bitte neu laden.",
          409,
        );
      await c.query(
        "INSERT INTO music_connections(user_id,encrypted_key,model,callback_url,credits_per_generation,daily_credit_limit,monthly_credit_limit,remaining_credits) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id) DO UPDATE SET encrypted_key=$2,model=$3,callback_url=$4,credits_per_generation=$5,daily_credit_limit=$6,monthly_credit_limit=$7,remaining_credits=$8,state='connected',error=NULL,checked_at=now(),version=music_connections.version+1",
        [
          user,
          encrypt(key),
          v.model,
          callback,
          v.credits_per_generation,
          v.daily_credit_limit,
          v.monthly_credit_limit,
          credits,
        ],
      );
      await audit(
        user,
        "sunoapi.connected",
        user,
        { provider: "sunoapi_org" },
        c,
      );
    });
    return { ok: true, credits };
  }
  if (action === "suno_check") {
    const connection = await one(
      "SELECT * FROM music_connections WHERE user_id=$1",
      [user],
    );
    if (!connection) throw new AppError("Zuerst API-Schlüssel verbinden.");
    try {
      const credits = await new SunoApiClient(
        decrypt(connection.encrypted_key),
      ).credits();
      await query(
        "UPDATE music_connections SET remaining_credits=$2,checked_at=now(),state='connected',error=NULL WHERE user_id=$1 AND version=$3",
        [user, credits, connection.version],
      );
      return { credits };
    } catch (e) {
      await query(
        "UPDATE music_connections SET state='error',error=$2,checked_at=now() WHERE user_id=$1 AND version=$3",
        [user, (e as Error).message, connection.version],
      );
      throw e;
    }
  }
  if (action === "suno_disconnect") {
    return transaction(async (c) => {
      await c.query(
        "SELECT user_id FROM settings WHERE user_id=$1 FOR UPDATE",
        [user],
      );
      if (
        await one(
          "SELECT m.id FROM music_orders m JOIN songs s ON s.id=m.song_id JOIN artists a ON a.id=s.artist_id WHERE a.user_id=$1 AND m.provider='sunoapi_org' AND m.state NOT IN ('succeeded','failed','cancelled') LIMIT 1",
          [user],
          c,
        )
      )
        throw new AppError(
          "Offene API-Aufträge zuerst abschließen oder externen Status klären.",
        );
      await c.query("DELETE FROM music_connections WHERE user_id=$1", [user]);
      await audit(user, "sunoapi.disconnected", user, {}, c);
      return { ok: true };
    });
  }
  if (action === "suno_generate") {
    const oid = z.uuid().parse(d.order_id);
    if (d.approved !== true)
      throw new AppError(
        "Creditverbrauch muss ausdrücklich freigegeben werden.",
      );
    return transaction(async (c) => {
      const settings = await one(
        "SELECT * FROM settings WHERE user_id=$1 FOR UPDATE",
        [user],
        c,
      );
      const order = await one(
        "SELECT m.*,s.artist_id FROM music_orders m JOIN songs s ON s.id=m.song_id JOIN artists a ON a.id=s.artist_id WHERE m.id=$1 AND a.user_id=$2 FOR UPDATE OF m",
        [oid, user],
        c,
      );
      if (!order) throw new AppError("Produktionsauftrag fehlt.", 404);
      if (order.provider === "sunoapi_org")
        return { id: order.job_id, order_id: oid, existing: true };
      if (
        order.state !== "waiting_for_input" ||
        (await one(
          "SELECT id FROM audio_variants WHERE order_id=$1 LIMIT 1",
          [oid],
          c,
        ))
      )
        throw new AppError(
          "Bereits produzierter Auftrag. Für eine neue Generation ein neues Produktionspaket anlegen.",
        );
      const connection = await one(
        "SELECT * FROM music_connections WHERE user_id=$1",
        [user],
        c,
      );
      if (!connection || connection.state !== "connected")
        throw new AppError(
          "SunoAPI.org zuerst in den Einstellungen verbinden.",
        );
      if (!connection.callback_url)
        throw new AppError(
          "Der Anbieter verlangt eine Callback-URL. Bitte in der API-Einrichtung ergänzen.",
        );
      const units = Number(connection.credits_per_generation);
      if (!units)
        throw new AppError(
          "Credits pro Auftrag sind unbekannt. Tarif und Creditbudgets zuerst eintragen.",
        );
      if (Number(d.approved_credits) !== units)
        throw new AppError(
          "Creditbetrag wurde geändert. Freigabe erneut prüfen.",
        );
      const spent = await one(
        "SELECT coalesce(sum(units) FILTER(WHERE created_at>=date_trunc('day',now() AT TIME ZONE $2) AT TIME ZONE $2),0) daily,coalesce(sum(units) FILTER(WHERE created_at>=date_trunc('month',now() AT TIME ZONE $2) AT TIME ZONE $2),0) monthly FROM music_credit_reservations WHERE user_id=$1 AND state<>'released'",
        [user, settings!.timezone],
        c,
      );
      if (
        Number(spent!.daily) + units > Number(connection.daily_credit_limit) ||
        Number(spent!.monthly) + units > Number(connection.monthly_credit_limit)
      )
        throw new AppError("Suno-Creditbudget würde überschritten.");
      const options = sunoOptions.parse({
        ...d.options,
        model: d.options?.model ?? connection.model,
      });
      const request = generationRequest(
        order.package,
        options,
        connection.callback_url,
      );
      const job = await enqueue(
        user,
        order.artist_id,
        "suno_generate",
        { order_id: oid },
        oid,
        c,
      );
      await c.query(
        "UPDATE jobs SET side_effect='external',max_attempts=1 WHERE id=$1",
        [job.id],
      );
      await c.query(
        "UPDATE music_orders SET provider='sunoapi_org',state='queued',job_id=$2,api_options=$3,error=NULL WHERE id=$1",
        [oid, job.id, JSON.stringify(request)],
      );
      await c.query(
        "INSERT INTO music_credit_reservations(id,user_id,order_id,units) VALUES($1,$2,$3,$4)",
        [randomUUID(), user, oid, units],
      );
      await audit(
        user,
        "sunoapi.production_approved",
        oid,
        { credits: units, model: options.model },
        c,
      );
      return { id: job.id, order_id: oid };
    });
  }
  if (action === "suno_resume") {
    const oid = z.uuid().parse(d.order_id);
    return transaction(async (c) => {
      await c.query(
        "SELECT user_id FROM settings WHERE user_id=$1 FOR UPDATE",
        [user],
      );
      const order = await one(
        "SELECT m.* FROM music_orders m JOIN songs s ON s.id=m.song_id JOIN artists a ON a.id=s.artist_id WHERE m.id=$1 AND a.user_id=$2 FOR UPDATE OF m",
        [oid, user],
        c,
      );
      if (!order || order.provider !== "sunoapi_org")
        throw new AppError("API-Auftrag fehlt.");
      if (order.state === "succeeded") return { ok: true };
      if (["queued", "submitting"].includes(order.state))
        throw new AppError("Übertragung läuft. Statusprüfung erst danach.");
      const external =
        order.external_id || z.string().trim().min(1).max(200).parse(d.task_id);
      await c.query(
        "UPDATE music_orders SET external_id=$2,state='waiting_for_provider',next_poll_at=now(),poll_failures=0,error=NULL WHERE id=$1",
        [oid, external],
      );
      await audit(
        user,
        "sunoapi.status_resumed",
        oid,
        { task_id: external },
        c,
      );
      return { ok: true };
    });
  }
  throw new AppError("Unbekannte Suno-Aktion.");
}
export async function queueMusicPolls() {
  const due = await query(
    "SELECT m.id,a.user_id,s.artist_id FROM music_orders m JOIN songs s ON s.id=m.song_id JOIN artists a ON a.id=s.artist_id WHERE m.provider='sunoapi_org' AND m.external_id IS NOT NULL AND m.state='waiting_for_provider' AND m.next_poll_at<=now() LIMIT 10",
  );
  for (const item of due)
    await transaction(async (c) => {
      const settings = await one(
        "SELECT emergency_stop FROM settings WHERE user_id=$1 FOR UPDATE",
        [item.user_id],
        c,
      );
      if (settings?.emergency_stop) return;
      const order = await one(
        "SELECT * FROM music_orders WHERE id=$1 AND state='waiting_for_provider' AND next_poll_at<=now() FOR UPDATE",
        [item.id],
        c,
      );
      if (!order) return;
      if (
        await one(
          "SELECT id FROM jobs WHERE kind='suno_sync' AND input->>'order_id'=$1 AND state IN ('queued','running') LIMIT 1",
          [order.id],
          c,
        )
      )
        return;
      await enqueue(
        item.user_id,
        item.artist_id,
        "suno_sync",
        { order_id: order.id },
        randomUUID(),
        c,
      );
      await c.query(
        "UPDATE music_orders SET next_poll_at=now()+interval '20 seconds',poll_sequence=poll_sequence+1 WHERE id=$1",
        [order.id],
      );
    });
}
export async function runSunoJob(
  job: any,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
  download: typeof downloadAudio = downloadAudio,
) {
  const order = await one(
    "SELECT m.*,s.artist_id,a.user_id FROM music_orders m JOIN songs s ON s.id=m.song_id JOIN artists a ON a.id=s.artist_id WHERE m.id=$1 AND a.user_id=$2",
    [job.input.order_id, job.user_id],
  );
  if (!order) throw new Error("Musikauftrag nicht gefunden.");
  const connection = await one(
    "SELECT * FROM music_connections WHERE user_id=$1",
    [job.user_id],
  );
  if (!connection) throw new Error("SunoAPI.org-Verbindung fehlt.");
  const client = new SunoApiClient(
    decrypt(connection.encrypted_key),
    transport,
  );
  if (job.kind === "suno_generate") {
    if (order.external_id)
      return { result: { task_id: order.external_id }, usage: null };
    if (order.submitted_at)
      throw new SunoJobError(
        "Übermittlung bereits begonnen. Externen Status klären; kein zweiter Auftrag.",
        "unknown_external_state",
      );
    let submitted = false;
    try {
      const credits = await client.credits(signal);
      await query(
        "UPDATE music_connections SET remaining_credits=$2,checked_at=now() WHERE user_id=$1",
        [job.user_id, credits],
      );
      const reservation = await one(
        "SELECT units FROM music_credit_reservations WHERE order_id=$1",
        [order.id],
      );
      if (!reservation || credits < Number(reservation.units))
        throw new SunoApiError(
          "Nicht genügend Credits für den freigegebenen Auftrag.",
          true,
        );
      await transaction(async (c) => {
        const settings = await one(
          "SELECT emergency_stop FROM settings WHERE user_id=$1 FOR UPDATE",
          [job.user_id],
          c,
        );
        const current = await one(
          "SELECT cancelled_at FROM jobs WHERE id=$1 FOR UPDATE",
          [job.id],
          c,
        );
        if (settings?.emergency_stop || current?.cancelled_at || signal.aborted)
          throw new SunoApiError(
            "Übermittlung angehalten. Es wurde kein Musikauftrag gesendet.",
            true,
          );
        const row = await one(
          "UPDATE music_orders SET state='submitting',submitted_at=now() WHERE id=$1 AND submitted_at IS NULL RETURNING id",
          [order.id],
          c,
        );
        if (!row)
          throw new SunoJobError(
            "Übermittlung bereits begonnen.",
            "unknown_external_state",
          );
      });
      submitted = true;
      const taskId = await client.generate(order.api_options, signal);
      await transaction(async (c) => {
        await c.query(
          "UPDATE music_orders SET external_id=$2,state='waiting_for_provider',next_poll_at=now(),error=NULL WHERE id=$1",
          [order.id, taskId],
        );
        await c.query(
          "UPDATE music_credit_reservations SET state='consumed' WHERE order_id=$1",
          [order.id],
        );
      });
      return {
        result: { task_id: taskId, state: "waiting_for_provider" },
        usage: null,
      };
    } catch (e) {
      if (e instanceof SunoJobError) throw e;
      const definite =
          !submitted || (e instanceof SunoApiError && e.definitive),
        state = definite ? "failed" : "unknown_external_state";
      const message =
        e instanceof z.ZodError
          ? "Ungültige Anbieterantwort. Externen Status klären."
          : (e as Error).message;
      await query("UPDATE music_orders SET state=$2,error=$3 WHERE id=$1", [
        order.id,
        state,
        message,
      ]);
      await query(
        "UPDATE music_credit_reservations SET state=$2 WHERE order_id=$1",
        [order.id, definite ? "released" : "reserved"],
      );
      throw new SunoJobError(message, state);
    }
  }
  try {
    if (!order.external_id) throw new Error("Externe Auftragskennung fehlt.");
    const status = await client.status(order.external_id, signal);
    await query("UPDATE music_orders SET provider_status=$2 WHERE id=$1", [
      order.id,
      status.status,
    ]);
    if (
      [
        "CREATE_TASK_FAILED",
        "GENERATE_AUDIO_FAILED",
        "SENSITIVE_WORD_ERROR",
      ].includes(status.status)
    ) {
      await query(
        "UPDATE music_orders SET state='failed',error=$2,finished_at=now() WHERE id=$1",
        [
          order.id,
          "Anbieterstatus: " +
            status.status +
            ". Creditabrechnung beim Anbieter prüfen.",
        ],
      );
      return {
        result: { state: "failed", provider_status: status.status },
        usage: null,
      };
    }
    if (
      status.status === "SUCCESS" ||
      (status.status === "CALLBACK_EXCEPTION" && status.tracks.length)
    ) {
      if (!status.tracks.length)
        throw new Error(
          "Abgeschlossener Auftrag enthält noch keine Audiodatei.",
        );
      for (const track of status.tracks) {
        if (
          await one(
            "SELECT id FROM audio_variants WHERE order_id=$1 AND external_id=$2",
            [order.id, track.id],
          )
        )
          continue;
        const bytes = await download(
          (track.audio_url || track.audioUrl)!,
          signal,
        );
        const uploaded = await saveUpload(
          "SunoAPI-" + randomUUID() + ".mp3",
          bytes,
        );
        if (uploaded.kind !== "audio") {
          await storage.remove(uploaded.storage_key);
          throw new Error("Anbieterdatei enthält keine reine Audiodatei.");
        }
        let stored = false;
        try {
          stored = !!(await transaction(async (c) => {
            const settings = await one(
              "SELECT * FROM settings WHERE user_id=$1 FOR UPDATE",
              [job.user_id],
              c,
            );
            if (settings!.emergency_stop || signal.aborted)
              throw new Error("Ergebnisimport angehalten.");
            if (
              await one(
                "SELECT id FROM audio_variants WHERE order_id=$1 AND external_id=$2",
                [order.id, track.id],
                c,
              )
            )
              return;
            const used = await one(
              "SELECT coalesce(sum(x.bytes),0) bytes FROM assets x JOIN artists a ON a.id=x.artist_id WHERE a.user_id=$1",
              [job.user_id],
              c,
            );
            if (
              Number(used!.bytes) + uploaded.bytes >
              settings!.storage_limit_mb * 1024 * 1024
            )
              throw new Error(
                "Speicherbudget erreicht. Platz schaffen und Statusabruf wiederholen.",
              );
            const aid = randomUUID();
            await c.query(
              "INSERT INTO assets(id,artist_id,song_id,kind,name,storage_key,mime,bytes,sha256,metadata,origin) VALUES($1,$2,$3,'audio',$4,$5,$6,$7,$8,$9,'sunoapi_org')",
              [
                aid,
                order.artist_id,
                order.song_id,
                (track.title || order.package.title).slice(0, 150) +
                  "." +
                  uploaded.storage_key.split(".").at(-1),
                uploaded.storage_key,
                uploaded.mime,
                uploaded.bytes,
                uploaded.sha256,
                JSON.stringify({
                  ...uploaded.metadata,
                  provider: "sunoapi_org",
                  task_id: order.external_id,
                  audio_id: track.id,
                }),
              ],
            );
            await c.query(
              "INSERT INTO audio_variants(id,song_id,asset_id,order_id,lyrics_version_id,label,external_id,generation_info,clip_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
              [
                randomUUID(),
                order.song_id,
                aid,
                order.id,
                order.lyrics_version_id,
                track.title || order.package.title,
                track.id,
                JSON.stringify({
                  provider: "sunoapi_org",
                  task_id: order.external_id,
                  model: track.model_name ?? order.api_options.model,
                  settings: order.api_options,
                  imported_at: new Date().toISOString(),
                }),
                Math.min(30, uploaded.metadata.duration),
              ],
            );
            await c.query(
              "INSERT INTO rights_records(id,asset_id,status,provider,input_origin,acquisition,terms_url,terms_date,notes) VALUES($1,$2,'unclear','SunoAPI.org',$3,'API-Ergebnisimport','https://sunoapi.org','2026-09-20','Rechte und Tarifnachweis vom Betreiber prüfen; keine automatische kommerzielle Freigabe.')",
              [
                randomUUID(),
                aid,
                "Eigener Produktionsauftrag " + order.production_number,
              ],
            );
            await enqueue(
              job.user_id,
              order.artist_id,
              "analyze_asset",
              { asset_id: aid },
              randomUUID(),
              c,
            );
            return true;
          }));
        } finally {
          if (!stored) await storage.remove(uploaded.storage_key);
        }
      }
      await transaction(async (c) => {
        await c.query(
          "UPDATE music_orders SET state='succeeded',error=NULL,finished_at=now(),poll_failures=0,next_poll_at=NULL WHERE id=$1",
          [order.id],
        );
        await c.query(
          "UPDATE music_credit_reservations SET state='consumed' WHERE order_id=$1",
          [order.id],
        );
        await c.query(
          "UPDATE workflows SET state='succeeded' WHERE id=(SELECT workflow_id FROM jobs WHERE id=$1)",
          [order.job_id],
        );
        await audit(
          job.user_id,
          "sunoapi.imported",
          order.id,
          { tracks: status.tracks.length },
          c,
        );
      });
      return {
        result: { state: "succeeded", tracks: status.tracks.length },
        usage: null,
      };
    }
    if (status.status === "CALLBACK_EXCEPTION")
      throw new Error(
        "Anbieter meldet Callback-Fehler ohne fertige Dateien. Im Anbieterkonto prüfen.",
      );
    if (
      order.submitted_at &&
      Date.now() - new Date(order.submitted_at).valueOf() > 86400000
    )
      throw new Error(
        "Auftrag wartet länger als 24 Stunden. Im Anbieterkonto prüfen.",
      );
    await query(
      "UPDATE music_orders SET state='waiting_for_provider',poll_failures=0,error=NULL,next_poll_at=now()+interval '20 seconds' WHERE id=$1",
      [order.id],
    );
    return {
      result: { state: "waiting_for_provider", provider_status: status.status },
      usage: null,
    };
  } catch (e) {
    const message =
      e instanceof z.ZodError
        ? "Statusantwort entspricht nicht dem dokumentierten Schema."
        : (e as Error).message;
    await query(
      "UPDATE music_orders SET poll_failures=poll_failures+1,error=$2,state=CASE WHEN poll_failures>=5 THEN 'waiting_for_input' ELSE 'waiting_for_provider' END,next_poll_at=now()+interval '20 seconds'*least(power(2,poll_failures),30) WHERE id=$1",
      [order.id, message],
    );
    throw new Error(message);
  }
}
