import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runProcess } from "../lib/process";
import { timelineSchema } from "../lib/domain";
import { storage, probe } from "./storage";
import { hash } from "./security";
import { makeAss } from "./media";

// At most two image inputs at a time: a long xfade chain buffers too much
// memory on the 2 GB deployment host. Core shots and short transitions are
// rendered separately and concatenated before one final encode/audio mux.
export function motionFilter(
  s: any,
  fps: number,
  totalFrames: number,
  offset = 0,
) {
  const progress = `min(1,(on+${offset})/${Math.max(1, totalFrames - 1)})`;
  const base = s.zoom_base ?? 1.02;
  const zoom =
    s.motion === false
      ? String(base)
      : s.camera === "pull_out"
        ? `${base + 0.09}-.09*${progress}`
        : s.camera === "push_in"
          ? `${base}+.09*${progress}`
          : String(base + 0.08);
  const center = "(iw-iw/zoom)/2",
    y = "(ih-ih/zoom)/2";
  const x =
    s.motion === false
      ? center
      : s.camera === "pan_left"
        ? `(iw-iw/zoom)*(1-${progress})`
        : s.camera === "pan_right"
          ? `(iw-iw/zoom)*${progress}`
          : center;
  return `scale=1440:2560:force_original_aspect_ratio=increase,crop=1440:2560:(in_w-out_w)*${s.crop_x}:(in_h-out_h)*${s.crop_y},setsar=1,zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=1080x1920:fps=${fps},format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS`;
}
export async function renderFullMusicVideo(
  project: any,
  assets: any[],
  audio: any,
  progress: (n: number) => Promise<void>,
  signal?: AbortSignal,
) {
  const t = timelineSchema.parse(project.timeline),
    duration = t.end - t.start,
    fps = Number(t.fps);
  const temp = await mkdtemp(path.join(tmpdir(), "studio-music-video-")),
    byId = new Map(assets.map((a) => [a.id, a]));
  try {
    const totalFrames = Math.ceil(duration * fps),
      shots = t.scenes.map((s) => ({
        ...s,
        frames: Math.round(s.duration * fps),
      }));
    const provided = shots.reduce((n, s) => n + s.frames, 0);
    if (Math.abs(provided - totalFrames) > shots.length || !shots.length)
      throw new Error(
        "Musikvideo-Szenen müssen die gesamte Aufnahme abdecken.",
      );
    shots[shots.length - 1].frames += totalFrames - provided;
    if (shots.some((s) => s.frames < 1))
      throw new Error("Szenendauer ungültig.");
    const overlaps = shots.map((s, i) =>
      i === shots.length - 1 || t.transition === "cut"
        ? 0
        : Math.min(
            Math.round(fps * 0.6),
            Math.floor(s.frames / 3),
            Math.floor(shots[i + 1].frames / 3),
          ),
    );
    const input = (s: any) => {
      const asset = byId.get(s.asset_id);
      if (!asset || asset.kind !== "image")
        throw new Error(
          "Das vollständige Bild-Musikvideo benötigt ein Bild pro Einstellung.",
        );
      return [
        "-loop",
        "1",
        "-framerate",
        String(fps),
        "-i",
        storage.path(asset.storage_key),
      ];
    };
    const codec = [
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "18",
      "-threads",
      "2",
      "-pix_fmt",
      "yuv420p",
      "-video_track_timescale",
      "90000",
    ];
    const ff = async (args: string[]) => {
      const r = await runProcess(
        "ffmpeg",
        [
          "-hide_banner",
          "-v",
          "error",
          "-threads",
          "2",
          "-filter_threads",
          "1",
          ...args,
        ],
        { cwd: temp, timeout: 900000, signal, maxBytes: 2_000_000 },
      );
      if (r.code)
        throw new Error(
          "Musikvideo-Rendering fehlgeschlagen: " + r.stderr.slice(-1200),
        );
    };
    const parts: string[] = [];
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i],
        before = i ? overlaps[i - 1] : 0,
        fullFrames = s.frames + overlaps[i],
        core = s.frames - before,
        filename = `shot-${i}.mp4`;
      await ff([
        ...input(s),
        "-vf",
        motionFilter(s, fps, fullFrames, before),
        "-frames:v",
        String(core),
        ...codec,
        "-y",
        filename,
      ]);
      parts.push(`file '${filename}'`);
      if (overlaps[i]) {
        const next = shots[i + 1],
          transition = `transition-${i}.mp4`,
          frames = overlaps[i];
        // fade from the outgoing tail into the incoming head; no black frames.
        const filter = `[0:v]${motionFilter(s, fps, fullFrames, s.frames)}[a];[1:v]${motionFilter(next, fps, next.frames + overlaps[i + 1], 0)}[b];[a][b]xfade=transition=fade:duration=${frames / fps}:offset=0,format=yuv420p[v]`;
        await ff([
          ...input(s),
          ...input(next),
          "-filter_complex_threads",
          "1",
          "-filter_complex",
          filter,
          "-map",
          "[v]",
          "-frames:v",
          String(frames),
          ...codec,
          "-y",
          transition,
        ]);
        parts.push(`file '${transition}'`);
      }
      await progress(Math.round(((i + 1) / shots.length) * 75));
    }
    await writeFile(path.join(temp, "concat.txt"), parts.join("\n"));
    await writeFile(path.join(temp, "captions.ass"), makeAss(t));
    const output = path.join(temp, "output.mp4");
    const r = await runProcess(
      "ffmpeg",
      [
        "-hide_banner",
        "-v",
        "error",
        "-threads",
        "2",
        "-filter_threads",
        "1",
        "-f",
        "concat",
        "-safe",
        "1",
        "-i",
        "concat.txt",
        "-ss",
        String(t.start),
        "-i",
        storage.path(audio.storage_key),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-vf",
        "ass=captions.ass",
        "-t",
        String(duration),
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        t.quality === "preview" ? "27" : t.quality === "high" ? "18" : "21",
        "-threads",
        "2",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "256k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        "-progress",
        "pipe:2",
        "-y",
        output,
      ],
      {
        cwd: temp,
        timeout: 900000,
        signal,
        onStderr: (s) => {
          const m = s.match(/out_time_us=(\d+)/);
          if (m)
            void progress(
              75 +
                Math.min(24, Math.round((Number(m[1]) / 1e6 / duration) * 24)),
            );
        },
      },
    );
    if (r.code)
      throw new Error(
        "Musikvideo konnte nicht fertiggestellt werden: " +
          r.stderr.slice(-1200),
      );
    const metadata = await probe(output);
    if (Math.abs(metadata.duration - duration) > 0.15)
      throw new Error("Gerenderte Vollversion hat eine abweichende Laufzeit.");
    const bytes = await readFile(output),
      storage_key = randomUUID() + ".mp4";
    await storage.put(storage_key, bytes);
    await progress(100);
    return {
      storage_key,
      bytes: bytes.length,
      sha256: hash(bytes),
      metadata: {
        ...metadata,
        full_song: true,
        scene_count: new Set(shots.map((s) => s.asset_id)).size,
        shot_count: shots.length,
        timing: "lyric_story_order_not_audio_alignment",
      },
      mime: "video/mp4",
      kind: "video",
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
