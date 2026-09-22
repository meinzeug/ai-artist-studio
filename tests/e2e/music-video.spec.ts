import { test, expect } from "@playwright/test";
import pg from "pg";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { runProcess } from "../../src/lib/process";
test("Vollständiges Musikvideo: Storyboard, 13 eigene Bilder und Bildwechsel spätestens alle fünf Sekunden, volle Aufnahme und Download (synthetische KI-Antwort)", async ({
  page,
  context,
}) => {
  test.setTimeout(240000);
  page.setDefaultTimeout(15000);
  const url = process.env.TEST_DATABASE_URL!;
  if (new URL(url).pathname !== "/artist_studio_test")
    throw Error("Nur Testdatenbank");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  const user = randomUUID(),
    token = randomBytes(32).toString("hex"),
    sid = createHash("sha256").update(token).digest("hex"),
    run = randomUUID(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  let artistId: string | undefined;
  try {
    await db.query(
      "INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test-only')",
      [user, `full-film-${user}@example.invalid`],
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
      await cmd("create_artist", { name: "TEST · Vollständiges Musikvideo" })
    ).id;
    const song = await cmd("create_song", {
      artist_id: artistId,
      title: "SYNTHETIC FULL-SONG BROWSER TEST",
    });
    const lyrics = await cmd("save_lyrics", {
      song_id: song.id,
      base_version: 0,
      title: "SYNTHETIC FULL-SONG BROWSER TEST",
      lyrics:
        "Das Blatt ist weiß.\nDie Lampe scheint.\nIch lasse los.\nDer Morgen bleibt.",
    });
    const order = await cmd("prepare_music_generation", {
      song_id: song.id,
      lyrics_version_id: lyrics.id,
    });
    const images = [];
    for (const [i, color] of [
      "#ee5522",
      "#3366dd",
      "#aacc33",
      "#bb5599",
      "#881177",
      "#228877",
      "#992233",
      "#777777",
      "#5555aa",
      "#eeee55",
      "#442200",
      "#bb6633",
      "#aabbcc",
    ].entries()) {
      const bytes = await sharp({
        create: { width: 360, height: 640, channels: 3, background: color },
      })
        .png()
        .toBuffer();
      const r = await page.request.post("/api/upload", {
        headers,
        multipart: {
          artist_id: artistId!,
          file: {
            name: `SYNTHETIC-FRAME-${i + 1}.png`,
            mimeType: "image/png",
            buffer: bytes,
          },
        },
      });
      expect(r.ok()).toBeTruthy();
      images.push(await r.json());
    }
    await mkdir(".local/e2e-full-music-video", { recursive: true });
    const file = ".local/e2e-full-music-video/SYNTHETIC-FULL-SONG.mp3";
    const ff = await runProcess("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=64.2",
      "-c:a",
      "libmp3lame",
      "-y",
      file,
    ]);
    expect(ff.code).toBe(0);
    const upload = await page.request.post("/api/upload", {
      headers,
      multipart: {
        artist_id: artistId!,
        song_id: song.id,
        order_id: order.id,
        file: {
          name: "SYNTHETIC-FULL-SONG.mp3",
          mimeType: "audio/mpeg",
          buffer: await readFile(file),
        },
      },
    });
    expect(upload.ok(), await upload.text()).toBeTruthy();
    await cmd("image_configure", {
      provider: "manual",
      version: 0,
      daily_limit: 10,
      monthly_limit: 100,
    });
    await db.query("BEGIN");
    await db.query(
      "INSERT INTO artist_automations(artist_id,user_id,reference_asset_id,next_run_at) VALUES($1,$2,$3,now()+interval '1 day')",
      [artistId, user, images[0].id],
    );
    await db.query(
      "INSERT INTO automation_runs(id,user_id,artist_id,local_day,stage,state,song_id,music_order_id) VALUES($1,$2,$3,current_date,'delivery','ready',$4,$5)",
      [run, user, artistId, song.id, order.id],
    );
    await db.query("COMMIT");
    await page.goto("/");
    await page.getByRole("button", { name: /^Manuelle Aufgaben/ }).click();
    await page
      .getByRole("button", {
        name: "Vollständiges Musikvideo erstellen",
        exact: true,
      })
      .click();
    await expect(
      page.getByLabel("Benötigte Bildmotive", { exact: true }),
    ).toHaveValue("13");
    await expect(page.getByRole("dialog")).toContainText(
      "2 Storyboard-Teilaufträge",
    );
    await page
      .getByRole("button", {
        name: "Musikvideo jetzt produzieren",
        exact: true,
      })
      .click();
    await expect
      .poll(async () => (await state()).music_video_productions[0]?.state, {
        intervals: [1000],
      })
      .toBe("blocked");
    await expect(page.locator(".music-storyboard-scene")).toHaveCount(13);
    for (let i = 0; i < 13; i++) {
      await page
        .locator(".music-storyboard-scene")
        .nth(i)
        .locator("select")
        .selectOption(images[i].id);
      await expect(
        page.locator(".music-storyboard-scene").nth(i).locator("img"),
      ).toBeVisible();
    }
    await page.screenshot({
      path: "docs/screenshots/five-second-storyboard.png",
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("button", {
        name: "Vorhandene Produktion fortsetzen",
        exact: true,
      })
      .click();
    const resumeResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/command") &&
        response.request().postDataJSON()?.action === "music_video_resume",
    );
    await page
      .getByRole("button", { name: "Bestätigen & fortsetzen", exact: true })
      .click();
    const resumed = await resumeResponse;
    expect(resumed.ok(), await resumed.text()).toBeTruthy();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(
        async () => {
          const s = await state(),
            p = s.music_video_productions[0];
          if (p.error) throw Error(p.error);
          return p.state;
        },
        { timeout: 160000, intervals: [2000] },
      )
      .toBe("ready");
    const s = await state(),
      p = s.music_video_productions[0],
      post = s.posts.find((x: any) => x.id === p.post_id),
      asset = s.assets.find((a: any) => a.id === post.asset_id);
    expect(asset.metadata.duration).toBeGreaterThan(64);
    expect(asset.metadata.full_song).toBe(true);
    expect(asset.metadata.scene_count).toBe(13);
    const timeline = s.video_projects.find(
      (v: any) => v.id === p.project_id,
    ).timeline;
    expect(timeline.scenes.every((x: any) => x.duration <= 5)).toBe(true);
    expect(
      s.jobs.filter((j: any) => j.kind === "music_video_storyboard"),
    ).toHaveLength(2);
    expect(
      s.music_video_scenes.every((x: any) => x.continuity.length > 10),
    ).toBe(true);
    expect(post.status).toBe("waiting_for_approval");
    await expect(
      page.getByRole("link", { name: "MP4 herunterladen", exact: true }),
    ).toHaveCount(1);
    const r = await page.request.get("/api/assets/" + asset.id);
    expect(r.ok()).toBeTruthy();
    const output = ".local/e2e-full-music-video/full.mp4";
    await writeFile(output, await r.body());
    const decoded = await runProcess(
      "ffmpeg",
      ["-v", "error", "-i", output, "-f", "null", "-"],
      { timeout: 60000 },
    );
    expect(decoded.code, decoded.stderr).toBe(0);
    await page.screenshot({
      path: "docs/screenshots/five-second-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/five-second-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    expect(errors).toEqual([]);
    await writeFile(
      "docs/test-evidence/five-second-browser.json",
      JSON.stringify(
        {
          checked_at: new Date().toISOString(),
          storyboard_provider: "explicit synthetic fixture",
          images: "synthetic local fixtures via manual scene handoff",
          duration: asset.metadata.duration,
          scene_count: asset.metadata.scene_count,
          shot_count: asset.metadata.shot_count,
          streams: asset.metadata.streams,
          decoded: true,
          max_image_seconds: Math.max(
            ...timeline.scenes.map((x: any) => x.duration),
          ),
          storyboard_jobs: 2,
          manual_handoff: true,
          public_post_sent: false,
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
