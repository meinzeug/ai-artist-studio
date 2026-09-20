import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { pool, one, query, transaction, type Client } from "./db";
import { AppError, ownArtist, own, audit, hash } from "./security";
import { enqueue } from "./jobs";
import { imageCommand, imageConnection } from "./image-generation";
import { musicConnection, sunoCommand } from "./suno";
import { postSnapshot, invalidate } from "./approval";
import {
  automaticArtistBrief,
  localProductionDay,
  nextProductionTime,
  automaticClipRange,
} from "../lib/automation";
import { artistSchema, timelineSchema } from "../lib/domain";
import { createMusicVideo } from "./music-video";
import { sceneCount } from "../lib/music-video";

export function automationKey(run: string, step: string, attempt = 1) {
  const hex = createHash("sha256")
    .update(run + ":" + step + ":" + attempt)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
async function task(
  run: any,
  kind: string,
  title: string,
  body: string,
  key = run.stage,
  postId: string | null = null,
  c?: Client,
) {
  await query(
    "INSERT INTO manual_tasks(id,user_id,artist_id,run_id,task_key,kind,title,body,post_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(run_id,task_key) DO UPDATE SET title=$7,body=$8,kind=$6,state='open',version=manual_tasks.version+1,completed_at=NULL WHERE manual_tasks.body<>EXCLUDED.body OR manual_tasks.kind<>EXCLUDED.kind OR manual_tasks.state<>'open'",
    [
      randomUUID(),
      run.user_id,
      run.artist_id,
      run.id,
      key,
      kind,
      title,
      body,
      postId,
    ],
    c,
  );
}
async function waitFor(run: any, kind: string, title: string, body: string) {
  await task(run, kind, title, body);
  await query(
    "UPDATE automation_runs SET state='waiting_for_input',error=$2,updated_at=now() WHERE id=$1",
    [run.id, body],
  );
}
async function advance(run: any, stage: string) {
  await transaction(async (c) => {
    await c.query(
      "UPDATE manual_tasks SET state='done',completed_at=now(),version=version+1 WHERE run_id=$1 AND task_key=$2 AND state='open'",
      [run.id, run.stage],
    );
    await c.query(
      "UPDATE automation_runs SET stage=$2,state='running',job_id=NULL,image_generation_id=NULL,attempt=1,error=NULL,updated_at=now() WHERE id=$1",
      [run.id, stage],
    );
  });
}
async function approvals(user: string, d: any, c: Client) {
  const image = await one(
    "SELECT provider,version,estimated_cost_usd FROM image_connections WHERE user_id=$1",
    [user],
    c,
  );
  const music = await one(
    "SELECT version,credits_per_generation FROM music_connections WHERE user_id=$1",
    [user],
    c,
  );
  if (
    d.image_version !== (image?.version ?? null) ||
    d.music_version !== (music?.version ?? null)
  )
    throw new AppError(
      "Provider oder Produktionsbudget inzwischen geändert. Vorschau neu öffnen.",
      409,
    );
  return { image, music };
}
export async function automationCommand(
  user: string,
  action: string,
  d: Record<string, any>,
  key: string,
) {
  if (action === "auto_create") {
    const brief = automaticArtistBrief.parse(d.brief ?? {});
    if (d.approved !== true)
      throw new AppError(
        "Tägliche Produktion innerhalb der angezeigten Grenzen bestätigen.",
      );
    return transaction(async (c) => {
      const settings = (await one(
        "SELECT * FROM settings WHERE user_id=$1 FOR UPDATE",
        [user],
        c,
      ))!;
      if (settings.emergency_stop) throw new AppError("Not-Aus aktiv.");
      const old = await one(
        "SELECT artist_id id FROM artist_automations WHERE user_id=$1 AND creation_key=$2",
        [user, key],
        c,
      );
      if (old) return old;
      const { image, music } = await approvals(user, d, c);
      const id = randomUUID(),
        runId = randomUUID();
      const a = artistSchema.parse({
        name: brief.name || "Neuer Artist · entsteht",
        genre: brief.genre,
        language: brief.language,
      });
      await c.query(
        "INSERT INTO artists(id,user_id,name,bio,language,market,genre,color,identity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          id,
          user,
          a.name,
          a.bio,
          a.language,
          a.market,
          a.genre,
          a.color,
          JSON.stringify(a.identity),
        ],
      );
      await c.query(
        "INSERT INTO identity_versions(id,artist_id,version,snapshot) VALUES($1,$2,1,$3)",
        [randomUUID(), id, JSON.stringify({ ...a, id, version: 1 })],
      );
      await c.query(
        "INSERT INTO artist_automations(artist_id,user_id,brief,timezone,next_run_at,approved_image_version,approved_music_version,creation_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          user,
          JSON.stringify(brief),
          settings.timezone,
          nextProductionTime(new Date(), settings.timezone),
          image?.version ?? null,
          music?.version ?? null,
          key,
        ],
      );
      await c.query(
        "INSERT INTO automation_runs(id,user_id,artist_id,local_day) VALUES($1,$2,$3,$4)",
        [runId, user, id, localProductionDay(new Date(), settings.timezone)],
      );
      const full = z.boolean().parse(d.full_music_video ?? true),
        count = sceneCount.parse(d.video_scene_count ?? 8);
      await c.query(
        "UPDATE artist_automations SET full_music_video=$2,video_scene_count=$3 WHERE artist_id=$1",
        [id, full, count],
      );
      await c.query(
        "UPDATE automation_runs SET full_music_video=$2,video_scene_count=$3 WHERE id=$1",
        [runId, full, count],
      );
      await audit(
        user,
        "automation.artist_created",
        id,
        {
          run_id: runId,
          daily: true,
          provider_approval: {
            image_version: image?.version ?? null,
            music_version: music?.version ?? null,
          },
        },
        c,
      );
      return { id, run_id: runId };
    });
  }
  if (action === "auto_start") {
    const v = z
      .object({
        artist_id: z.uuid(),
        version: z.number().int().positive(),
        approved: z.literal(true),
      })
      .parse(d);
    const artist = await ownArtist(user, v.artist_id);
    return transaction(async (c) => {
      const settings = (await one(
        "SELECT * FROM settings WHERE user_id=$1 FOR UPDATE",
        [user],
        c,
      ))!;
      if (settings.emergency_stop) throw new AppError("Not-Aus aktiv.");
      const old = await one(
        "SELECT id,artist_id FROM automation_runs WHERE user_id=$1 AND start_key=$2",
        [user, key],
        c,
      );
      if (old) {
        if (old.artist_id !== artist.id)
          throw new AppError(
            "Startkennung gehört zu einem anderen Artist.",
            409,
          );
        return { id: artist.id, run_id: old.id };
      }
      const policy = await one(
        "SELECT * FROM artist_automations WHERE artist_id=$1 FOR UPDATE",
        [artist.id],
        c,
      );
      if (!policy?.enabled || artist.archived)
        throw new AppError(
          "Zuerst die Automatik für diesen Artist aktivieren.",
        );
      if (policy.version !== v.version)
        throw new AppError(
          "Automatik inzwischen geändert. Vorschau neu öffnen.",
          409,
        );
      const { image, music } = await approvals(user, d, c);
      if (
        policy.approved_image_version !== (image?.version ?? null) ||
        policy.approved_music_version !== (music?.version ?? null)
      )
        throw new AppError(
          "Aktuelle Provider und Budgets zuerst in den Automatik-Einstellungen bestätigen.",
          409,
        );
      const active = await one(
        "SELECT id FROM automation_runs WHERE artist_id=$1 AND state IN ('running','waiting_for_input') LIMIT 1",
        [artist.id],
        c,
      );
      const film = await one(
        "SELECT id FROM music_video_productions WHERE artist_id=$1 AND state IN ('planning','images','rendering','blocked') LIMIT 1",
        [artist.id],
        c,
      );
      if (active || film)
        throw new AppError(
          "Die vorhandene Produktion zuerst abschließen oder ihre offene Aufgabe bearbeiten.",
          409,
        );
      const id = randomUUID();
      await c.query(
        "INSERT INTO automation_runs(id,user_id,artist_id,local_day,start_kind,start_key,stage,identity_ready,full_music_video,video_scene_count) VALUES($1,$2,$3,$4,'manual',$5,$6,true,$7,$8)",
        [
          id,
          user,
          artist.id,
          localProductionDay(new Date(), policy.timezone),
          key,
          policy.reference_asset_id ? "song" : "portrait",
          policy.full_music_video,
          policy.video_scene_count,
        ],
      );
      await audit(
        user,
        "automation.manual_start",
        artist.id,
        {
          run_id: id,
          image_version: image?.version ?? null,
          music_version: music?.version ?? null,
          full_music_video: policy.full_music_video,
          video_scene_count: policy.video_scene_count,
        },
        c,
      );
      return { id: artist.id, run_id: id };
    });
  }
  if (action === "auto_settings") {
    const v = z
      .object({
        artist_id: z.uuid(),
        version: z.number().int().nonnegative(),
        enabled: z.boolean(),
        daily_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        music_mode: z.enum(["auto", "manual"]),
        approved: z.literal(true),
      })
      .parse(d);
    const artist = await ownArtist(user, v.artist_id);
    return transaction(async (c) => {
      const settings = (await one(
        "SELECT * FROM settings WHERE user_id=$1 FOR UPDATE",
        [user],
        c,
      ))!;
      const existing = await one(
        "SELECT * FROM artist_automations WHERE artist_id=$1 FOR UPDATE",
        [artist.id],
        c,
      );
      if ((existing?.version ?? 0) !== v.version)
        throw new AppError("Automatik inzwischen geändert. Neu laden.", 409);
      const { image, music } = await approvals(user, d, c);
      await c.query(
        "INSERT INTO artist_automations(artist_id,user_id,enabled,brief,daily_time,timezone,next_run_at,music_mode,approved_image_version,approved_music_version) VALUES($1,$2,$3,$4,$5,$6,now(),$7,$8,$9) ON CONFLICT(artist_id) DO UPDATE SET enabled=$3,daily_time=$5,timezone=$6,music_mode=$7,approved_image_version=$8,approved_music_version=$9,next_run_at=$10::timestamptz,version=artist_automations.version+1",
        [
          artist.id,
          user,
          v.enabled,
          JSON.stringify({
            name: artist.name,
            genre: artist.genre,
            appearance: artist.identity?.visual ?? "",
            language: artist.language,
          }),
          v.daily_time,
          settings.timezone,
          v.music_mode,
          image?.version ?? null,
          music?.version ?? null,
          existing &&
          (existing.daily_time !== v.daily_time ||
            existing.timezone !== settings.timezone)
            ? nextProductionTime(new Date(), settings.timezone, v.daily_time)
            : (existing?.next_run_at ?? new Date()),
        ],
      );
      // New automations preserve an existing artist and approved portrait.
      await c.query(
        "UPDATE artist_automations SET full_music_video=$2,video_scene_count=$3 WHERE artist_id=$1",
        [
          artist.id,
          z
            .boolean()
            .parse(d.full_music_video ?? existing?.full_music_video ?? true),
          sceneCount.parse(
            d.video_scene_count ?? existing?.video_scene_count ?? 8,
          ),
        ],
      );
      if (!existing) {
        const ref = await one(
          "SELECT asset_id FROM artist_references WHERE artist_id=$1 AND type='portrait' AND state='approved' ORDER BY created_at DESC LIMIT 1",
          [artist.id],
          c,
        );
        if (ref)
          await c.query(
            "UPDATE artist_automations SET reference_asset_id=$2 WHERE artist_id=$1",
            [artist.id, ref.asset_id],
          );
      }
      if (v.enabled) {
        // An explicit renewed approval can continue an unsent manual handoff.
        // Orders that already reached Suno keep their provider state untouched.
        await c.query(
          "UPDATE automation_runs r SET music_mode=NULL,state='running',error=NULL WHERE r.artist_id=$1 AND r.stage='music' AND r.state='waiting_for_input' AND EXISTS(SELECT 1 FROM music_orders m WHERE m.id=r.music_order_id AND m.provider='manual')",
          [artist.id],
        );
        await c.query(
          "UPDATE automation_runs SET state='running',error=NULL WHERE artist_id=$1 AND stage IN ('portrait','artwork') AND state='waiting_for_input' AND job_id IS NULL AND image_generation_id IS NULL",
          [artist.id],
        );
      }
      await audit(
        user,
        "automation.settings",
        artist.id,
        {
          enabled: v.enabled,
          daily_time: v.daily_time,
          music_mode: v.music_mode,
        },
        c,
      );
      return { ok: true };
    });
  }
  if (action === "auto_pause") {
    const artist = await ownArtist(user, z.uuid().parse(d.artist_id));
    const row = await one(
      "UPDATE artist_automations SET enabled=$3,version=version+1 WHERE artist_id=$1 AND version=$2 RETURNING *",
      [
        artist.id,
        z.number().int().positive().parse(d.version),
        z.boolean().parse(d.enabled),
      ],
    );
    if (!row) throw new AppError("Automatik inzwischen geändert.", 409);
    await audit(user, "automation.paused", artist.id, { enabled: row.enabled });
    return { ok: true };
  }
  if (action === "auto_retry") {
    const run = await one(
      "SELECT * FROM automation_runs WHERE id=$1 AND user_id=$2",
      [z.uuid().parse(d.run_id), user],
    );
    if (!run || run.state !== "waiting_for_input")
      throw new AppError("Keine wartende Produktion gefunden.");
    if (d.approved !== true)
      throw new AppError(
        "Schritt und möglichen Kontingentverbrauch erneut freigeben.",
      );
    const jobs = await query(
      "SELECT * FROM jobs WHERE id=$1 OR id IN (SELECT job_id FROM automation_clips WHERE run_id=$2)",
      [run.job_id, run.id],
    );
    if (
      jobs.some((j) =>
        ["queued", "running", "unknown_external_state"].includes(j.state),
      )
    )
      throw new AppError(
        "Laufende oder unklare Aufträge zuerst in Jobs bzw. beim Provider klären. Kein blinder Neuauftrag.",
      );
    if (run.image_generation_id) {
      const im = await one("SELECT state FROM image_generations WHERE id=$1", [
        run.image_generation_id,
      ]);
      if (im && !["succeeded", "failed", "cancelled"].includes(im.state))
        throw new AppError(
          "Bildauftrag zuerst in der Medienbibliothek klären.",
        );
    }
    if (run.stage === "music" && run.music_order_id) {
      const m = await one("SELECT * FROM music_orders WHERE id=$1", [
        run.music_order_id,
      ]);
      if (m?.provider === "sunoapi_org" && m.state !== "succeeded")
        throw new AppError(
          "Suno-Auftrag direkt in Musikproduktion klären oder Audio importieren; kein neuer API-Auftrag.",
        );
    }
    await transaction(async (c) => {
      await c.query(
        "SELECT user_id FROM settings WHERE user_id=$1 FOR UPDATE",
        [user],
      );
      const current = await one(
        "SELECT state FROM automation_runs WHERE id=$1 FOR UPDATE",
        [run.id],
        c,
      );
      if (current?.state !== "waiting_for_input") return;
      await c.query(
        "UPDATE automation_runs SET state='running',attempt=attempt+1,job_id=NULL,image_generation_id=NULL,error=NULL WHERE id=$1 AND state='waiting_for_input'",
        [run.id],
      );
      if (run.stage === "video") {
        for (const j of jobs)
          if (
            ["failed", "cancelled"].includes(j.state) &&
            j.side_effect === "local"
          ) {
            // Retry the same render snapshot, avoiding a second project/post.
            const replacement = await enqueue(
              user,
              run.artist_id,
              "render_video",
              j.input,
              automationKey(run.id, j.id + "retry", run.attempt + 1),
              c,
            );
            await c.query(
              "UPDATE automation_clips SET job_id=$2 WHERE run_id=$1 AND job_id=$3",
              [run.id, replacement.id, j.id],
            );
          }
      }
      await c.query(
        "UPDATE manual_tasks SET state='done',completed_at=now(),version=version+1 WHERE run_id=$1 AND task_key=$2",
        [run.id, run.stage],
      );
      await audit(
        user,
        "automation.step_reapproved",
        run.id,
        { stage: run.stage },
        c,
      );
    });
    return { ok: true };
  }
  if (action === "auto_use_portrait") {
    const run = await one(
      "SELECT * FROM automation_runs WHERE id=$1 AND user_id=$2",
      [z.uuid().parse(d.run_id), user],
    );
    const asset = await own(user, "assets", z.uuid().parse(d.asset_id));
    if (
      !run ||
      run.stage !== "portrait" ||
      asset.artist_id !== run.artist_id ||
      asset.kind !== "image" ||
      asset.rights_status === "disputed"
    )
      throw new AppError("Passendes Künstlerbild erforderlich.");
    if (run.image_generation_id) {
      const generation = await one(
        "SELECT state FROM image_generations WHERE id=$1",
        [run.image_generation_id],
      );
      if (
        generation &&
        !["failed", "cancelled", "succeeded"].includes(generation.state)
      )
        throw new AppError(
          "Laufenden oder unklaren Bildauftrag zuerst klären.",
        );
    }
    await setPortrait(run, asset.id);
    await advance(run, "song");
    return { ok: true };
  }
  if (action === "auto_publish") {
    const v = z
      .object({
        task_id: z.uuid(),
        post_version: z.number().int().positive(),
        url: z.url(),
        published_at: z.iso.datetime({ offset: true }),
        rights_note: z.string().trim().min(10).max(2000),
        confirmed: z.literal(true),
      })
      .parse(d);
    const u = new URL(v.url);
    if (
      u.protocol !== "https:" ||
      !["www.tiktok.com", "tiktok.com", "vm.tiktok.com"].includes(u.hostname) ||
      u.username ||
      u.password
    )
      throw new AppError("Einen gültigen HTTPS-TikTok-Link eintragen.");
    return transaction(async (c) => {
      const t = await one(
        "SELECT * FROM manual_tasks WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [v.task_id, user],
        c,
      );
      if (!t || t.kind !== "publish_video" || !t.post_id)
        throw new AppError("Veröffentlichungsaufgabe fehlt.");
      if (t.state === "done") return { ok: true, existing: true };
      const post = await own(user, "posts", t.post_id, c);
      await c.query("SELECT id FROM posts WHERE id=$1 FOR UPDATE", [post.id]);
      const latest = (await one(
        "SELECT * FROM posts WHERE id=$1",
        [post.id],
        c,
      ))!;
      if (latest.version !== v.post_version)
        throw new AppError(
          "Beitragsinhalt geändert. Vorschau neu prüfen.",
          409,
        );
      const asset = await own(user, "assets", post.asset_id, c);
      if (asset.rights_status === "disputed")
        throw new AppError("Video ist als streitig gesperrt.");
      const inputs = await one(
        "SELECT snapshot FROM renders WHERE asset_id=$1 ORDER BY created_at DESC LIMIT 1",
        [asset.id],
        c,
      );
      const sourceIds = inputs
        ? [
            inputs.snapshot.audio?.id,
            ...inputs.snapshot.assets.map((a: any) => a.id),
          ].filter(Boolean)
        : [];
      if (
        sourceIds.length &&
        (await one(
          "SELECT id FROM assets WHERE id=ANY($1::uuid[]) AND rights_status='disputed' LIMIT 1",
          [sourceIds],
          c,
        ))
      )
        throw new AppError(
          "Ein verwendetes Bild oder Audio ist als streitig gesperrt.",
        );
      // The operator records their own review; AI never grants rights or posts externally.
      await c.query(
        "UPDATE assets SET rights_status='operator_approved' WHERE id=$1",
        [asset.id],
      );
      await c.query(
        "INSERT INTO rights_records(id,asset_id,status,provider,input_origin,acquisition,notes) VALUES($1,$2,'operator_approved','Betreiberprüfung','Eigene Prüfung der Bild- und Musikrechte','Lokales FFmpeg-Rendering',$3)",
        [randomUUID(), asset.id, v.rights_note],
      );
      await c.query(
        "UPDATE posts SET rights_note=$2,version=version+1 WHERE id=$1",
        [post.id, v.rights_note],
      );
      await invalidate(post.id, c);
      const snapshot = await postSnapshot(post.id, c),
        approval = randomUUID();
      await c.query(
        "INSERT INTO approvals(id,post_id,snapshot,snapshot_hash,user_id) VALUES($1,$2,$3,$4,$5)",
        [
          approval,
          post.id,
          JSON.stringify(snapshot),
          hash(JSON.stringify(snapshot)),
          user,
        ],
      );
      await c.query(
        "INSERT INTO publication_attempts(id,post_id,approval_id,idempotency_key,state,details) VALUES($1,$2,$3,$4,'manually_confirmed',$5) ON CONFLICT(idempotency_key) DO NOTHING",
        [
          randomUUID(),
          post.id,
          approval,
          "manual:" + post.id,
          JSON.stringify({ url: v.url, published_at: v.published_at }),
        ],
      );
      await c.query(
        "UPDATE posts SET status='published',published_url=$2,published_at=$3,verification='manual_unverified' WHERE id=$1",
        [post.id, v.url, v.published_at],
      );
      await c.query(
        "UPDATE manual_tasks SET state='done',completed_at=now(),version=version+1 WHERE id=$1",
        [t.id],
      );
      await audit(
        user,
        "publication.manually_confirmed",
        post.id,
        { url: v.url, task_id: t.id },
        c,
      );
      return { ok: true };
    });
  }
  throw new AppError("Unbekannte Automatikaktion.");
}
async function setPortrait(run: any, assetId: string) {
  await transaction(async (c) => {
    const artist = (await one(
      "SELECT version FROM artists WHERE id=$1",
      [run.artist_id],
      c,
    ))!;
    if (
      !(await one(
        "SELECT id FROM artist_references WHERE artist_id=$1 AND asset_id=$2 AND type='portrait'",
        [run.artist_id, assetId],
        c,
      ))
    )
      await c.query(
        "INSERT INTO artist_references(id,artist_id,asset_id,type,notes,state,identity_version) VALUES($1,$2,$3,'portrait','Von der beauftragten Automatik als feste visuelle Referenz gesetzt. Keine automatische Rechtefreigabe.','approved',$4)",
        [randomUUID(), run.artist_id, assetId, artist.version],
      );
    await c.query(
      "UPDATE artist_automations SET reference_asset_id=$2 WHERE artist_id=$1",
      [run.artist_id, assetId],
    );
  });
}
async function imageFor(run: any, policy: any, artist: any, prompt: string) {
  let connection = await imageConnection(run.user_id);
  if (!connection) {
    // Account login, never silently select a paid API provider.
    await imageCommand(
      run.user_id,
      "image_configure",
      { provider: "codex", version: 0, daily_limit: 10, monthly_limit: 100 },
      randomUUID(),
    );
    connection = await imageConnection(run.user_id);
    await query(
      "UPDATE artist_automations SET approved_image_version=$2 WHERE artist_id=$1",
      [run.artist_id, connection!.version],
    );
    policy.approved_image_version = connection!.version;
  }
  if (
    connection!.provider === "codex" &&
    policy.approved_image_version === null
  ) {
    await query(
      "UPDATE artist_automations SET approved_image_version=$2 WHERE artist_id=$1 AND approved_image_version IS NULL",
      [run.artist_id, connection!.version],
    );
    policy.approved_image_version = connection!.version;
  }
  if (connection!.provider === "manual")
    throw new AppError(
      "Bild-KI steht auf manuellem Import. Hauptporträt hochladen oder unter Einstellungen Codex verbinden.",
    );
  if (connection!.version !== policy.approved_image_version)
    throw new AppError(
      "Bildprovider/Budget geändert. Aktuelle Verbindung in den Automatik-Einstellungen erneut freigeben.",
    );
  const result: any = await imageCommand(
    run.user_id,
    "image_generate",
    {
      artist_id: artist.id,
      song_id: run.song_id,
      name:
        artist.name +
        (run.stage === "portrait" ? " – Hauptporträt" : " – Songszene"),
      prompt,
      aspect_ratio: "9:16",
      reference_asset_id:
        run.stage === "portrait" ? null : policy.reference_asset_id,
      connection_version: connection!.version,
      approved: true,
      rights_confirmed: true,
      approved_cost_usd:
        connection!.provider === "gemini_api"
          ? Number(connection!.estimated_cost_usd)
          : null,
    },
    automationKey(run.id, run.stage, run.attempt),
  );
  await query(
    "UPDATE automation_runs SET job_id=$2,image_generation_id=$3 WHERE id=$1",
    [run.id, result.job_id, result.id],
  );
}
async function advanceRun(run: any) {
  const policy = (await one(
    "SELECT * FROM artist_automations WHERE artist_id=$1",
    [run.artist_id],
  ))!;
  const artist = (await one("SELECT * FROM artists WHERE id=$1", [
    run.artist_id,
  ]))!;
  if (!policy.enabled || artist.archived) return;
  if (run.stage === "music_video") {
    let full = await one(
      "SELECT * FROM music_video_productions WHERE run_id=$1",
      [run.id],
    );
    if (!full) {
      const connection = await imageConnection(run.user_id);
      if (connection?.version !== policy.approved_image_version)
        throw new AppError(
          "Bildprovider/Budget geändert. Automatik-Einstellungen erneut bestätigen.",
        );
      full = await createMusicVideo(run.user_id, {
        run_id: run.id,
        scene_count: run.video_scene_count,
        approved: true,
        connection_version: connection?.version ?? null,
        approved_cost_usd:
          connection?.provider === "gemini_api"
            ? Number(connection.estimated_cost_usd) * run.video_scene_count
            : null,
      });
    }
    if (full.state === "ready") {
      const first = (await one(
        "SELECT asset_id FROM music_video_scenes WHERE production_id=$1 ORDER BY position LIMIT 1",
        [full.id],
      ))!;
      await query("UPDATE automation_runs SET scene_asset_id=$2 WHERE id=$1", [
        run.id,
        first.asset_id,
      ]);
      await advance(run, "video");
    }
    return;
  }
  if (run.stage === "identity") {
    if (run.identity_ready) {
      await advance(run, "portrait");
      return;
    }
    if (!run.job_id) {
      const j = await enqueue(
        run.user_id,
        run.artist_id,
        "auto_identity",
        { run_id: run.id },
        automationKey(run.id, "identity", run.attempt),
      );
      await query("UPDATE automation_runs SET job_id=$2 WHERE id=$1", [
        run.id,
        j.id,
      ]);
      return;
    }
  }
  if (run.stage === "portrait" || run.stage === "artwork") {
    if (run.stage === "portrait" && policy.reference_asset_id) {
      await advance(run, "song");
      return;
    }
    if (
      run.stage === "artwork" &&
      (await imageConnection(run.user_id))?.provider === "manual" &&
      policy.reference_asset_id
    ) {
      await query("UPDATE automation_runs SET scene_asset_id=$2 WHERE id=$1", [
        run.id,
        policy.reference_asset_id,
      ]);
      await advance(run, "video");
      return;
    }
    if (run.image_generation_id) {
      const generated = await one(
        "SELECT * FROM image_generations WHERE id=$1",
        [run.image_generation_id],
      );
      if (generated?.state === "succeeded" && generated.asset_id) {
        if (run.stage === "portrait")
          await setPortrait(run, generated.asset_id);
        else
          await query(
            "UPDATE automation_runs SET scene_asset_id=$2 WHERE id=$1",
            [run.id, generated.asset_id],
          );
        await advance(run, run.stage === "portrait" ? "song" : "video");
        return;
      }
      if (
        generated &&
        ["failed", "cancelled", "unknown_external_state"].includes(
          generated.state,
        )
      ) {
        await waitFor(
          run,
          "fix_production",
          "Bildproduktion benötigt Hilfe",
          generated.error ?? "Bildauftrag prüfen.",
        );
        return;
      }
    } else if (run.state === "running") {
      await imageFor(
        run,
        policy,
        artist,
        run.stage === "portrait"
          ? `Erstelle das verbindliche Hauptporträt dieses erwachsenen fiktiven Musikcharakters. Eigenständige Identität, klar erkennbares Gesicht, Oberkörper, kein Text. ${artist.identity.visual}. Charakteristische Merkmale: ${artist.identity.features}. Outfit: ${artist.identity.outfits}. Ausschlüsse: ${artist.identity.negativeVisual}`
          : run.creative_plan.scene_prompt,
      );
      return;
    }
  }
  if (run.stage === "song") {
    if (run.song_id) {
      await advance(run, "music");
      return;
    }
    if (!run.job_id) {
      const j = await enqueue(
        run.user_id,
        run.artist_id,
        "auto_song",
        { run_id: run.id },
        automationKey(run.id, "song", run.attempt),
      );
      await query("UPDATE automation_runs SET job_id=$2 WHERE id=$1", [
        run.id,
        j.id,
      ]);
      return;
    }
  }
  if (run.stage === "music") {
    if (!run.music_order_id) {
      await transaction(async (c) => {
        const current = (await one(
          "SELECT * FROM automation_runs WHERE id=$1 FOR UPDATE",
          [run.id],
          c,
        ))!;
        if (current.music_order_id) return;
        const song = (await one(
          "SELECT * FROM songs WHERE id=$1",
          [run.song_id],
          c,
        ))!;
        const lyrics = (await one(
          "SELECT * FROM lyrics_versions WHERE song_id=$1 ORDER BY version DESC LIMIT 1",
          [song.id],
          c,
        ))!;
        const identity = await one(
          "SELECT snapshot FROM identity_versions WHERE artist_id=$1 AND version=$2",
          [artist.id, song.identity_version],
          c,
        );
        const id = randomUUID(),
          number = "SUNO-" + id.slice(0, 8).toUpperCase();
        const packet = {
          ...lyrics,
          production_number: number,
          lyrics_version_id: lyrics.id,
          artist: identity?.snapshot,
          mode: "manual",
          note: "Felder und aktuelle Suno-Limits prüfen. Rechtmäßig bezogene Aufnahme hier importieren; die Videoautomatik setzt selbständig fort.",
        };
        await c.query(
          "INSERT INTO music_orders(id,song_id,lyrics_version_id,production_number,package) VALUES($1,$2,$3,$4,$5)",
          [id, song.id, lyrics.id, number, JSON.stringify(packet)],
        );
        await c.query(
          "UPDATE automation_runs SET music_order_id=$2 WHERE id=$1",
          [run.id, id],
        );
      });
      return;
    }
    const variant = await one(
      "SELECT v.*,a.metadata,a.rights_status FROM audio_variants v JOIN assets a ON a.id=v.asset_id WHERE v.order_id=$1 AND a.rights_status<>'disputed' ORDER BY v.is_master DESC,v.created_at LIMIT 1",
      [run.music_order_id],
    );
    if (variant) {
      automaticClipRange(Number(variant.metadata.duration), "opening");
      await query(
        "UPDATE audio_variants SET is_master=true,notes=notes || ' Automatisch für die Videoproduktion ausgewählt; keine KI-Hörbewertung.' WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM audio_variants WHERE song_id=$2 AND is_master)",
        [variant.id, run.song_id],
      );
      await advance(run, run.full_music_video ? "music_video" : "artwork");
      return;
    }
    const order = (await one("SELECT * FROM music_orders WHERE id=$1", [
      run.music_order_id,
    ]))!;
    if (order.provider === "sunoapi_org") {
      if (
        [
          "failed",
          "cancelled",
          "unknown_external_state",
          "waiting_for_input",
        ].includes(order.state)
      )
        await waitFor(
          run,
          "produce_music",
          "Suno-Auftrag prüfen oder Audio importieren",
          order.error ??
            "Vorhandenen Suno-Auftrag prüfen. Kein automatischer Neuauftrag.",
        );
      return;
    }
    if (run.music_mode === "manual") return;
    const music = await musicConnection(run.user_id);
    if (policy.music_mode === "auto" && music?.state === "connected") {
      if (music.version !== policy.approved_music_version)
        throw new AppError(
          "Suno-Verbindung oder Creditbudget geändert. In den Automatik-Einstellungen erneut freigeben.",
        );
      await sunoCommand(run.user_id, "suno_generate", {
        order_id: order.id,
        approved: true,
        approved_credits: Number(music.credits_per_generation),
        options: { model: music.model },
      });
      await query("UPDATE automation_runs SET music_mode='api' WHERE id=$1", [
        run.id,
      ]);
      return;
    }
    await query("UPDATE automation_runs SET music_mode='manual' WHERE id=$1", [
      run.id,
    ]);
    await waitFor(
      run,
      "produce_music",
      "Song in Suno produzieren & Audio übernehmen",
      "Lyrics und Stilprompt sind fertig. In Suno produzieren und die rechtmäßig bezogene MP3 hier hochladen. Danach übernimmt die KI wieder.",
    );
    return;
  }
  if (run.stage === "video") {
    const variant = (await one(
      "SELECT v.*,a.metadata,a.storage_key,a.sha256 FROM audio_variants v JOIN assets a ON a.id=v.asset_id WHERE v.order_id=$1 AND a.rights_status<>'disputed' ORDER BY v.is_master DESC,v.created_at LIMIT 1",
      [run.music_order_id],
    ))!;
    if (!variant)
      throw new AppError("Die Produktionsaufnahme fehlt oder ist gesperrt.");
    const clips = await query(
      "SELECT * FROM automation_clips WHERE run_id=$1 ORDER BY position",
      [run.id],
    );
    for (const clip of clips) {
      if (!clip.job_id) {
        await transaction(async (c) => {
          const existing = (await one(
            "SELECT * FROM automation_clips WHERE id=$1 FOR UPDATE",
            [clip.id],
            c,
          ))!;
          if (existing.job_id) return;
          const range = automaticClipRange(
            Number(variant.metadata.duration),
            run.creative_plan.clips[clip.position].segment,
          );
          const ids =
            clip.position === 1
              ? [policy.reference_asset_id, run.scene_asset_id]
              : [
                  clip.position === 0
                    ? run.scene_asset_id
                    : policy.reference_asset_id,
                ];
          const timeline = timelineSchema.parse({
            ...range,
            scenes: ids.map((asset_id) => ({
              asset_id,
              duration: (range.end - range.start) / ids.length,
              motion: true,
              crop_x: 0.5,
              crop_y: 0.5,
            })),
            subtitles: [],
            title: run.creative_plan.clips[clip.position].overlay || clip.title,
            font_size: 52,
            text_y: 0.68,
            fps: "30",
            quality: "standard",
            transition: "fade",
          });
          const projectId = randomUUID(),
            renderId = randomUUID(),
            template = ["character", "scenes", "visualizer"][clip.position];
          const project = {
            id: projectId,
            artist_id: artist.id,
            song_id: run.song_id,
            variant_id: variant.id,
            name: clip.title,
            template,
            timeline,
            version: 1,
          };
          await c.query(
            "INSERT INTO video_projects(id,artist_id,song_id,variant_id,name,template,timeline) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              projectId,
              artist.id,
              run.song_id,
              variant.id,
              clip.title,
              template,
              JSON.stringify(timeline),
            ],
          );
          const audio = await own(run.user_id, "assets", variant.asset_id, c),
            assets = [];
          for (const id of ids) {
            const a = await own(run.user_id, "assets", id, c);
            if (a.rights_status === "disputed")
              throw new AppError("Ein Künstlerbild ist gesperrt.");
            assets.push(a);
          }
          await c.query(
            "INSERT INTO renders(id,project_id,project_version,snapshot) VALUES($1,$2,1,$3)",
            [renderId, projectId, JSON.stringify({ project, assets, audio })],
          );
          const j = await enqueue(
            run.user_id,
            artist.id,
            "render_video",
            { render_id: renderId },
            automationKey(run.id, "clip" + clip.position),
            c,
          );
          await c.query(
            "UPDATE automation_clips SET project_id=$2,job_id=$3 WHERE id=$1",
            [clip.id, projectId, j.id],
          );
        });
        return;
      }
      const j = (await one("SELECT * FROM jobs WHERE id=$1", [clip.job_id]))!;
      if (["failed", "cancelled", "unknown_external_state"].includes(j.state)) {
        await waitFor(
          run,
          "fix_production",
          "Video-Rendering prüfen",
          j.error ?? "Renderauftrag wurde angehalten.",
        );
        return;
      }
      if (j.state !== "succeeded") return;
    }
    await transaction(async (c) => {
      let account = await one(
        "SELECT * FROM social_accounts WHERE artist_id=$1 ORDER BY created_at LIMIT 1",
        [artist.id],
        c,
      );
      if (!account) {
        const id = randomUUID();
        await c.query(
          "INSERT INTO social_accounts(id,artist_id,label) VALUES($1,$2,$3)",
          [id, artist.id, artist.name + " · TikTok (manuell)"],
        );
        account = { id };
      }
      for (const clip of clips) {
        if (clip.post_id) continue;
        const render = (await one(
          "SELECT * FROM renders WHERE project_id=$1 AND state='succeeded' ORDER BY created_at DESC LIMIT 1",
          [clip.project_id],
          c,
        ))!;
        const cover = await one(
          "SELECT id FROM assets WHERE parent_id=$1 AND metadata->>'role'='cover' LIMIT 1",
          [render.asset_id],
          c,
        );
        const post = randomUUID();
        await c.query(
          "INSERT INTO posts(id,artist_id,song_id,account_id,asset_id,cover_id,title,caption,hashtags,is_aigc,timezone,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,'waiting_for_approval')",
          [
            post,
            artist.id,
            run.song_id,
            account.id,
            render.asset_id,
            cover?.id ?? null,
            clip.title,
            clip.caption,
            clip.hashtags,
            policy.timezone,
          ],
        );
        await c.query("UPDATE automation_clips SET post_id=$2 WHERE id=$1", [
          clip.id,
          post,
        ]);
        await task(
          run,
          "publish_video",
          "Video bereit: " + clip.title,
          "MP4 herunterladen, Beschreibung übernehmen, Rechte und Kennzeichnungen prüfen und manuell auf TikTok veröffentlichen.",
          "publish_" + clip.position,
          post,
          c,
        );
      }
      await c.query(
        "UPDATE automation_runs SET stage='delivery',state='ready',error=NULL,updated_at=now() WHERE id=$1",
        [run.id],
      );
      await c.query(
        "UPDATE manual_tasks SET state='done',completed_at=now() WHERE run_id=$1 AND task_key='video'",
        [run.id],
      );
    });
    return;
  }
  if (run.job_id) {
    const j = await one("SELECT * FROM jobs WHERE id=$1", [run.job_id]);
    if (
      j &&
      ["failed", "cancelled", "unknown_external_state"].includes(j.state)
    )
      await waitFor(
        run,
        "fix_production",
        "KI-Schritt benötigt Hilfe",
        j.error ?? "Auftrag wurde angehalten.",
      );
  }
}
export async function tickAutomation(now = new Date()) {
  const lock = await pool.connect();
  let acquired = false;
  try {
    acquired = (
      await lock.query(
        "SELECT pg_try_advisory_lock(71420920,hashtext(current_schema())) acquired",
      )
    ).rows[0].acquired;
    if (!acquired) return;
    const due = await query(
      "SELECT p.* FROM artist_automations p JOIN settings s ON s.user_id=p.user_id JOIN artists a ON a.id=p.artist_id WHERE p.enabled AND NOT s.emergency_stop AND NOT a.archived AND p.next_run_at<=$1 AND NOT EXISTS(SELECT 1 FROM automation_runs r WHERE r.artist_id=p.artist_id AND r.state IN ('running','waiting_for_input')) LIMIT 20",
      [now],
    );
    for (const p of due)
      await transaction(async (c) => {
        const latest = (await one(
          "SELECT * FROM artist_automations WHERE artist_id=$1 FOR UPDATE",
          [p.artist_id],
          c,
        ))!;
        if (!latest.enabled || new Date(latest.next_run_at) > now) return;
        if (
          await one(
            "SELECT id FROM automation_runs WHERE artist_id=$1 AND state IN ('running','waiting_for_input') LIMIT 1",
            [p.artist_id],
            c,
          )
        )
          return;
        await c.query(
          "INSERT INTO automation_runs(id,user_id,artist_id,local_day,stage,identity_ready) VALUES($1,$2,$3,$4,$5,true) ON CONFLICT(artist_id,local_day) WHERE start_kind='daily' DO NOTHING",
          [
            randomUUID(),
            p.user_id,
            p.artist_id,
            localProductionDay(now, p.timezone),
            p.reference_asset_id ? "song" : "portrait",
          ],
        );
        await c.query(
          "UPDATE artist_automations SET next_run_at=$2 WHERE artist_id=$1",
          [p.artist_id, nextProductionTime(now, p.timezone, p.daily_time)],
        );
        await c.query(
          "UPDATE automation_runs SET full_music_video=$2,video_scene_count=$3 WHERE artist_id=$1 AND local_day=$4 AND start_kind='daily' AND stage IN ('song','portrait') AND song_id IS NULL",
          [
            p.artist_id,
            latest.full_music_video,
            latest.video_scene_count,
            localProductionDay(now, p.timezone),
          ],
        );
      });
    const runs = await query(
      "SELECT r.* FROM automation_runs r JOIN artist_automations p ON p.artist_id=r.artist_id JOIN settings s ON s.user_id=r.user_id WHERE p.enabled AND NOT s.emergency_stop AND r.state IN ('running','waiting_for_input') ORDER BY r.created_at LIMIT 20",
    );
    for (const run of runs) {
      // Human-dependent music uploads and completed in-flight jobs can resume automatically.
      if (
        run.state === "waiting_for_input" &&
        run.stage !== "music" &&
        run.stage !== "music_video" &&
        !run.job_id &&
        !run.image_generation_id
      )
        continue;
      try {
        await advanceRun(run);
      } catch (e) {
        await waitFor(
          run,
          run.stage === "music" ? "produce_music" : "fix_production",
          "Produktion benötigt deine Hilfe",
          (e as Error).message.slice(0, 1500),
        );
      }
    }
  } finally {
    if (acquired)
      await lock.query(
        "SELECT pg_advisory_unlock(71420920,hashtext(current_schema()))",
      );
    lock.release();
  }
}
