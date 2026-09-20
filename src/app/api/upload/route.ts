import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ownArtist,
  own,
  requireUser,
  verifyOrigin,
  AppError,
  audit,
} from "@/server/security";
import { saveUpload, storage } from "@/server/storage";
import { one, transaction } from "@/server/db";
import { enqueue } from "@/server/jobs";
export async function POST(request: Request) {
  let saved: any;
  try {
    verifyOrigin(request);
    const user = await requireUser(request);
    const limit = 251 * 1024 * 1024;
    if (Number(request.headers.get("content-length")) > limit)
      throw new AppError("Maximal 250 MB pro Datei.", 413);
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("Datei fehlt.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel();
        throw new AppError("Maximal 250 MB pro Datei.", 413);
      }
      chunks.push(value);
    }
    const buffer = Buffer.concat(chunks);
    const form = await new Response(buffer, {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const artistId = z.string().uuid().parse(form.get("artist_id"));
    await ownArtist(user.id, artistId);
    const songId = form.get("song_id")
      ? z.string().uuid().parse(form.get("song_id"))
      : null;
    if (songId && (await own(user.id, "songs", songId)).artist_id !== artistId)
      throw new AppError("Song gehört zu anderem Künstler.");
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("Datei fehlt.");
    saved = await saveUpload(file.name, Buffer.from(await file.arrayBuffer()));
    const assetId = randomUUID();
    const result = await transaction(async (c) => {
      await c.query(
        "SELECT user_id FROM settings WHERE user_id=$1 FOR UPDATE",
        [user.id],
      );
      const settings = await one(
        "SELECT storage_limit_mb FROM settings WHERE user_id=$1",
        [user.id],
        c,
      );
      const size = await one(
        "SELECT coalesce(sum(bytes),0) AS bytes FROM assets x JOIN artists a ON a.id=x.artist_id WHERE a.user_id=$1",
        [user.id],
        c,
      );
      if (
        Number(size!.bytes) + saved.bytes >
        settings!.storage_limit_mb * 1024 * 1024
      )
        throw new AppError("Speicherbudget überschritten.");
      const source = z
        .string()
        .max(2000)
        .parse(form.get("origin") || "Manueller Import");
      await c.query(
        "INSERT INTO assets(id,artist_id,song_id,kind,name,storage_key,mime,bytes,sha256,metadata,origin) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          assetId,
          artistId,
          songId,
          saved.kind,
          file.name,
          saved.storage_key,
          saved.mime,
          saved.bytes,
          saved.sha256,
          JSON.stringify(saved.metadata),
          source,
        ],
      );
      if (songId && saved.kind === "audio") {
        const orderId = form.get("order_id")
          ? z.string().uuid().parse(form.get("order_id"))
          : null;
        const order = orderId
          ? await one(
              "SELECT * FROM music_orders WHERE id=$1 AND song_id=$2",
              [orderId, songId],
              c,
            )
          : null;
        if (orderId && !order)
          throw new AppError("Produktionsauftrag passt nicht zum Song.");
        const lyricsId =
          order?.lyrics_version_id ||
          (form.get("lyrics_version_id")
            ? z.string().uuid().parse(form.get("lyrics_version_id"))
            : null);
        if (
          lyricsId &&
          !(await one(
            "SELECT id FROM lyrics_versions WHERE id=$1 AND song_id=$2",
            [lyricsId, songId],
            c,
          ))
        )
          throw new AppError("Lyrics-Zuordnung ungültig.");
        const externalUrl = z
          .union([z.url(), z.literal("")])
          .parse(form.get("external_url") || "");
        const generatedAt = form.get("generated_at")
          ? z.iso.datetime({ offset: true }).parse(form.get("generated_at"))
          : null;
        await c.query(
          "INSERT INTO audio_variants(id,song_id,asset_id,order_id,lyrics_version_id,label,external_url,external_id,generated_at,generation_info,clip_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          [
            randomUUID(),
            songId,
            assetId,
            orderId,
            lyricsId,
            file.name,
            externalUrl,
            String(form.get("external_id") ?? "").slice(0, 200),
            generatedAt,
            JSON.stringify({
              model: String(form.get("model") ?? "").slice(0, 200),
              settings: String(form.get("generation_settings") ?? "").slice(
                0,
                4000,
              ),
            }),
            Math.min(30, saved.metadata.duration),
          ],
        );
        if (orderId)
          await c.query(
            "UPDATE music_orders SET state='succeeded' WHERE id=$1",
            [orderId],
          );
      }
      if (["audio", "video"].includes(saved.kind))
        await enqueue(
          user.id,
          artistId,
          "analyze_asset",
          { asset_id: assetId },
          "analyze:" + assetId,
          c,
        );
      await audit(
        user.id,
        "asset.imported",
        assetId,
        { name: file.name, sha256: saved.sha256 },
        c,
      );
      return { id: assetId, kind: saved.kind };
    });
    return NextResponse.json(result);
  } catch (e) {
    if (saved) await storage.remove(saved.storage_key).catch(() => {});
    return NextResponse.json(
      { error: (e as Error).message },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
