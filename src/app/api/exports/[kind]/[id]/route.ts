import { ZipArchive } from "archiver";
import { PassThrough, Readable } from "node:stream";
import { requireUser, own, AppError, audit } from "@/server/security";
import { one, query } from "@/server/db";
import { activeApproval } from "@/server/approval";
import { storage } from "@/server/storage";
import { z } from "zod";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const user = await requireUser(request),
      { kind, id: objectId } = await params;
    const object = z.string().uuid().parse(objectId);
    const output = new PassThrough(),
      archive = new ZipArchive({ zlib: { level: 5 } });
    archive.on("error", (e) => output.destroy(e));
    archive.pipe(output);
    let name = "studio-export";
    if (kind === "suno") {
      const order = await one("SELECT * FROM music_orders WHERE id=$1", [
        object,
      ]);
      if (!order) throw new AppError("Produktionsauftrag fehlt.", 404);
      await own(user.id, "songs", order.song_id);
      name = order.production_number;
      archive.append(JSON.stringify(order.package, null, 2), {
        name: "production.json",
      });
      archive.append(
        `${order.production_number}\n\n${order.package.title}\n\nLYRICS\n${order.package.lyrics}\n\nSTIL\n${order.package.style_prompt}\n\nNEGATIVVORGABEN (nur soweit unterstützt)\n${order.package.negative_prompt}\n\nAUSSPRACHE\n${order.package.pronunciation}\n\nNOTIZEN\n${order.package.notes}\n\n${order.package.note}`,
        { name: "produktion.txt" },
      );
    } else if (kind === "post") {
      const post = await own(user.id, "posts", object);
      const { snapshot } = await activeApproval(object);
      name = "TIKTOK-" + post.id.slice(0, 8);
      const asset = await own(user.id, "assets", post.asset_id);
      archive.file(storage.path(asset.storage_key), { name: "video.mp4" });
      if (post.cover_id) {
        const cover = await own(user.id, "assets", post.cover_id);
        archive.file(storage.path(cover.storage_key), {
          name: "cover." + cover.storage_key.split(".").at(-1),
        });
      }
      archive.append(post.caption + "\n\n" + post.hashtags, {
        name: "caption.txt",
      });
      archive.append(JSON.stringify(snapshot, null, 2), {
        name: "freigabe.json",
      });
      archive.append(
        `# Veröffentlichung ${name}\n\n- [ ] Richtiges TikTok-Konto: ${snapshot.account_label}\n- [ ] Video und Ton vollständig geprüft\n- [ ] Rechte und kommerzielle Nutzung geprüft\n- [ ] KI-Kennzeichnung ${post.is_aigc ? "aktivieren" : "prüfen"}\n- [ ] Kommerzielle Inhalte ${post.commercial ? "kennzeichnen" : "prüfen"}\n- [ ] Privatsphäre bewusst wählen: ${post.privacy}\n- [ ] Caption und Interaktionen prüfen\n- [ ] Manuell in TikTok veröffentlichen\n- [ ] Link und tatsächlichen Zeitpunkt im Studio eintragen\n\nEin Export ist keine Veröffentlichung. Die Bestätigung im Studio bleibt ohne API-Verifikation ein manueller Nachweis.`,
        { name: "checkliste.md" },
      );
      await audit(user.id, "post.exported", object);
    } else if (kind === "project") {
      const p = await own(user.id, "video_projects", object);
      name = "VIDEO-" + p.id.slice(0, 8);
      archive.append(JSON.stringify(p, null, 2), { name: "project.json" });
      const variant = await one("SELECT * FROM audio_variants WHERE id=$1", [
        p.variant_id,
      ]);
      const ids = [
        variant!.asset_id,
        ...p.timeline.scenes.map((x: any) => x.asset_id),
      ];
      for (const aid of new Set(ids)) {
        const asset = await own(user.id, "assets", aid as string);
        archive.file(storage.path(asset.storage_key), {
          name: asset.storage_key,
        });
      }
    } else if (kind === "artist") {
      const a = await one("SELECT * FROM artists WHERE id=$1 AND user_id=$2", [
        object,
        user.id,
      ]);
      if (!a) throw new AppError("Künstler fehlt.", 404);
      name = "ARTIST-" + object.slice(0, 8);
      const data: any = { artist: a };
      for (const table of [
        "identity_versions",
        "artist_references",
        "ideas",
        "songs",
        "assets",
        "video_projects",
        "video_generations",
        "campaigns",
        "posts",
        "comments",
        "insights",
        "experiments",
      ])
        data[table] = await query(`SELECT * FROM ${table} WHERE artist_id=$1`, [
          object,
        ]);
      const related: Record<string, string> = {
        lyrics_versions: "lyrics_versions x JOIN songs s ON s.id=x.song_id",
        music_orders: "music_orders x JOIN songs s ON s.id=x.song_id",
        audio_variants: "audio_variants x JOIN songs s ON s.id=x.song_id",
        renders: "renders x JOIN video_projects s ON s.id=x.project_id",
        rights_records: "rights_records x JOIN assets s ON s.id=x.asset_id",
        approvals: "approvals x JOIN posts s ON s.id=x.post_id",
        publication_attempts:
          "publication_attempts x JOIN posts s ON s.id=x.post_id",
        metric_snapshots: "metric_snapshots x JOIN posts s ON s.id=x.post_id",
        reply_drafts: "reply_drafts x JOIN comments s ON s.id=x.comment_id",
      };
      for (const [key, join] of Object.entries(related))
        data[key] = await query(
          `SELECT x.* FROM ${join} WHERE s.artist_id=$1`,
          [object],
        );
      data.social_accounts = await query(
        "SELECT id,artist_id,platform,label,external_id,scopes,status,last_sync_at FROM social_accounts WHERE artist_id=$1",
        [object],
      );
      data.workflows = await query(
        "SELECT * FROM workflows WHERE artist_id=$1",
        [object],
      );
      data.jobs = await query("SELECT * FROM jobs WHERE artist_id=$1", [
        object,
      ]);
      archive.append(JSON.stringify(data, null, 2), {
        name: "artist-data.json",
      });
      for (const asset of data.assets)
        archive.file(storage.path(asset.storage_key), {
          name: "assets/" + asset.storage_key,
        });
    } else throw new AppError("Unbekannter Export.", 404);
    void archive.finalize();
    return new Response(Readable.toWeb(output) as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${name}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
