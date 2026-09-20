import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parse as csvParse } from "csv-parse/sync";
import { one, query, transaction } from "./db";
import { AppError, own, ownArtist, audit, hash } from "./security";
import {
  artistSchema,
  lyricsSchema,
  ideaSchema,
  timelineSchema,
  id,
  text,
  short,
  jobKinds,
  preserveProtected,
  resolveLocalTime,
} from "@/lib/domain";
import { enqueue } from "./jobs";
import { storage } from "./storage";
import { activeApproval, postSnapshot, invalidate } from "./approval";
const revision = z.number().int().positive();
function json(value: unknown) {
  return JSON.stringify(value);
}
async function updateVersion(
  table: string,
  objectId: string,
  version: number,
  fields: Record<string, unknown>,
  c: any,
) {
  const keys = Object.keys(fields);
  const row = await one(
    `UPDATE ${table} SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(",")},version=version+1 WHERE id=$1 AND version=$2 RETURNING *`,
    [objectId, version, ...Object.values(fields)],
    c,
  );
  if (!row)
    throw new AppError(
      "Dieser Datensatz wurde zwischenzeitlich geändert. Bitte neu laden.",
      409,
    );
  return row;
}
export async function command(userId: string, raw: unknown): Promise<any> {
  const envelope = z
    .object({
      action: short.min(1),
      data: z.record(z.string(), z.unknown()).default({}),
      key: z.string().uuid().optional(),
    })
    .parse(raw);
  const d = envelope.data,
    key = envelope.key ?? randomUUID();
  if (envelope.action.startsWith("music_video_")) {
    const { musicVideoCommand } = await import("./music-video");
    return musicVideoCommand(userId, envelope.action, d);
  }
  if (envelope.action.startsWith("auto_")) {
    const { automationCommand } = await import("./automation");
    return automationCommand(userId, envelope.action, d, key);
  }
  if (envelope.action.startsWith("image_")) {
    const { imageCommand } = await import("./image-generation");
    return imageCommand(userId, envelope.action, d, key);
  }
  if (envelope.action.startsWith("veo_")) {
    const { videoCommand } = await import("./video-generation");
    return videoCommand(userId, envelope.action, d, key);
  }
  if (envelope.action.startsWith("suno_")) {
    const { sunoCommand } = await import("./suno");
    return sunoCommand(userId, envelope.action, d);
  }
  switch (envelope.action) {
    case "save_settings": {
      const data = z
        .object({
          studio_name: short.min(1),
          timezone: short,
          provider: z.enum(["codex", "gemini"]),
          mode: z.enum(["assisted", "production", "publication"]),
          daily_ai_limit: z.number().int().min(0).max(10000),
          monthly_ai_limit: z.number().int().min(0).max(100000),
          daily_render_limit: z.number().int().min(0).max(1000),
          storage_limit_mb: z.number().int().min(100).max(1000000),
          retention_days: z.number().int().min(1).max(3650),
          setup_step: z.number().int().min(1).max(9).default(9),
        })
        .parse(d);
      try {
        new Intl.DateTimeFormat("de", { timeZone: data.timezone });
      } catch {
        throw new AppError("Ungültige Zeitzone.");
      }
      await query(
        "UPDATE settings SET studio_name=$2,timezone=$3,provider=$4,mode=$5,daily_ai_limit=$6,monthly_ai_limit=$7,daily_render_limit=$8,storage_limit_mb=$9,retention_days=$10,setup_step=$11 WHERE user_id=$1",
        [userId, ...Object.values(data)],
      );
      return { ok: true };
    }
    case "emergency_stop": {
      const enabled = z.boolean().parse(d.enabled);
      await query("UPDATE settings SET emergency_stop=$2 WHERE user_id=$1", [
        userId,
        enabled,
      ]);
      await audit(userId, "emergency_stop", undefined, { enabled });
      return { ok: true };
    }
    case "create_artist": {
      const data = artistSchema.parse(d);
      return transaction(async (c) => {
        const aid = randomUUID();
        await c.query(
          "INSERT INTO artists(id,user_id,name,bio,language,market,genre,color,identity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            aid,
            userId,
            data.name,
            data.bio,
            data.language,
            data.market,
            data.genre,
            data.color,
            json(data.identity),
          ],
        );
        await c.query(
          "INSERT INTO identity_versions(id,artist_id,version,snapshot) VALUES($1,$2,1,$3)",
          [randomUUID(), aid, json(data)],
        );
        await audit(userId, "artist.created", aid, {}, c);
        return { id: aid };
      });
    }
    case "update_artist": {
      const aid = id.parse(d.id),
        version = revision.parse(d.version),
        data = artistSchema.parse(d);
      return transaction(async (c) => {
        await ownArtist(userId, aid, c);
        const artist = await updateVersion(
          "artists",
          aid,
          version,
          { ...data, identity: json(data.identity) },
          c,
        );
        await c.query(
          "INSERT INTO identity_versions(id,artist_id,version,snapshot) VALUES($1,$2,$3,$4)",
          [randomUUID(), aid, artist.version, json(data)],
        );
        await audit(
          userId,
          "artist.updated",
          aid,
          { version: artist.version },
          c,
        );
        return artist;
      });
    }
    case "archive_artist": {
      const aid = id.parse(d.id);
      await ownArtist(userId, aid);
      await query("UPDATE artists SET archived=$2 WHERE id=$1", [
        aid,
        z.boolean().parse(d.archived),
      ]);
      return { ok: true };
    }
    case "create_idea": {
      const aid = id.parse(d.artist_id);
      await ownArtist(userId, aid);
      const data = ideaSchema.parse(d);
      const iid = randomUUID();
      await query(
        "INSERT INTO ideas(id,artist_id,title,premise,conflict,hook,direction,video_idea,rationale,sources) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          iid,
          aid,
          data.title,
          data.premise,
          data.conflict,
          data.hook,
          data.direction,
          data.video_idea,
          data.rationale,
          json(data.sources),
        ],
      );
      return { id: iid };
    }
    case "update_idea": {
      const iid = id.parse(d.id);
      await own(userId, "ideas", iid);
      const data = z
        .object({
          title: short.min(1),
          premise: text,
          status: z.enum(["proposed", "accepted", "rejected", "archived"]),
          feedback: text,
          hook: text,
          direction: text,
        })
        .parse(d);
      return transaction((c) =>
        updateVersion("ideas", iid, revision.parse(d.version), data, c),
      );
    }
    case "combine_ideas": {
      const ids = z.array(id).min(2).max(5).parse(d.ids);
      const ideas: Record<string, any>[] = [];
      for (const iid of ids) ideas.push(await own(userId, "ideas", iid));
      if (ideas.some((x) => x.artist_id !== ideas[0].artist_id))
        throw new AppError("Ideen müssen zum selben Künstler gehören.");
      const iid = randomUUID();
      await query(
        "INSERT INTO ideas(id,artist_id,title,premise,hook,rationale) VALUES($1,$2,$3,$4,$5,$6)",
        [
          iid,
          ideas[0].artist_id,
          short.parse(d.title),
          ideas.map((x) => x.premise).join("\n\n"),
          ideas.map((x) => x.hook).join(" / "),
          "Kombiniert aus: " + ideas.map((x) => x.id).join(", "),
        ],
      );
      return { id: iid };
    }
    case "create_song": {
      const aid = id.parse(d.artist_id),
        artist = await ownArtist(userId, aid);
      const ideaId = d.idea_id ? id.parse(d.idea_id) : null;
      if (ideaId && (await own(userId, "ideas", ideaId)).artist_id !== aid)
        throw new AppError("Idee gehört zu anderem Künstler.");
      const sid = randomUUID();
      await query(
        "INSERT INTO songs(id,artist_id,idea_id,identity_version,title) VALUES($1,$2,$3,$4,$5)",
        [sid, aid, ideaId, artist.version, short.min(1).parse(d.title)],
      );
      return { id: sid };
    }
    case "save_lyrics": {
      const sid = id.parse(d.song_id),
        data = lyricsSchema.parse(d);
      return transaction(async (c) => {
        await own(userId, "songs", sid, c);
        await c.query("SELECT id FROM songs WHERE id=$1 FOR UPDATE", [sid]);
        const prev = await one(
          "SELECT * FROM lyrics_versions WHERE song_id=$1 ORDER BY version DESC LIMIT 1",
          [sid],
          c,
        );
        if (
          (prev?.version ?? 0) !== z.number().int().min(0).parse(d.base_version)
        )
          throw new AppError(
            "Es gibt bereits eine neuere Lyrics-Version.",
            409,
          );
        preserveProtected(data.lyrics, prev?.protected_lines ?? []);
        const lid = randomUUID();
        await c.query(
          "INSERT INTO lyrics_versions(id,song_id,version,title,lyrics,style_prompt,negative_prompt,pronunciation,notes,hooks,protected_lines,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'human')",
          [
            lid,
            sid,
            (prev?.version ?? 0) + 1,
            data.title,
            data.lyrics,
            data.style_prompt,
            data.negative_prompt,
            data.pronunciation,
            data.notes,
            json(data.hooks),
            json(data.protected_lines),
          ],
        );
        return { id: lid };
      });
    }
    case "unlock_lyrics": {
      const lid = id.parse(d.id);
      const row = await one("SELECT * FROM lyrics_versions WHERE id=$1", [lid]);
      if (!row) throw new AppError("Version fehlt.");
      await own(userId, "songs", row.song_id);
      await query(
        "UPDATE lyrics_versions SET protected_lines='[]' WHERE id=$1",
        [lid],
      );
      await audit(userId, "lyrics.unlocked", lid);
      return { ok: true };
    }
    case "prepare_music_generation": {
      const sid = id.parse(d.song_id),
        song = await own(userId, "songs", sid);
      const lyrics = await one(
        "SELECT * FROM lyrics_versions WHERE id=$1 AND song_id=$2",
        [id.parse(d.lyrics_version_id), sid],
      );
      if (!lyrics) throw new AppError("Lyrics-Version fehlt.");
      const identity = await one(
        "SELECT snapshot FROM identity_versions WHERE artist_id=$1 AND version=$2",
        [song.artist_id, song.identity_version],
      );
      const oid = randomUUID(),
        number = "SUNO-" + oid.slice(0, 8).toUpperCase();
      const packet = {
        production_number: number,
        title: lyrics.title,
        lyrics: lyrics.lyrics,
        style_prompt: lyrics.style_prompt,
        negative_prompt: lyrics.negative_prompt,
        pronunciation: lyrics.pronunciation,
        notes: lyrics.notes,
        hooks: lyrics.hooks,
        artist: identity?.snapshot,
        lyrics_version_id: lyrics.id,
        created_at: new Date().toISOString(),
        mode: "manual",
        note: "Felder und Limits in der aktuell verwendeten Suno-Weboberfläche prüfen. Negativvorgaben und Referenzen nur verwenden, wenn dieser Weg sie unterstützt.",
      };
      await query(
        "INSERT INTO music_orders(id,song_id,lyrics_version_id,production_number,package) VALUES($1,$2,$3,$4,$5)",
        [oid, sid, lyrics.id, number, json(packet)],
      );
      return { id: oid };
    }
    case "save_variant": {
      const vid = id.parse(d.id),
        variant = await one("SELECT * FROM audio_variants WHERE id=$1", [vid]);
      if (!variant) throw new AppError("Variante fehlt.");
      await own(userId, "songs", variant.song_id);
      const data = z
        .object({
          label: short,
          notes: text,
          clip_start: z.number().min(0),
          clip_end: z.number().positive(),
          is_master: z.boolean(),
          markers: z
            .array(z.object({ time: z.number().min(0), note: short }))
            .max(100),
          timings: z
            .array(
              z.object({
                start: z.number().min(0),
                end: z.number().positive(),
                text: short,
              }),
            )
            .max(300),
        })
        .parse(d);
      const asset = await one("SELECT metadata FROM assets WHERE id=$1", [
        variant.asset_id,
      ]);
      if (
        data.clip_end <= data.clip_start ||
        data.clip_end > Number(asset!.metadata.duration)
      )
        throw new AppError("Ungültiger Audioausschnitt.");
      return transaction(async (c) => {
        await c.query("SELECT id FROM songs WHERE id=$1 FOR UPDATE", [
          variant.song_id,
        ]);
        if (data.is_master)
          await c.query(
            "UPDATE audio_variants SET is_master=false WHERE song_id=$1 AND id<>$2",
            [variant.song_id, vid],
          );
        return updateVersion(
          "audio_variants",
          vid,
          revision.parse(d.version),
          { ...data, markers: json(data.markers), timings: json(data.timings) },
          c,
        );
      });
    }
    case "save_rights": {
      const aid = id.parse(d.asset_id);
      await own(userId, "assets", aid);
      const data = z
        .object({
          status: z.enum([
            "unclear",
            "noncommercial",
            "operator_approved",
            "disputed",
          ]),
          provider: short,
          plan: short,
          input_origin: text,
          acquisition: text,
          terms_url: z.union([z.url(), z.literal("")]),
          terms_date: short,
          notes: text,
          evidence_asset_id: id.nullable().default(null),
        })
        .parse(d);
      if (data.evidence_asset_id)
        await own(userId, "assets", data.evidence_asset_id);
      if (data.status === "operator_approved" && !data.notes.trim())
        throw new AppError(
          "Eine Freigabe benötigt eine nachvollziehbare Begründung.",
        );
      await transaction(async (c) => {
        await c.query(
          "INSERT INTO rights_records(id,asset_id,status,provider,plan,input_origin,acquisition,terms_url,terms_date,notes,evidence_asset_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          [randomUUID(), aid, ...Object.values(data)],
        );
        await c.query("UPDATE assets SET rights_status=$2 WHERE id=$1", [
          aid,
          data.status,
        ]);
        await c.query(
          "UPDATE approvals SET state='invalidated' WHERE post_id IN (SELECT id FROM posts WHERE asset_id=$1 OR cover_id=$1)",
          [aid],
        );
        await audit(userId, "rights.updated", aid, { status: data.status }, c);
      });
      return { ok: true };
    }
    case "add_reference": {
      const aid = id.parse(d.artist_id);
      const asset = await own(userId, "assets", id.parse(d.asset_id));
      const artist = await ownArtist(userId, aid);
      if (asset.artist_id !== aid)
        throw new AppError("Referenz gehört zu anderem Künstler.");
      await query(
        "INSERT INTO artist_references(id,artist_id,asset_id,type,notes,state,identity_version) VALUES($1,$2,$3,$4,$5,'proposed',$6)",
        [
          randomUUID(),
          aid,
          asset.id,
          z
            .enum(["portrait", "outfit", "visual", "voice", "song"])
            .parse(d.type),
          text.parse(d.notes ?? ""),
          artist.version,
        ],
      );
      return { ok: true };
    }
    case "approve_reference": {
      const ref = await one("SELECT * FROM artist_references WHERE id=$1", [
        id.parse(d.id),
      ]);
      if (!ref) throw new AppError("Referenz fehlt.");
      await ownArtist(userId, ref.artist_id);
      await query("UPDATE artist_references SET state=$2 WHERE id=$1", [
        ref.id,
        z.enum(["approved", "rejected"]).parse(d.state),
      ]);
      return { ok: true };
    }
    case "save_video": {
      const aid = id.parse(d.artist_id);
      await ownArtist(userId, aid);
      const song = await own(userId, "songs", id.parse(d.song_id));
      const variant = await one(
        "SELECT * FROM audio_variants WHERE id=$1 AND song_id=$2",
        [id.parse(d.variant_id), song.id],
      );
      if (!variant || song.artist_id !== aid)
        throw new AppError("Songvariante gehört nicht zum Künstler.");
      const timeline = timelineSchema.parse(d.timeline);
      const audio = await own(userId, "assets", variant.asset_id);
      if (timeline.end > Number(audio.metadata.duration) + 0.02)
        throw new AppError("Ausschnitt liegt außerhalb der Audiodatei.");
      for (const scene of timeline.scenes) {
        const asset = await own(userId, "assets", scene.asset_id);
        if (asset.artist_id !== aid || !["image", "video"].includes(asset.kind))
          throw new AppError(
            "Szenen benötigen Bild oder Video dieses Künstlers.",
          );
      }
      const fields = {
        artist_id: aid,
        song_id: song.id,
        variant_id: variant.id,
        name: short.min(1).parse(d.name),
        template: z
          .enum(["character", "scenes", "visualizer", "music_video"])
          .parse(d.template),
        timeline: json(timeline),
      };
      if (d.id) {
        await own(userId, "video_projects", id.parse(d.id));
        return transaction(async (c) => {
          const old = await one(
            "SELECT * FROM video_projects WHERE id=$1 FOR UPDATE",
            [d.id],
            c,
          );
          return updateVersion(
            "video_projects",
            d.id as string,
            revision.parse(d.version),
            {
              ...fields,
              revisions: json([
                ...(old!.revisions ?? []),
                {
                  version: old!.version,
                  name: old!.name,
                  timeline: old!.timeline,
                  variant_id: old!.variant_id,
                  saved_at: new Date().toISOString(),
                },
              ]),
            },
            c,
          );
        });
      }
      const pid = randomUUID();
      await query(
        "INSERT INTO video_projects(id,artist_id,song_id,variant_id,name,template,timeline) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [pid, ...Object.values(fields)],
      );
      return { id: pid };
    }
    case "render_video": {
      const project = await own(
        userId,
        "video_projects",
        id.parse(d.project_id),
      );
      const variant = await one("SELECT * FROM audio_variants WHERE id=$1", [
        project.variant_id,
      ]);
      const audio = await own(userId, "assets", variant!.asset_id);
      const assets: Record<string, any>[] = [];
      for (const s of project.timeline.scenes)
        assets.push(await own(userId, "assets", s.asset_id));
      return transaction(async (c) => {
        const existing = await one(
          "SELECT * FROM jobs WHERE user_id=$1 AND idempotency_key=$2",
          [userId, key],
          c,
        );
        if (existing) return existing;
        const rid = randomUUID();
        await c.query(
          "INSERT INTO renders(id,project_id,project_version,snapshot) VALUES($1,$2,$3,$4)",
          [rid, project.id, project.version, json({ project, assets, audio })],
        );
        return enqueue(
          userId,
          project.artist_id,
          "render_video",
          { render_id: rid },
          key,
          c,
        );
      });
    }
    case "create_account": {
      const aid = id.parse(d.artist_id);
      await ownArtist(userId, aid);
      const acc = randomUUID();
      await query(
        "INSERT INTO social_accounts(id,artist_id,label) VALUES($1,$2,$3)",
        [acc, aid, short.min(1).parse(d.label)],
      );
      return { id: acc };
    }
    case "create_campaign": {
      const aid = id.parse(d.artist_id);
      await ownArtist(userId, aid);
      const sid = d.song_id ? id.parse(d.song_id) : null;
      if (sid && (await own(userId, "songs", sid)).artist_id !== aid)
        throw new AppError("Song gehört zu anderem Künstler.");
      const cid = randomUUID();
      await query(
        "INSERT INTO campaigns(id,artist_id,song_id,name,goal,budget) VALUES($1,$2,$3,$4,$5,$6)",
        [
          cid,
          aid,
          sid,
          short.min(1).parse(d.name),
          text.parse(d.goal ?? ""),
          z
            .number()
            .min(0)
            .parse(d.budget ?? 0),
        ],
      );
      return { id: cid };
    }
    case "save_post": {
      const aid = id.parse(d.artist_id);
      await ownArtist(userId, aid);
      const account = await own(
          userId,
          "social_accounts",
          id.parse(d.account_id),
        ),
        asset = await own(userId, "assets", id.parse(d.asset_id));
      if (
        account.artist_id !== aid ||
        asset.artist_id !== aid ||
        asset.kind !== "video"
      )
        throw new AppError(
          "Konto und fertiges Video müssen zum Künstler gehören.",
        );
      const data = z
        .object({
          title: short.min(1),
          caption: z.string().max(2200),
          hashtags: z.string().max(500),
          is_aigc: z.boolean(),
          commercial: z.boolean(),
          privacy: z.enum([
            "SELF_ONLY",
            "PUBLIC_TO_EVERYONE",
            "MUTUAL_FOLLOW_FRIENDS",
            "FOLLOWER_OF_CREATOR",
          ]),
          rights_note: text,
          timezone: short.default("Europe/Berlin"),
          interactions: z
            .object({
              comment: z.boolean(),
              duet: z.boolean(),
              stitch: z.boolean(),
            })
            .default({ comment: false, duet: false, stitch: false }),
        })
        .parse(d);
      const scheduled = d.local_time
        ? resolveLocalTime(
            z.string().parse(d.local_time),
            data.timezone,
            z
              .enum(["reject", "earlier", "later"])
              .parse(d.disambiguation ?? "reject"),
          )
        : null;
      const campaign = d.campaign_id ? id.parse(d.campaign_id) : null;
      if (
        campaign &&
        (await own(userId, "campaigns", campaign)).artist_id !== aid
      )
        throw new AppError("Kampagne gehört zu anderem Künstler.");
      const cover = d.cover_id
        ? id.parse(d.cover_id)
        : ((
            await one(
              "SELECT id FROM assets WHERE parent_id=$1 AND metadata->>'role'='cover' ORDER BY created_at DESC LIMIT 1",
              [asset.id],
            )
          )?.id ?? null);
      if (cover && (await own(userId, "assets", cover)).artist_id !== aid)
        throw new AppError("Cover gehört zu anderem Künstler.");
      const conflict = scheduled
        ? await one(
            "SELECT id FROM posts WHERE account_id=$1 AND abs(extract(epoch FROM scheduled_at-$2::timestamptz))<900 AND id<>$3::uuid",
            [account.id, scheduled, d.id ?? randomUUID()],
          )
        : null;
      if (conflict)
        throw new AppError(
          "Terminkonflikt: Auf diesem Konto ist innerhalb von 15 Minuten ein anderer Beitrag geplant.",
          409,
        );
      const fields = {
        artist_id: aid,
        account_id: account.id,
        asset_id: asset.id,
        campaign_id: campaign,
        cover_id: cover,
        song_id: asset.song_id,
        ...data,
        interactions: json(data.interactions),
        scheduled_at: scheduled,
      };
      return transaction(async (c) => {
        if (d.id) {
          const old = await own(userId, "posts", id.parse(d.id), c);
          if (old.status === "published")
            throw new AppError(
              "Veröffentlichter Nachweis ist unveränderlich. Einen neuen Entwurf anlegen.",
            );
          const p = await updateVersion(
            "posts",
            old.id,
            revision.parse(d.version),
            { ...fields, status: "draft" },
            c,
          );
          await invalidate(old.id, c);
          return p;
        }
        const pid = randomUUID(),
          keys = Object.keys(fields);
        await c.query(
          `INSERT INTO posts(id,${keys.join(",")}) VALUES($1,${keys.map((_, i) => "$" + (i + 2)).join(",")})`,
          [pid, ...Object.values(fields)],
        );
        return { id: pid };
      });
    }
    case "request_approval": {
      const post = await own(userId, "posts", id.parse(d.post_id));
      if (post.status === "published")
        throw new AppError("Beitrag bereits veröffentlicht.");
      await query(
        "UPDATE posts SET status='waiting_for_approval' WHERE id=$1",
        [post.id],
      );
      return { ok: true };
    }
    case "approve_post": {
      const pid = id.parse(d.post_id);
      return transaction(async (c) => {
        const post = await own(userId, "posts", pid, c);
        await c.query("SELECT id FROM posts WHERE id=$1 FOR UPDATE", [pid]);
        const snapshot = await postSnapshot(pid, c);
        if (snapshot.rights_status !== "operator_approved")
          throw new AppError(
            "Videorechte müssen vor Freigabe anhand hinterlegter Nachweise freigegeben sein.",
          );
        if (!snapshot.rights_note)
          throw new AppError(
            "Rechte- und Kennzeichnungsprüfung im Beitrag dokumentieren.",
          );
        await invalidate(pid, c);
        await c.query(
          "INSERT INTO approvals(id,post_id,snapshot,snapshot_hash,user_id) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), pid, json(snapshot), hash(json(snapshot)), userId],
        );
        await c.query("UPDATE posts SET status='approved' WHERE id=$1", [pid]);
        await audit(userId, "post.approved", pid, {}, c);
        return { ok: true };
      });
    }
    case "confirm_publication": {
      const pid = id.parse(d.post_id);
      const url = z.url().parse(d.url);
      if (
        !/^https:\/\/(www\.)?tiktok\.com\//.test(url) &&
        !/^https:\/\/vm\.tiktok\.com\//.test(url)
      )
        throw new AppError("Bitte einen HTTPS-Link zu TikTok angeben.");
      const date = z.iso.datetime({ offset: true }).parse(d.published_at);
      return transaction(async (c) => {
        await own(userId, "posts", pid, c);
        await c.query("SELECT id FROM posts WHERE id=$1 FOR UPDATE", [pid]);
        const { approval } = await activeApproval(pid, c);
        await c.query(
          "INSERT INTO publication_attempts(id,post_id,approval_id,idempotency_key,state,details) VALUES($1,$2,$3,$4,'manually_confirmed',$5) ON CONFLICT(idempotency_key) DO NOTHING",
          [
            randomUUID(),
            pid,
            approval.id,
            "manual:" + pid,
            json({ url, published_at: date }),
          ],
        );
        await c.query(
          "UPDATE posts SET status='published',published_url=$2,published_at=$3,verification='manual_unverified' WHERE id=$1",
          [pid, url, date],
        );
        await audit(userId, "publication.manually_confirmed", pid, { url }, c);
        return { ok: true };
      });
    }
    case "import_comments": {
      const aid = id.parse(d.artist_id);
      await ownArtist(userId, aid);
      const accountId = d.account_id ? id.parse(d.account_id) : null;
      if (
        accountId &&
        (await own(userId, "social_accounts", accountId)).artist_id !== aid
      )
        throw new AppError("Falsches Konto.");
      let entries = d.entries;
      if (d.format === "csv")
        entries = csvParse(z.string().max(200000).parse(d.content), {
          columns: true,
          skip_empty_lines: true,
          bom: true,
        });
      if (d.format === "json")
        entries = JSON.parse(z.string().max(200000).parse(d.content));
      const data = z
        .array(
          z.object({
            body: z.string().min(1).max(5000),
            author: short.default("Anonym"),
            external_id: short.optional(),
          }),
        )
        .min(1)
        .max(500)
        .parse(entries);
      await transaction(async (c) => {
        for (const comment of data)
          await c.query(
            "INSERT INTO comments(id,artist_id,account_id,body,author,external_id,source) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(account_id,external_id) DO NOTHING",
            [
              randomUUID(),
              aid,
              accountId,
              comment.body,
              comment.author,
              comment.external_id ?? null,
              d.format ?? "manual",
            ],
          );
      });
      return { count: data.length };
    }
    case "update_comment": {
      const comment = await own(userId, "comments", id.parse(d.id));
      await query("UPDATE comments SET status=$2 WHERE id=$1", [
        comment.id,
        z.enum(["new", "reviewed", "archived"]).parse(d.status),
      ]);
      return { ok: true };
    }
    case "save_reply": {
      const reply = await one("SELECT * FROM reply_drafts WHERE id=$1", [
        id.parse(d.id),
      ]);
      if (!reply) throw new AppError("Antwortentwurf fehlt.");
      await own(userId, "comments", reply.comment_id);
      await query("UPDATE reply_drafts SET body=$2,state=$3 WHERE id=$1", [
        reply.id,
        text.parse(d.body),
        z.enum(["draft", "approved", "manually_replied"]).parse(d.state),
      ]);
      return { ok: true };
    }
    case "save_metrics": {
      const pid = id.parse(d.post_id);
      await own(userId, "posts", pid);
      const date = z.iso.datetime({ offset: true }).parse(d.captured_at);
      const source = short.min(1).parse(d.source);
      const values = z
        .object({
          views: z.number().nonnegative().nullable(),
          likes: z.number().nonnegative().nullable(),
          comments: z.number().nonnegative().nullable(),
          shares: z.number().nonnegative().nullable(),
          watchtime: z.number().nonnegative().nullable(),
        })
        .parse(d.values);
      await transaction(async (c) => {
        for (const [metric, value] of Object.entries(values))
          await c.query(
            "INSERT INTO metric_snapshots(id,post_id,metric,value,unit,source,captured_at,quality) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
            [
              randomUUID(),
              pid,
              metric,
              value,
              metric === "watchtime" ? "seconds" : "count",
              source,
              date,
              value === null ? "unavailable" : "manual",
            ],
          );
      });
      return { ok: true };
    }
    case "rate_insight": {
      await own(userId, "insights", id.parse(d.id));
      await query("UPDATE insights SET rating=$2 WHERE id=$1", [
        d.id,
        z.enum(["useful", "uncertain", "rejected"]).parse(d.rating),
      ]);
      return { ok: true };
    }
    case "create_experiment": {
      const insight = await own(userId, "insights", id.parse(d.insight_id));
      const eid = randomUUID();
      await query(
        "INSERT INTO experiments(id,artist_id,insight_id,name,hypothesis,plan) VALUES($1,$2,$3,$4,$5,$6)",
        [
          eid,
          insight.artist_id,
          insight.id,
          short.min(1).parse(d.name),
          insight.claim,
          text.min(1).parse(d.plan),
        ],
      );
      return { id: eid };
    }
    case "queue_ai": {
      if (
        typeof d.kind === "string" &&
        /^(suno_|veo_|image_|auto_|music_video_)/.test(d.kind)
      )
        throw new AppError(
          "Externe Produktion benötigt den eigenen Freigabeweg.",
        );
      const kind = z
        .enum(
          jobKinds.filter(
            (x) =>
              ![
                "render_video",
                "analyze_asset",
                "sync_metrics",
                "prepare_music_package",
              ].includes(x),
          ) as ["health_check", ...any[]],
        )
        .parse(d.kind);
      const aid = d.artist_id ? id.parse(d.artist_id) : null;
      if (aid) await ownArtist(userId, aid);
      if (!aid && kind !== "health_check" && kind !== "artist_concepts")
        throw new AppError("Bitte einen Künstler auswählen.");
      const input = z
        .object({
          prompt: text.default(""),
          provider: z.enum(["codex", "gemini"]).optional(),
          count: z.number().int().min(1).max(10).optional(),
          song_id: id.optional(),
          comment_id: id.optional(),
        })
        .parse(d.input ?? {});
      if (
        input.song_id &&
        (await own(userId, "songs", input.song_id)).artist_id !== aid
      )
        throw new AppError("Song gehört zu anderem Künstler.");
      if (
        input.comment_id &&
        (await own(userId, "comments", input.comment_id)).artist_id !== aid
      )
        throw new AppError("Kommentar gehört zu anderem Künstler.");
      if (
        ["write_lyrics", "revise_lyrics", "prepare_campaign"].includes(kind) &&
        !input.song_id
      )
        throw new AppError("Bitte einen Song auswählen.");
      if (kind === "draft_reply" && !input.comment_id)
        throw new AppError("Bitte einen Kommentar auswählen.");
      return enqueue(userId, aid, kind, input, key);
    }
    case "cancel_job": {
      const jid = id.parse(d.id);
      const job = await one("SELECT * FROM jobs WHERE id=$1 AND user_id=$2", [
        jid,
        userId,
      ]);
      if (!job) throw new AppError("Job fehlt.");
      if (
        ![
          "queued",
          "running",
          "waiting_for_provider",
          "waiting_for_input",
        ].includes(job.state)
      )
        throw new AppError("Job ist bereits beendet.");
      await query(
        "UPDATE jobs SET cancelled_at=now(),state=CASE WHEN state='running' THEN state ELSE 'cancelled' END WHERE id=$1",
        [jid],
      );
      if (job.state !== "running")
        await query(
          "UPDATE budget_reservations SET state='released' WHERE job_id=$1",
          [jid],
        );
      if (job.kind === "suno_generate" && job.state !== "running") {
        await transaction(async (c) => {
          await c.query(
            "UPDATE music_orders SET state='cancelled',error='Vor der Übertragung abgebrochen.' WHERE job_id=$1 AND submitted_at IS NULL",
            [jid],
          );
          await c.query(
            "UPDATE music_credit_reservations SET state='released' WHERE order_id IN (SELECT id FROM music_orders WHERE job_id=$1 AND submitted_at IS NULL)",
            [jid],
          );
        });
      }
      await query(
        "UPDATE workflows SET state='cancelled' WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM jobs WHERE workflow_id=$1 AND state IN ('queued','running','waiting_for_input','waiting_for_provider'))",
        [job.workflow_id],
      );
      return { ok: true };
    }
    case "retry_job": {
      const job = await one("SELECT * FROM jobs WHERE id=$1 AND user_id=$2", [
        id.parse(d.id),
        userId,
      ]);
      if (!job || !["failed", "cancelled"].includes(job.state))
        throw new AppError("Dieser Auftrag kann nicht neu gestartet werden.");
      if (job.side_effect !== "local")
        throw new AppError(
          "Zuerst externen Status klären; kein blinder Neuauftrag.",
        );
      return enqueue(userId, job.artist_id, job.kind, job.input, key);
    }
    case "director_plan": {
      const aid = id.parse(d.artist_id);
      await ownArtist(userId, aid);
      const instruction = text.min(1).parse(d.prompt);
      const allowed = z
        .enum([
          "create_song_ideas",
          "revise_lyrics",
          "prepare_music_generation",
          "create_storyboard",
          "render_video",
          "prepare_campaign",
          "request_approval",
          "analyze_metrics",
        ])
        .parse(d.action_type);
      const target = d.target_id ? id.parse(d.target_id) : null;
      const expected = [
        "revise_lyrics",
        "prepare_music_generation",
        "prepare_campaign",
      ].includes(allowed)
        ? "songs"
        : allowed === "render_video"
          ? "video_projects"
          : allowed === "request_approval"
            ? "posts"
            : null;
      if (expected) {
        if (!target) throw new AppError("Bitte ein Zielobjekt auswählen.");
        if ((await own(userId, expected, target)).artist_id !== aid)
          throw new AppError("Zielobjekt gehört zu anderem Künstler.");
      }
      const action = {
        type: allowed,
        artist_id: aid,
        target_id: target,
        prompt: instruction,
        cost:
          allowed === "render_video"
            ? "Lokale Renderkapazität"
            : "CLI-Kontingent; Geldkosten nicht vom CLI gemeldet",
        requires:
          "Interne Ausführung bestätigen; öffentliche Aktionen bleiben separat freigabepflichtig",
      };
      const mid = randomUUID();
      await query(
        "INSERT INTO director_messages(id,user_id,artist_id,role,body,action) VALUES($1,$2,$3,'assistant',$4,$5)",
        [mid, userId, aid, instruction, json(action)],
      );
      return { id: mid, action };
    }
    case "director_execute": {
      const mid = id.parse(d.id);
      const m = await one(
        "SELECT * FROM director_messages WHERE id=$1 AND user_id=$2",
        [mid, userId],
      );
      if (!m) throw new AppError("Auftrag fehlt.");
      if (m.job_id) return { id: m.job_id };
      const a = m.action;
      let result;
      if (a.type === "render_video")
        result = await command(userId, {
          action: "render_video",
          data: { project_id: a.target_id },
          key: mid,
        });
      else if (a.type === "request_approval")
        result = await command(userId, {
          action: "request_approval",
          data: { post_id: a.target_id },
        });
      else if (a.type === "prepare_music_generation") {
        const lyrics = await one(
          "SELECT id FROM lyrics_versions WHERE song_id=$1 ORDER BY version DESC LIMIT 1",
          [a.target_id],
        );
        if (!lyrics) throw new AppError("Zuerst Lyrics erstellen.");
        result = await command(userId, {
          action: "prepare_music_generation",
          data: { song_id: a.target_id, lyrics_version_id: lyrics.id },
        });
      } else
        result = await enqueue(
          userId,
          a.artist_id,
          a.type,
          { prompt: a.prompt, song_id: a.target_id ?? undefined, count: 5 },
          mid,
        );
      if (
        result?.id &&
        [
          "create_song_ideas",
          "revise_lyrics",
          "create_storyboard",
          "render_video",
          "prepare_campaign",
          "analyze_metrics",
        ].includes(a.type)
      )
        await query("UPDATE director_messages SET job_id=$2 WHERE id=$1", [
          mid,
          result.id,
        ]);
      return result;
    }
    case "delete_artist": {
      const aid = id.parse(d.id);
      const artist = await ownArtist(userId, aid);
      if (d.confirmation !== artist.name)
        throw new AppError(
          "Zur endgültigen Löschung den exakten Künstlernamen bestätigen.",
        );
      const pending = await one(
        "SELECT id FROM jobs WHERE artist_id=$1 AND state IN ('running','queued') LIMIT 1",
        [aid],
      );
      if (pending)
        throw new AppError("Laufende und wartende Jobs zuerst abbrechen.");
      if (
        await one(
          "SELECT id FROM video_generations WHERE artist_id=$1 AND state NOT IN ('succeeded','failed','cancelled') LIMIT 1",
          [aid],
        )
      )
        throw new AppError(
          "Offene Veo-Generierungen zuerst abschließen oder externen Status klären.",
        );
      if (
        await one(
          "SELECT id FROM image_generations WHERE artist_id=$1 AND state NOT IN ('succeeded','failed','cancelled') LIMIT 1",
          [aid],
        )
      )
        throw new AppError(
          "Offene Bildaufträge zuerst abschließen oder externen Status klären.",
        );
      const assets = await query(
        "SELECT storage_key FROM assets WHERE artist_id=$1",
        [aid],
      );
      await transaction(async (c) => {
        for (const a of assets)
          await c.query(
            "INSERT INTO stored_files_gc(storage_key) VALUES($1) ON CONFLICT DO NOTHING",
            [a.storage_key],
          );
        await c.query("DELETE FROM artists WHERE id=$1 AND user_id=$2", [
          aid,
          userId,
        ]);
        await audit(userId, "artist.deleted", aid, {}, c);
      });
      for (const a of assets) {
        try {
          await storage.remove(a.storage_key);
          await query("DELETE FROM stored_files_gc WHERE storage_key=$1", [
            a.storage_key,
          ]);
        } catch {}
      }
      return { ok: true };
    }
    case "update_campaign": {
      const campaign = await own(userId, "campaigns", id.parse(d.id));
      const changes = z
        .object({
          name: short.min(1),
          goal: text,
          budget: z.number().min(0),
          status: z.enum([
            "draft",
            "producing",
            "ready",
            "completed",
            "archived",
          ]),
        })
        .parse(d);
      return transaction((c) =>
        updateVersion(
          "campaigns",
          campaign.id,
          revision.parse(d.version),
          changes,
          c,
        ),
      );
    }
    case "update_experiment": {
      const experiment = await own(userId, "experiments", id.parse(d.id));
      await query("UPDATE experiments SET status=$2,result=$3 WHERE id=$1", [
        experiment.id,
        z
          .enum(["planned", "running", "completed", "cancelled"])
          .parse(d.status),
        text.parse(d.result),
      ]);
      return { ok: true };
    }
    case "production_workflow": {
      const song = await own(userId, "songs", id.parse(d.song_id));
      const settings = await one("SELECT mode FROM settings WHERE user_id=$1", [
        userId,
      ]);
      if (settings!.mode !== "production")
        throw new AppError(
          "Zuerst Produktionsautomatik in den Einstellungen wählen.",
        );
      return transaction(async (c) => {
        const first = await enqueue(
          userId,
          song.artist_id,
          "write_lyrics",
          { song_id: song.id, prompt: text.parse(d.prompt ?? "") },
          key,
          c,
        );
        const packet = await enqueue(
          userId,
          song.artist_id,
          "prepare_music_package",
          { song_id: song.id },
          key + "-package",
          c,
        );
        await c.query(
          "UPDATE jobs SET workflow_id=$2,depends_on=$3 WHERE id=$1",
          [packet.id, first.workflow_id, first.id],
        );
        if (packet.workflow_id !== first.workflow_id)
          await c.query("DELETE FROM workflows WHERE id=$1", [
            packet.workflow_id,
          ]);
        await c.query(
          "UPDATE workflows SET name='Lyrics → Suno-Paket → Audioimport' WHERE id=$1",
          [first.workflow_id],
        );
        return first;
      });
    }
    case "delete_comment": {
      await own(userId, "comments", id.parse(d.id));
      await query("DELETE FROM comments WHERE id=$1", [d.id]);
      await audit(userId, "comment.deleted", String(d.id));
      return { ok: true };
    }
    case "prune_comments": {
      await query(
        "DELETE FROM comments WHERE artist_id IN (SELECT id FROM artists WHERE user_id=$1) AND imported_at<now()-(SELECT retention_days FROM settings WHERE user_id=$1)*interval '1 day'",
        [userId],
      );
      await audit(userId, "comments.retention_applied");
      return { ok: true };
    }
    default:
      throw new AppError("Unbekannte Aktion.", 400);
  }
}
