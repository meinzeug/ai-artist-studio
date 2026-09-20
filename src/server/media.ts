import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { runProcess } from "@/lib/process";
import { timelineSchema } from "@/lib/domain";
import { storage, probe } from "./storage";
import { hash } from "./security";
const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
function assTime(seconds: number) {
  const cent = Math.round(seconds * 100);
  return `${Math.floor(cent / 360000)}:${String(Math.floor(cent / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cent / 100) % 60).padStart(2, "0")}.${String(cent % 100).padStart(2, "0")}`;
}
export function assText(text: string) {
  return text
    .replace(/\\/g, "")
    .replace(/[{}]/g, "")
    .replace(/\r/g, "")
    .replace(/\n/g, "\\N");
}
export function makeAss(timeline: any) {
  const t = timelineSchema.parse(timeline);
  const color =
    "&H00" + t.color.slice(5, 7) + t.color.slice(3, 5) + t.color.slice(1, 3);
  const margin = Math.round(1920 * (1 - t.text_y));
  return (
    `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DejaVu Sans,${t.font_size},${color},&H000000FF,&H00101018,&H90000000,-1,0,0,0,100,100,0,0,1,3,1,2,90,160,${margin},1\nStyle: Title,DejaVu Sans,48,&H00FFFFFF,&H000000FF,&H00101018,&H90000000,-1,0,0,0,100,100,0,0,1,2,1,8,90,160,230,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` +
    (t.title
      ? `Dialogue: 0,0:00:00.00,${assTime(t.end - t.start)},Title,,0,0,0,,${assText(t.title)}\n`
      : "") +
    t.subtitles
      .map(
        (s) =>
          `Dialogue: 1,${assTime(s.start)},${assTime(s.end)},Default,,0,0,0,,${assText(s.text)}`,
      )
      .join("\n")
  );
}
export async function analyzeAudio(file: string, signal?: AbortSignal) {
  const temp = await mkdtemp(path.join(tmpdir(), "studio-audio-"));
  try {
    const pcm = path.join(temp, "samples.pcm");
    const r = await runProcess(
      "ffmpeg",
      [
        "-v",
        "info",
        "-threads",
        "2",
        "-i",
        file,
        "-map",
        "0:a:0",
        "-af",
        "ebur128=peak=true",
        "-ac",
        "1",
        "-ar",
        "2000",
        "-f",
        "f32le",
        "-y",
        pcm,
      ],
      { timeout: 180000, signal, maxBytes: 16_000_000 },
    );
    if (r.code) throw new Error("Audioanalyse fehlgeschlagen.");
    const data = await readFile(pcm);
    const n = Math.floor(data.length / 4),
      step = Math.max(1, Math.ceil(n / 240));
    const waveform = [];
    for (let i = 0; i < n; i += step) {
      let peak = 0;
      for (let j = i; j < Math.min(n, i + step); j++)
        peak = Math.max(peak, Math.abs(data.readFloatLE(j * 4)));
      waveform.push(Math.round(peak * 10000) / 10000);
    }
    const lufs = [...r.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)?.[1];
    const peak = [...r.stderr.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].at(-1)?.[1];
    return {
      waveform,
      lufs: lufs ? Number(lufs) : null,
      true_peak_db: peak ? Number(peak) : null,
      warnings:
        peak && Number(peak) >= 0
          ? ["Peak erreicht oder überschreitet 0 dBFS."]
          : [],
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
export async function renderVideo(
  project: any,
  assets: Record<string, any>[],
  audio: any,
  onProgress: (n: number) => Promise<void>,
  signal?: AbortSignal,
) {
  const t = timelineSchema.parse(project.timeline);
  const duration = t.end - t.start,
    fps = Number(t.fps);
  const temp = await mkdtemp(path.join(tmpdir(), "studio-render-"));
  const byId = new Map(assets.map((a) => [a.id, a]));
  try {
    await writeFile(path.join(temp, "captions.ass"), makeAss(t));
    const scenes =
      project.template === "scenes" ? t.scenes : [{ ...t.scenes[0], duration }];
    let used = 0;
    const parts = [];
    for (let i = 0; i < scenes.length && used < duration; i++) {
      const s = scenes[i],
        asset = byId.get(s.asset_id);
      if (!asset) throw new Error("Szenen-Asset fehlt.");
      const length = Math.min(s.duration, duration - used);
      const input =
        asset.kind === "image"
          ? [
              "-loop",
              "1",
              "-framerate",
              String(fps),
              "-i",
              storage.path(asset.storage_key),
            ]
          : ["-stream_loop", "-1", "-i", storage.path(asset.storage_key)];
      let filter = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-out_w)*${s.crop_x}:(in_h-out_h)*${s.crop_y},setsar=1,fps=${fps}`;
      if (s.motion && asset.kind === "image")
        filter += `,zoompan=z='min(zoom+0.00015,1.035)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1080x1920:fps=${fps}`;
      if (project.template === "scenes" && t.transition === "fade")
        filter += `,fade=t=in:st=0:d=0.25,fade=t=out:st=${Math.max(0, length - 0.25)}:d=0.25`;
      const part = `scene-${i}.mp4`;
      const result = await runProcess(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-threads",
          "2",
          ...input,
          "-vf",
          filter,
          "-t",
          String(length),
          "-an",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "20",
          "-pix_fmt",
          "yuv420p",
          "-threads",
          "2",
          "-y",
          path.join(temp, part),
        ],
        { timeout: 600000, signal },
      );
      if (result.code)
        throw new Error(
          "Szenenrendering fehlgeschlagen: " + result.stderr.slice(-1500),
        );
      parts.push(`file '${part}'`);
      used += length;
      await onProgress(Math.round((used / duration) * 60));
    }
    if (used < duration - 0.04)
      throw new Error(
        "Die Szenen decken den Audioausschnitt nicht vollständig ab.",
      );
    await writeFile(path.join(temp, "concat.txt"), parts.join("\n"));
    const output = path.join(temp, "output.mp4");
    let filter = "[0:v]ass=captions.ass[v]";
    if (project.template === "visualizer")
      filter =
        "[1:a]asplit[a][wave];[wave]showwaves=s=880x220:mode=cline:colors=0xff875d:rate=" +
        fps +
        ",format=rgba[w];[0:v][w]overlay=100:1380,ass=captions.ass[v]";
    const result = await runProcess(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-threads",
        "2",
        "-f",
        "concat",
        "-safe",
        "1",
        "-i",
        "concat.txt",
        "-ss",
        String(t.start),
        "-t",
        String(duration),
        "-i",
        storage.path(audio.storage_key),
        "-filter_complex_threads",
        "1",
        "-filter_complex",
        filter,
        "-map",
        "[v]",
        "-map",
        project.template === "visualizer" ? "[a]" : "1:a:0",
        "-t",
        String(duration),
        "-c:v",
        "libx264",
        "-preset",
        t.quality === "high" ? "medium" : "veryfast",
        "-crf",
        t.quality === "preview" ? "28" : t.quality === "high" ? "18" : "22",
        "-threads",
        "2",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
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
            void onProgress(
              60 +
                Math.min(38, Math.round((Number(m[1]) / 1e6 / duration) * 38)),
            );
        },
      },
    );
    if (result.code)
      throw new Error(
        "Video-Rendering fehlgeschlagen: " + result.stderr.slice(-1500),
      );
    const data = await readFile(output),
      key = randomUUID() + ".mp4";
    const metadata = await probe(output);
    await storage.put(key, data);
    await onProgress(100);
    return {
      storage_key: key,
      bytes: data.length,
      sha256: hash(data),
      metadata,
      mime: "video/mp4",
      kind: "video",
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
export async function videoCover(file: string, signal?: AbortSignal) {
  const temp = await mkdtemp(path.join(tmpdir(), "studio-cover-"));
  try {
    const target = path.join(temp, "cover.jpg");
    const result = await runProcess(
      "ffmpeg",
      [
        "-v",
        "error",
        "-threads",
        "2",
        "-i",
        file,
        "-frames:v",
        "1",
        "-vf",
        "scale=1080:1920:force_original_aspect_ratio=decrease",
        "-q:v",
        "3",
        "-y",
        target,
      ],
      { timeout: 45000, signal },
    );
    if (result.code)
      throw new Error("Cover konnte nicht aus dem Video erstellt werden.");
    const bytes = await readFile(target),
      key = randomUUID() + ".jpg";
    await storage.put(key, bytes);
    return {
      storage_key: key,
      bytes: bytes.length,
      sha256: hash(bytes),
      mime: "image/jpeg",
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
