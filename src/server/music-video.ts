import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { pool, one, query, transaction } from "./db";
import { AppError, own, audit } from "./security";
import { enqueue } from "./jobs";
import { imageCommand, imageConnection } from "./image-generation";
import { sceneCount, fullMusicVideoTimeline } from "../lib/music-video";

const key = (id: string, step: string) => {
  const h = createHash("sha256")
    .update(`music-video:${id}:${step}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
async function connectionApproval(user: string, d: any, count: number, c: any) {
  const connection = await one(
    "SELECT provider,version,estimated_cost_usd FROM image_connections WHERE user_id=$1",
    [user],
    c,
  );
  const cost =
    connection?.provider === "gemini_api"
      ? Number(connection.estimated_cost_usd) * count
      : null;
  if (
    d.approved !== true ||
    d.connection_version !== (connection?.version ?? null) ||
    (cost !== null &&
      (typeof d.approved_cost_usd !== "number" ||
        !Number.isFinite(d.approved_cost_usd) ||
        Math.abs(d.approved_cost_usd - cost) > 0.00001))
  )
    throw new AppError(
      "Bildprovider, Szenenzahl und Kosten in der Vorschau erneut bestätigen.",
      409,
    );
  return connection;
}
export async function createMusicVideo(user: string, d: any) {
  const runId = z.uuid().parse(d.run_id),
    count = sceneCount.parse(d.scene_count ?? 8);
  return transaction(async (c) => {
    const settings = await one(
      "SELECT * FROM settings WHERE user_id=$1 FOR UPDATE",
      [user],
      c,
    );
    if (!settings || settings.emergency_stop)
      throw new AppError(
        "Not-Aus aktiv. Musikvideo kann nicht gestartet werden.",
      );
    const run = await one(
      "SELECT * FROM automation_runs WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [runId, user],
      c,
    );
    if (!run) throw new AppError("Produktion nicht gefunden.", 404);
    const old = await one(
      "SELECT * FROM music_video_productions WHERE run_id=$1",
      [runId],
      c,
    );
    if (old) return old;
    const connection = await connectionApproval(user, d, count, c);
    const policy = await one(
      "SELECT * FROM artist_automations WHERE artist_id=$1",
      [run.artist_id],
      c,
    );
    if (!policy?.reference_asset_id)
      throw new AppError("Zuerst das Hauptporträt des Artists festlegen.");
    const reference = await own(user, "assets", policy.reference_asset_id, c);
    if (reference.kind !== "image" || reference.rights_status === "disputed")
      throw new AppError("Hauptporträt fehlt oder ist gesperrt.");
    const variant = await one(
      "SELECT v.*,a.metadata,a.sha256 FROM audio_variants v JOIN assets a ON a.id=v.asset_id WHERE v.order_id=$1 AND a.kind='audio' AND a.rights_status<>'disputed' ORDER BY v.is_master DESC,v.created_at LIMIT 1",
      [run.music_order_id],
      c,
    );
    if (!variant)
      throw new AppError(
        "Zuerst die Suno-Aufnahme für diesen Produktionsauftrag importieren.",
      );
    const duration = Number(variant.metadata.duration);
    if (!Number.isFinite(duration) || duration < 2 || duration > 1200)
      throw new AppError(
        "Vollversion: Aufnahme muss zwischen 2 Sekunden und 20 Minuten lang sein.",
      );
    const lyrics = await one(
      "SELECT * FROM lyrics_versions WHERE id=$1 AND song_id=$2",
      [variant.lyrics_version_id, run.song_id],
      c,
    );
    if (!lyrics)
      throw new AppError("Der Aufnahme fehlt die zugeordnete Lyrics-Version.");
    const artist = await own(user, "songs", run.song_id, c).then((s) =>
      one(
        "SELECT snapshot FROM identity_versions WHERE artist_id=$1 AND version=$2",
        [s.artist_id, s.identity_version],
        c,
      ),
    );
    const snapshot = {
      artist: artist?.snapshot,
      lyrics: {
        title: lyrics.title,
        lyrics: lyrics.lyrics,
        style_prompt: lyrics.style_prompt,
      },
      duration,
      audio_hash: variant.sha256,
      reference_hash: reference.sha256,
      timing: "lyric_story_order_not_audio_alignment",
    };
    const id = randomUUID();
    await c.query(
      "INSERT INTO music_video_productions(id,run_id,user_id,artist_id,song_id,variant_id,lyrics_version_id,reference_asset_id,connection_version,scene_count,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        id,
        run.id,
        user,
        run.artist_id,
        run.song_id,
        variant.id,
        lyrics.id,
        reference.id,
        connection?.version ?? null,
        count,
        JSON.stringify(snapshot),
      ],
    );
    await audit(
      user,
      "music_video.approved",
      id,
      {
        run_id: run.id,
        scene_count: count,
        connection_version: connection?.version ?? null,
        duration,
        approved_cost_usd: d.approved_cost_usd ?? null,
      },
      c,
    );
    return (await one(
      "SELECT * FROM music_video_productions WHERE id=$1",
      [id],
      c,
    ))!;
  });
}
export async function musicVideoCommand(user: string, action: string, d: any) {
  if (action === "music_video_create") return createMusicVideo(user, d);
  return transaction(async (c) => {
    const settings = await one(
      "SELECT * FROM settings WHERE user_id=$1 FOR UPDATE",
      [user],
      c,
    );
    if (settings?.emergency_stop) throw new AppError("Not-Aus aktiv.");
    const p = await one(
      "SELECT * FROM music_video_productions WHERE id=$1 AND user_id=$2 FOR UPDATE",
      [z.uuid().parse(d.id), user],
      c,
    );
    if (!p) throw new AppError("Musikvideo nicht gefunden.", 404);
    if (p.version !== z.number().int().positive().parse(d.version))
      throw new AppError(
        "Musikvideo inzwischen geändert. Bitte neu laden.",
        409,
      );
    if (action === "music_video_scene_asset") {
      if (!["images", "blocked"].includes(p.state))
        throw new AppError(
          "Szenenbilder können nur vor dem Rendering übernommen werden.",
        );
      const scene = await one(
        "SELECT s.*,g.state AS generation_state FROM music_video_scenes s LEFT JOIN image_generations g ON g.id=s.generation_id WHERE s.id=$1 AND s.production_id=$2",
        [z.uuid().parse(d.scene_id), p.id],
        c,
      );
      const asset = await own(user, "assets", z.uuid().parse(d.asset_id), c);
      if (
        !scene ||
        scene.asset_id ||
        asset.artist_id !== p.artist_id ||
        asset.kind !== "image" ||
        asset.rights_status === "disputed"
      )
        throw new AppError(
          "Ein freies Szenenfeld und ein verwendbares Künstlerbild wählen.",
        );
      if (
        scene.generation_state &&
        !["failed", "cancelled", "succeeded"].includes(scene.generation_state)
      )
        throw new AppError(
          "Laufenden oder unklaren Bildauftrag zuerst unter Bildproduktion klären.",
        );
      if (
        await one(
          "SELECT id FROM music_video_scenes WHERE production_id=$1 AND asset_id=$2",
          [p.id, asset.id],
          c,
        )
      )
        throw new AppError("Jede Szene benötigt ein eigenes Bild.");
      await c.query("UPDATE music_video_scenes SET asset_id=$2 WHERE id=$1", [
        scene.id,
        asset.id,
      ]);
      await c.query(
        "UPDATE music_video_productions SET version=version+1,updated_at=now() WHERE id=$1",
        [p.id],
      );
      return { ok: true };
    }
    if (action !== "music_video_resume")
      throw new AppError("Unbekannte Musikvideoaktion.");
    if (p.state !== "blocked")
      throw new AppError(
        "Nur angehaltene Musikvideos können fortgesetzt werden.",
      );
    const connection = await connectionApproval(user, d, p.scene_count, c);
    const unresolved = await one(
      "SELECT g.id FROM music_video_scenes s JOIN image_generations g ON g.id=s.generation_id WHERE s.production_id=$1 AND s.asset_id IS NULL AND g.state IN ('failed','cancelled','unknown_external_state') LIMIT 1",
      [p.id],
      c,
    );
    if (unresolved)
      throw new AppError(
        "Bildauftrag zuerst klären oder ein vorhandenes Bild für die Szene übernehmen. Kein automatischer kostenpflichtiger Neuauftrag.",
      );
    let state = p.storyboard ? "images" : "planning",
      jobId = null;
    if (p.project_id) {
      const render = await one(
        "SELECT * FROM renders WHERE project_id=$1 ORDER BY created_at DESC LIMIT 1",
        [p.project_id],
        c,
      );
      if (render) {
        state = "rendering";
        const j = await enqueue(
          user,
          p.artist_id,
          "render_video",
          { render_id: render.id },
          key(p.id, "render:" + (p.attempt + 1)),
          c,
        );
        jobId = j.id;
        await c.query(
          "UPDATE renders SET state='queued',error=NULL WHERE id=$1",
          [render.id],
        );
      }
    }
    await c.query(
      "UPDATE music_video_productions SET state=$2,job_id=$3,connection_version=$4,error=NULL,attempt=attempt+1,version=version+1,updated_at=now() WHERE id=$1",
      [p.id, state, jobId, connection?.version ?? null],
    );
    await c.query(
      "UPDATE manual_tasks SET state='done',completed_at=now() WHERE run_id=$1 AND task_key='music_video_help'",
      [p.run_id],
    );
    await audit(user, "music_video.resumed", p.id, {}, c);
    return { ok: true };
  });
}
async function blocked(p: any, message: string) {
  await transaction(async (c) => {
    await c.query(
      "UPDATE music_video_productions SET state='blocked',error=$2,version=version+1,updated_at=now() WHERE id=$1 AND state<>'ready'",
      [p.id, message],
    );
    await c.query(
      "INSERT INTO manual_tasks(id,user_id,artist_id,run_id,task_key,kind,title,body) VALUES($1,$2,$3,$4,'music_video_help','music_video','Musikvideo benötigt Unterstützung',$5) ON CONFLICT(run_id,task_key) DO UPDATE SET state='open',body=$5,version=manual_tasks.version+1",
      [randomUUID(), p.user_id, p.artist_id, p.run_id, message],
    );
  });
}
async function advance(p: any) {
  if (p.state === "planning") {
    if (!p.job_id) {
      await transaction(async (c) => {
        const j = await enqueue(
          p.user_id,
          p.artist_id,
          "music_video_storyboard",
          { production_id: p.id },
          key(p.id, "storyboard:" + p.attempt),
          c,
        );
        await c.query(
          "UPDATE music_video_productions SET job_id=$2 WHERE id=$1",
          [p.id, j.id],
        );
      });
    } else {
      const j = await one("SELECT state,error FROM jobs WHERE id=$1", [
        p.job_id,
      ]);
      if (
        j &&
        ["failed", "cancelled", "unknown_external_state"].includes(j.state)
      )
        throw new AppError(j.error ?? "Storyboardauftrag angehalten.");
    }
    return;
  }
  if (p.state === "images") {
    const scenes = await query(
      "SELECT * FROM music_video_scenes WHERE production_id=$1 ORDER BY position",
      [p.id],
    );
    const connection = await imageConnection(p.user_id);
    for (const scene of scenes) {
      if (scene.asset_id) continue;
      if (scene.generation_id) {
        const g = (await one("SELECT * FROM image_generations WHERE id=$1", [
          scene.generation_id,
        ]))!;
        if (g.state === "succeeded" && g.asset_id) {
          await query("UPDATE music_video_scenes SET asset_id=$2 WHERE id=$1", [
            scene.id,
            g.asset_id,
          ]);
          return;
        }
        if (["failed", "cancelled", "unknown_external_state"].includes(g.state))
          throw new AppError(
            `Szene ${scene.position + 1}: ${g.error ?? g.state}. Vorhandenen Bildauftrag prüfen; es wird kein zweiter Auftrag gesendet.`,
          );
        return;
      }
      if (!connection || connection.provider === "manual")
        throw new AppError(
          "Bild-KI unter Einstellungen verbinden oder für jede Storyboardszene ein eigenes Bild importieren und zuordnen.",
        );
      if (connection.version !== p.connection_version)
        throw new AppError(
          "Bildprovider oder Budget geändert. Aktuelle Verbindung für dieses Musikvideo erneut bestätigen.",
        );
      const policy = await one(
        "SELECT reference_asset_id FROM artist_automations WHERE artist_id=$1",
        [p.artist_id],
      );
      if (policy?.reference_asset_id !== p.reference_asset_id)
        throw new AppError(
          "Das Hauptporträt wurde geändert. Laufende Musikvideoproduktion behält ihre ursprüngliche Referenz; bitte ursprüngliches Porträt wiederherstellen oder Produktion prüfen.",
        );
      const reference = await own(p.user_id, "assets", p.reference_asset_id);
      if (
        reference.sha256 !== p.snapshot.reference_hash ||
        reference.rights_status === "disputed"
      )
        throw new AppError(
          "Die gespeicherte Porträtreferenz wurde geändert oder gesperrt.",
        );
      const result = await imageCommand(
        p.user_id,
        "image_generate",
        {
          artist_id: p.artist_id,
          song_id: p.song_id,
          reference_asset_id: p.reference_asset_id,
          name: `Musikvideo · ${scene.position + 1} · ${scene.title}`.slice(
            0,
            160,
          ),
          prompt: [
            "Ein einzelnes hochwertiges filmisches Musikvideo-Standbild, vertikal 9:16. Verwende die angehängte Künstlerreferenz für dieselbe erwachsene fiktive Person; Gesicht, Haare, Haut und Kostüm konsistent. Neue Komposition und Handlung für diese Szene, keine Kopie der Referenzpose. Keine Schrift, Beschriftung, Collage, Wasserzeichen oder Logos.",
            p.storyboard.visual_style,
            "Szenenauftrag: " + scene.prompt,
            "Kontinuität: " + JSON.stringify(p.snapshot.artist?.identity ?? {}),
          ]
            .join("\n")
            .slice(0, 8000),
          aspect_ratio: "9:16",
          connection_version: connection.version,
          approved: true,
          rights_confirmed: true,
          approved_cost_usd:
            connection.provider === "gemini_api"
              ? Number(connection.estimated_cost_usd)
              : null,
        },
        key(p.id, "scene:" + scene.position),
        fetch,
        p.snapshot.artist
          ? {
              name: p.snapshot.artist.name,
              version: p.snapshot.artist.version,
              visual: p.snapshot.artist.identity?.visual ?? "",
              negative_visual: p.snapshot.artist.identity?.negativeVisual ?? "",
              color: p.snapshot.artist.color ?? "#ff875d",
            }
          : undefined,
      );
      await query(
        "UPDATE music_video_scenes SET generation_id=$2 WHERE id=$1",
        [scene.id, (result as any).id],
      );
      return;
    }
    if (scenes.length !== p.scene_count)
      throw new AppError("Storyboard ist unvollständig.");
    await transaction(async (c) => {
      const current = await one(
        "SELECT project_id FROM music_video_productions WHERE id=$1 FOR UPDATE",
        [p.id],
        c,
      );
      if (current?.project_id) return;
      const variant = (await one(
        "SELECT * FROM audio_variants WHERE id=$1",
        [p.variant_id],
        c,
      ))!;
      const audio = await own(p.user_id, "assets", variant.asset_id, c);
      if (
        audio.rights_status === "disputed" ||
        audio.sha256 !== p.snapshot.audio_hash
      )
        throw new AppError("Audio wurde geändert oder gesperrt.");
      const assets = [];
      for (const s of scenes) {
        const a = await own(p.user_id, "assets", s.asset_id, c);
        if (a.rights_status === "disputed")
          throw new AppError("Szenenbild ist gesperrt.");
        assets.push(a);
      }
      const timeline = fullMusicVideoTimeline(
        p.snapshot.duration,
        `${p.snapshot.lyrics.title} · ${p.snapshot.artist?.name ?? ""}`,
        scenes,
      );
      const project = {
        id: randomUUID(),
        artist_id: p.artist_id,
        song_id: p.song_id,
        variant_id: p.variant_id,
        name: p.snapshot.lyrics.title + " · Vollständiges Musikvideo",
        template: "music_video",
        timeline,
        version: 1,
      };
      const render = randomUUID();
      await c.query(
        "INSERT INTO video_projects(id,artist_id,song_id,variant_id,name,template,timeline) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          project.id,
          p.artist_id,
          p.song_id,
          p.variant_id,
          project.name,
          project.template,
          JSON.stringify(timeline),
        ],
      );
      await c.query(
        "INSERT INTO renders(id,project_id,project_version,snapshot) VALUES($1,$2,1,$3)",
        [render, project.id, JSON.stringify({ project, assets, audio })],
      );
      const job = await enqueue(
        p.user_id,
        p.artist_id,
        "render_video",
        { render_id: render },
        key(p.id, "render:" + p.attempt),
        c,
      );
      await c.query(
        "UPDATE music_video_productions SET state='rendering',project_id=$2,job_id=$3,version=version+1,updated_at=now() WHERE id=$1",
        [p.id, project.id, job.id],
      );
    });
    return;
  }
  if (p.state === "rendering") {
    const job = await one("SELECT state,error FROM jobs WHERE id=$1", [
      p.job_id,
    ]);
    if (!job) throw new AppError("Renderauftrag fehlt.");
    if (["failed", "cancelled", "unknown_external_state"].includes(job.state))
      throw new AppError(job.error ?? "Rendering angehalten.");
    if (job.state !== "succeeded") return;
    await transaction(async (c) => {
      const current = await one(
        "SELECT post_id FROM music_video_productions WHERE id=$1 FOR UPDATE",
        [p.id],
        c,
      );
      if (current?.post_id) return;
      const render = (await one(
        "SELECT * FROM renders WHERE project_id=$1 AND state='succeeded' ORDER BY created_at DESC LIMIT 1",
        [p.project_id],
        c,
      ))!;
      if (!render?.asset_id)
        throw new AppError("Gerenderte Vollversion fehlt.");
      let account = await one(
        "SELECT id FROM social_accounts WHERE artist_id=$1 ORDER BY created_at LIMIT 1",
        [p.artist_id],
        c,
      );
      if (!account) {
        account = { id: randomUUID() };
        await c.query(
          "INSERT INTO social_accounts(id,artist_id,label) VALUES($1,$2,'TikTok · manuell')",
          [account.id, p.artist_id],
        );
      }
      const cover = await one(
          "SELECT id FROM assets WHERE parent_id=$1 AND metadata->>'role'='cover' LIMIT 1",
          [render.asset_id],
          c,
        ),
        post = randomUUID();
      await c.query(
        "INSERT INTO posts(id,artist_id,song_id,account_id,asset_id,cover_id,title,caption,hashtags,is_aigc,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true,'waiting_for_approval')",
        [
          post,
          p.artist_id,
          p.song_id,
          account.id,
          render.asset_id,
          cover?.id ?? null,
          p.snapshot.lyrics.title + " · Vollständiges Musikvideo",
          p.storyboard.caption,
          p.storyboard.hashtags,
        ],
      );
      await c.query(
        "INSERT INTO manual_tasks(id,user_id,artist_id,run_id,task_key,kind,title,body,post_id) VALUES($1,$2,$3,$4,'publish_full_music_video','publish_video',$5,'Vollständiger Song mit KI-Bildgeschichte. MP4 und Beschreibung herunterladen, Rechte und Kennzeichnung prüfen; Veröffentlichung erfolgt manuell.',$6) ON CONFLICT(run_id,task_key) DO NOTHING",
        [
          randomUUID(),
          p.user_id,
          p.artist_id,
          p.run_id,
          p.snapshot.lyrics.title + " · Vollständiges Musikvideo",
          post,
        ],
      );
      await c.query(
        "UPDATE manual_tasks SET state='done',completed_at=now() WHERE run_id=$1 AND task_key='music_video_help'",
        [p.run_id],
      );
      await c.query(
        "UPDATE music_video_productions SET state='ready',post_id=$2,error=NULL,version=version+1,updated_at=now() WHERE id=$1",
        [p.id, post],
      );
      await audit(
        p.user_id,
        "music_video.ready",
        p.id,
        { post_id: post, render_id: render.id },
        c,
      );
    });
  }
}
export async function tickMusicVideos() {
  const lock = await pool.connect();
  let acquired = false;
  try {
    acquired = (
      await lock.query(
        "SELECT pg_try_advisory_lock(71420921,hashtext(current_schema())) ok",
      )
    ).rows[0].ok;
    if (!acquired) return;
    const rows = await query(
      "SELECT v.* FROM music_video_productions v JOIN settings s ON s.user_id=v.user_id JOIN artist_automations a ON a.artist_id=v.artist_id JOIN artists ar ON ar.id=v.artist_id WHERE v.state IN ('planning','images','rendering') AND NOT s.emergency_stop AND a.enabled AND NOT ar.archived ORDER BY v.created_at LIMIT 20",
    );
    for (const p of rows)
      try {
        await advance(p);
      } catch (e) {
        await blocked(p, (e as Error).message);
      }
  } finally {
    if (acquired)
      await lock.query(
        "SELECT pg_advisory_unlock(71420921,hashtext(current_schema()))",
      );
    lock.release();
  }
}
