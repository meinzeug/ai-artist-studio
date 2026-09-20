import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { coveredAudioFixture } from "./fixtures/covered-audio";

const dir = await mkdtemp(path.join(os.tmpdir(), "studio-media-test-"));
process.env.STORAGE_ROOT = path.join(dir, "assets");
const { saveUpload, storage } = await import("../src/server/storage");
const { pool } = await import("../src/server/db");
let files: Awaited<ReturnType<typeof coveredAudioFixture>>;
before(async () => {
  files = await coveredAudioFixture(dir);
});
after(async () => {
  await pool.end();
  await rm(dir, { recursive: true, force: true });
});

test("MP3 mit eingebettetem Cover bleibt Audio; Original und Cover bleiben unverändert", async () => {
  const bytes = await readFile(files.covered);
  const asset = await saveUpload("SYNTHETIC-AUDIO-WITH-COVER.mp3", bytes);
  assert.equal(asset.kind, "audio");
  assert.equal(asset.mime, "audio/mpeg");
  assert.ok(asset.metadata.duration >= 3 && asset.metadata.duration < 3.1);
  assert.ok(
    asset.metadata.streams.some(
      (s: any) => s.type === "audio" && s.codec === "mp3",
    ),
  );
  assert.ok(
    asset.metadata.streams.some(
      (s: any) => s.type === "video" && s.attached_pic === true,
    ),
  );
  assert.equal(asset.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual(await storage.get(asset.storage_key), bytes);
});

test("MP3 ohne Cover wird weiterhin als Audio erkannt", async () => {
  const asset = await saveUpload(
    "SYNTHETIC-AUDIO.mp3",
    await readFile(files.plain),
  );
  assert.equal(asset.kind, "audio");
  assert.equal(asset.metadata.streams.length, 1);
  assert.equal(asset.metadata.streams[0].attached_pic, false);
});

test("Echte Videospur mit Ton bleibt Video, auch bei irreführendem MP3-Dateinamen", async () => {
  const asset = await saveUpload(
    "SYNTHETIC-FAKE.mp3",
    await readFile(files.video),
  );
  assert.equal(asset.kind, "video");
  assert.equal(asset.mime, "video/mp4");
  assert.ok(
    asset.metadata.streams.some(
      (s: any) => s.type === "video" && s.attached_pic === false,
    ),
  );
  assert.ok(asset.metadata.streams.some((s: any) => s.type === "audio"));
});
