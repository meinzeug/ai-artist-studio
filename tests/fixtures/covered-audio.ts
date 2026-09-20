import path from "node:path";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { runProcess } from "../../src/lib/process";

// Locally generated test tone and solid colour cover; no customer media.
export async function coveredAudioFixture(dir: string) {
  await mkdir(dir, { recursive: true });
  const cover = path.join(dir, "SYNTHETIC-COVER.jpg"),
    plain = path.join(dir, "SYNTHETIC-AUDIO.mp3"),
    covered = path.join(dir, "SYNTHETIC-AUDIO-WITH-COVER.mp3"),
    video = path.join(dir, "SYNTHETIC-VIDEO.mp4");
  await sharp({
    create: { width: 360, height: 360, channels: 3, background: "#8866aa" },
  })
    .jpeg()
    .toFile(cover);
  const ffmpeg = async (args: string[]) => {
    const r = await runProcess("ffmpeg", ["-v", "error", "-y", ...args], {
      timeout: 20000,
    });
    if (r.code) throw new Error(r.stderr);
  };
  await ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=44100:duration=3",
    "-c:a",
    "libmp3lame",
    plain,
  ]);
  await ffmpeg([
    "-i",
    plain,
    "-i",
    cover,
    "-map",
    "0:a:0",
    "-map",
    "1:v:0",
    "-c",
    "copy",
    "-id3v2_version",
    "3",
    "-disposition:v:0",
    "attached_pic",
    covered,
  ]);
  await ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=180x320:d=1",
    "-i",
    plain,
    "-t",
    "1",
    "-c:v",
    "libx264",
    "-threads",
    "1",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    video,
  ]);
  return { cover, plain, covered, video };
}
