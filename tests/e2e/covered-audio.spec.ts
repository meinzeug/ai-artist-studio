import { test, expect } from "@playwright/test";
import pg from "pg";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { coveredAudioFixture } from "../fixtures/covered-audio";
import { runProcess } from "../../src/lib/process";

test("Manuelle Musikaufgabe: MP3 mit Cover übernehmen und drei echte Videos rendern", async ({
  page,
  context,
}) => {
  test.setTimeout(240000);
  page.setDefaultTimeout(15000);
  const url = process.env.TEST_DATABASE_URL!;
  if (new URL(url).pathname !== "/artist_studio_test")
    throw new Error("Nur isolierte Testdatenbank");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  const user = randomUUID(),
    token = randomBytes(32).toString("hex"),
    sid = createHash("sha256").update(token).digest("hex"),
    runId = randomUUID(),
    taskId = randomUUID(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  let artistId: string | undefined;
  try {
    await db.query(
      "INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test-session-only')",
      [user, `covered-audio-${user}@example.invalid`],
    );
    await db.query("INSERT INTO settings(user_id,setup_step) VALUES($1,9)", [
      user,
    ]);
    await db.query(
      "INSERT INTO sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [sid, user],
    );
    await context.addCookies([
      {
        name: "studio_session",
        value: token,
        url: "http://127.0.0.1:3212",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const headers = { Origin: "http://127.0.0.1:3212" };
    const cmd = async (action: string, data: any) => {
      const r = await page.request.post("/api/command", {
        headers,
        data: { action, data },
      });
      expect(r.ok(), await r.text()).toBeTruthy();
      return r.json();
    };
    const state = async () => (await page.request.get("/api/state")).json();
    artistId = (
      await cmd("create_artist", {
        name: "TEST · MP3 mit Cover",
        genre: "Synthetische Testdaten",
      })
    ).id;
    const song = await cmd("create_song", {
      artist_id: artistId,
      title: "SYNTHETISCHER COVER-IMPORT",
    });
    const lyrics = await cmd("save_lyrics", {
      song_id: song.id,
      base_version: 0,
      title: "SYNTHETISCHER COVER-IMPORT",
      lyrics: "[Chorus]\nDies ist nur ein Softwaretest",
      style_prompt: "Synthetischer Testton",
    });
    const order = await cmd("prepare_music_generation", {
      song_id: song.id,
      lyrics_version_id: lyrics.id,
    });
    await cmd("image_configure", {
      provider: "manual",
      version: 0,
      daily_limit: 10,
      monthly_limit: 100,
    });
    const files = await coveredAudioFixture(".local/e2e-covered-audio"),
      bytes = await readFile(files.covered);
    const picResponse = await page.request.post("/api/upload", {
      headers,
      multipart: {
        artist_id: artistId!,
        file: {
          name: "SYNTHETIC-COVER.jpg",
          mimeType: "image/jpeg",
          buffer: await readFile(files.cover),
        },
      },
    });
    expect(picResponse.ok(), await picResponse.text()).toBeTruthy();
    const portrait = await picResponse.json();
    const plan = {
      scene_prompt: "Synthetisches Testbild",
      clips: ["opening", "middle", "ending"].map((segment, i) => ({
        segment,
        overlay: `Testclip ${i + 1}`,
      })),
    };
    // Seed the pre-upload state, without AI calls or external generations.
    await db.query("BEGIN");
    await db.query(
      "INSERT INTO artist_automations(artist_id,user_id,reference_asset_id,music_mode,next_run_at) VALUES($1,$2,$3,'manual',now()+interval '1 day')",
      [artistId, user, portrait.id],
    );
    await db.query(
      "INSERT INTO automation_runs(id,user_id,artist_id,local_day,stage,state,song_id,music_order_id,creative_plan,music_mode,identity_ready) VALUES($1,$2,$3,current_date,'music','waiting_for_input',$4,$5,$6,'manual',true)",
      [runId, user, artistId, song.id, order.id, JSON.stringify(plan)],
    );
    await db.query(
      "INSERT INTO manual_tasks(id,user_id,artist_id,run_id,task_key,kind,title) VALUES($1,$2,$3,$4,'music','produce_music','Testaufnahme aus Suno übernehmen')",
      [taskId, user, artistId, runId],
    );
    for (let i = 0; i < 3; i++)
      await db.query(
        "INSERT INTO automation_clips(id,run_id,position,title,caption,hashtags) VALUES($1,$2,$3,$4,$5,'#Softwaretest')",
        [
          randomUUID(),
          runId,
          i,
          `Testclip ${i + 1}`,
          `Synthetischer Testclip ${i + 1}, keine Suno-Liveproduktion.`,
        ],
      );
    await db.query("COMMIT");
    const uploadFields = {
      artist_id: artistId!,
      song_id: song.id,
      order_id: order.id,
      manual_task_id: taskId,
    };
    const audio = {
      name: "SYNTHETIC-AUDIO-WITH-COVER.mp3",
      mimeType: "audio/mpeg",
      buffer: bytes,
    };
    const wrongFile = await page.request.post("/api/upload", {
      headers,
      multipart: {
        ...uploadFields,
        file: {
          name: "FAKE.mp3",
          mimeType: "audio/mpeg",
          buffer: await readFile(files.video),
        },
      },
    });
    expect(wrongFile.status()).toBe(400);
    expect((await wrongFile.json()).error).toContain(
      "keine reine Audioaufnahme",
    );
    const wrongOrder = await page.request.post("/api/upload", {
      headers,
      multipart: { ...uploadFields, order_id: randomUUID(), file: audio },
    });
    expect(wrongOrder.status()).toBe(409);
    expect((await wrongOrder.json()).error).toContain(
      "Song und Produktionsauftrag",
    );
    expect((await state()).audio_variants).toHaveLength(0);

    await page.goto("/");
    await page
      .getByRole("button", { name: /^Manuelle Aufgaben/ })
      .click();
    await page.locator('input[type="file"]').setInputFiles(files.covered);
    const upload = page.waitForResponse(
      (r) => r.url().endsWith("/api/upload") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", {
        name: "Audio übernehmen & automatisch fortsetzen",
        exact: true,
      })
      .click();
    const response = await upload;
    expect(response.status(), await response.text()).toBe(200);
    const imported = await response.json();
    expect(imported.kind).toBe("audio");
    await expect
      .poll(
        async () => {
          const s = await state(),
            run = s.automation_runs.find((r: any) => r.id === runId);
          if (run.error) throw new Error(run.error);
          return run.state;
        },
        { timeout: 180000, intervals: [1500] },
      )
      .toBe("ready");
    const s = await state(),
      asset = s.assets.find((a: any) => a.id === imported.id);
    expect(asset.metadata.streams.some((st: any) => st.attached_pic)).toBe(
      true,
    );
    expect(s.audio_variants).toHaveLength(1);
    expect(s.audio_variants[0]).toMatchObject({
      asset_id: imported.id,
      order_id: order.id,
      lyrics_version_id: lyrics.id,
    });
    expect(s.manual_tasks.find((t: any) => t.id === taskId).state).toBe("done");
    const download = await page.request.get("/api/assets/" + imported.id);
    expect(download.ok()).toBeTruthy();
    expect(
      createHash("sha256")
        .update(await download.body())
        .digest("hex"),
    ).toBe(createHash("sha256").update(bytes).digest("hex"));
    const repeat = await page.request.post("/api/upload", {
      headers,
      multipart: { ...uploadFields, file: audio },
    });
    expect(repeat.status()).toBe(409);
    expect((await repeat.json()).error).toContain("wartet nicht mehr");
    expect((await state()).audio_variants).toHaveLength(1);
    expect(s.posts).toHaveLength(3);
    expect(new Set(s.video_projects.map((p: any) => p.template))).toEqual(
      new Set(["character", "scenes", "visualizer"]),
    );
    const videos = [];
    for (const post of s.posts) {
      const r = await page.request.get("/api/assets/" + post.asset_id);
      expect(r.ok()).toBeTruthy();
      const file = `.local/e2e-covered-audio/${post.id}.mp4`;
      await writeFile(file, await r.body());
      const probe = await runProcess("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file,
      ]);
      expect(probe.code).toBe(0);
      const info = JSON.parse(probe.stdout),
        v = info.streams.find((st: any) => st.codec_type === "video"),
        a = info.streams.find((st: any) => st.codec_type === "audio");
      expect([
        v.width,
        v.height,
        v.codec_name,
        v.pix_fmt,
        a.codec_name,
      ]).toEqual([1080, 1920, "h264", "yuv420p", "aac"]);
      expect(Number(info.format.duration)).toBeGreaterThanOrEqual(3);
      expect(Number(info.format.duration)).toBeLessThan(3.2);
      const decode = await runProcess(
        "ffmpeg",
        ["-v", "error", "-i", file, "-f", "null", "-"],
        { timeout: 30000 },
      );
      expect(decode.code, decode.stderr).toBe(0);
      videos.push({
        template: s.video_projects.find((p: any) => p.name === post.title)
          .template,
        duration: Number(info.format.duration),
        width: v.width,
        height: v.height,
        decoded: true,
      });
    }
    await expect(
      page.getByRole("link", { name: "MP4 herunterladen", exact: true }),
    ).toHaveCount(3);
    await page.screenshot({
      path: "docs/screenshots/covered-audio-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: "docs/screenshots/covered-audio-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    expect(errors).toEqual([]);
    await mkdir("docs/test-evidence", { recursive: true });
    await writeFile(
      "docs/test-evidence/covered-audio-e2e.json",
      JSON.stringify(
        {
          checked_at: new Date().toISOString(),
          synthetic_audio: true,
          external_generation: false,
          embedded_cover: true,
          original_hash_unchanged: true,
          task_completed: true,
          invalid_video_rejected: true,
          invalid_order_rejected: true,
          completed_task_rejected: true,
          videos,
          browser_errors: errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.query("ROLLBACK");
    if (artistId)
      await db.query(
        "UPDATE artist_automations SET enabled=false WHERE artist_id=$1",
        [artistId],
      );
    await db.query("DELETE FROM sessions WHERE id=$1", [sid]);
    await db.end();
  }
});
