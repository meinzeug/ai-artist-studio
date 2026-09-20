import { mkdir, writeFile, readFile, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { AppError, hash, validFilename } from "./security";
import { runProcess } from "@/lib/process";
export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  path(key: string): string;
}
export class LocalStorage implements Storage {
  root = path.resolve(
    /*turbopackIgnore: true*/ process.env.STORAGE_ROOT ?? "data/assets",
  );
  path(key: string) {
    if (!/^[a-f\d-]+\.[a-z\d]+$/.test(key))
      throw new AppError("Ungültiger Speicherschlüssel.");
    return path.join(this.root, key);
  }
  async put(key: string, data: Buffer) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await writeFile(this.path(key), data, { mode: 0o600, flag: "wx" });
  }
  get(key: string) {
    return readFile(this.path(key));
  }
  async remove(key: string) {
    await unlink(this.path(key)).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}
export const storage = new LocalStorage();
export async function probe(file: string) {
  const r = await runProcess(
    "ffprobe",
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", file],
    { timeout: 20000 },
  );
  if (r.code) throw new AppError("Die Mediendatei kann nicht gelesen werden.");
  const parsed = JSON.parse(r.stdout);
  const duration = Number(parsed.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 14400)
    throw new AppError("Mediendauer ungültig oder länger als vier Stunden.");
  return {
    duration,
    format: parsed.format.format_name,
    streams: parsed.streams.map((s: any) => ({
      type: s.codec_type,
      codec: s.codec_name,
      attached_pic: s.disposition?.attached_pic === 1,
      width: s.width,
      height: s.height,
      sample_rate: s.sample_rate,
      channels: s.channels,
      pix_fmt: s.pix_fmt,
      frame_rate: s.avg_frame_rate,
    })),
  };
}
export async function saveUpload(name: string, buffer: Buffer) {
  validFilename(name);
  if (!buffer.length || buffer.length > 250 * 1024 * 1024)
    throw new AppError("Datei muss zwischen 1 Byte und 250 MB groß sein.");
  const type = await fileTypeFromBuffer(buffer);
  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
    "audio/flac",
    "audio/ogg",
    "video/mp4",
    "video/webm",
    "application/pdf",
  ];
  if (!type || !allowed.includes(type.mime))
    throw new AppError(
      "Nicht unterstützter Dateiinhalt. Erlaubt: JPEG, PNG, WebP, MP3, WAV, FLAC, OGG, MP4, WebM, PDF.",
    );
  const key = randomUUID() + "." + type.ext;
  await storage.put(key, buffer);
  try {
    let metadata: any = {};
    let kind = "document";
    if (type.mime.startsWith("image/")) {
      const m = await sharp(buffer, { limitInputPixels: 40000000 }).metadata();
      await sharp(buffer, { limitInputPixels: 40000000 })
        .resize(64, 64)
        .raw()
        .toBuffer();
      metadata = { width: m.width, height: m.height };
      kind = "image";
    } else if (
      type.mime.startsWith("audio/") ||
      type.mime.startsWith("video/")
    ) {
      metadata = await probe(storage.path(key));
      // ffprobe reports embedded album covers as video streams. Preserve
      // their metadata, but only moving-image streams make this a video.
      const hasVideo = metadata.streams.some(
        (s: any) => s.type === "video" && !s.attached_pic,
      );
      const hasAudio = metadata.streams.some((s: any) => s.type === "audio");
      if (!hasVideo && !hasAudio)
        throw new AppError("Keine Audio- oder Videospur vorhanden.");
      kind = hasVideo ? "video" : "audio";
    }
    return {
      storage_key: key,
      mime: type.mime,
      bytes: buffer.length,
      sha256: hash(buffer),
      kind,
      metadata,
    };
  } catch (e) {
    await storage.remove(key);
    throw e;
  }
}
export async function storageBytes() {
  await mkdir(storage.root, { recursive: true });
  return (await stat(storage.root)).size;
}
