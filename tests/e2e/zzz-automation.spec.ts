import { test, expect } from "@playwright/test";
import pg from "pg";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { runProcess } from "../../src/lib/process";

test("Artist autonom erstellen → echte Codex-Identität/Referenzbilder → manuelle Suno-Aufgabe → drei reale MP4 → Veröffentlichungsnachweis", async ({
  page,
  context,
}) => {
  const url = process.env.TEST_DATABASE_URL!;
  if (new URL(url).pathname !== "/artist_studio_test")
    throw new Error("Nur isolierte Testdatenbank");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  const user = randomUUID(),
    token = randomBytes(32).toString("hex"),
    sid = createHash("sha256").update(token).digest("hex"),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await db.query(
    "INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test-session-only')",
    [user, `auto-${user}@example.invalid`],
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
  const state = async () => (await page.request.get("/api/state")).json();
  let artistId = "";
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Künstler", exact: true }).click();
    await page
      .getByRole("button", { name: "Artist erstellen", exact: true })
      .first()
      .click();

    await page.getByText("Eigene Wünsche (optional)", { exact: true }).click();
    await page
      .getByLabel("Name (optional)", { exact: true })
      .fill("TEST · Automatischer Artist");
    await page
      .getByLabel("Musikstil (optional)")
      .fill("Deutschsprachiger Synthpop");
    await page
      .getByLabel("Aussehen (optional)")
      .fill(
        "Vollständig fiktiver erwachsener Musikcharakter, kurze kupferrote Haare, dunkle Jacke mit türkisem Kragen, Studiofoto. Integrations-Testfigur.",
      );
    await page
      .getByLabel("Charakter, Themen & weitere Wünsche (optional)")
      .fill(
        "Dies ist ein isolierter Softwaretest. Eigene kreative Testtexte, keine realen Künstler kopieren. Themen: Aufbruch und Neugier.",
      );
    await page.screenshot({
      path: "docs/screenshots/automation-create-desktop.png",
      fullPage: false,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/automation-create-mobile.png",
      fullPage: false,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole("button", {
        name: "Artist erstellen & Automatik starten",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Manuelle Aufgaben.", exact: true }),
    ).toBeVisible();
    artistId = (await state()).artists[0].id;
    let musicTask: any, run: any;
    await expect
      .poll(
        async () => {
          const s = await state();
          run = s.automation_runs.find((r: any) => r.artist_id === artistId);
          const failure = s.manual_tasks.find(
            (t: any) => t.state === "open" && t.kind === "fix_production",
          );
          if (failure) throw new Error(failure.body);
          musicTask = s.manual_tasks.find(
            (t: any) =>
              t.artist_id === artistId &&
              t.kind === "produce_music" &&
              t.state === "open",
          );
          return !!musicTask;
        },
        { timeout: 680000, intervals: [3000] },
      )
      .toBe(true);
    let s = await state();
    const artist = s.artists.find((a: any) => a.id === artistId),
      policy = s.artist_automations[0];
    expect(artist.identity.visual.length).toBeGreaterThan(20);
    expect(artist.bio).toMatch(/virtuell|KI-gestützt/i);
    expect(policy.reference_asset_id).toBeTruthy();
    expect(s.image_connection.provider).toBe("codex");
    expect(s.music_orders[0].package.lyrics.length).toBeGreaterThan(100);
    await expect(
      page.getByRole("button", {
        name: "Audio übernehmen & automatisch fortsetzen",
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    await page.screenshot({
      path: "docs/screenshots/automation-suno-task-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    const packet = await page.request.get(
      "/api/exports/suno/" + run.music_order_id,
    );
    expect(packet.ok()).toBeTruthy();
    await mkdir(".local/e2e-automation", { recursive: true });
    const audioFile = ".local/e2e-automation/SYNTHETIC-TEST-AUDIO.mp3";
    const generated = await runProcess(
      "ffmpeg",
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=330:sample_rate=44100:duration=6",
        "-c:a",
        "libmp3lame",
        "-y",
        audioFile,
      ],
      { timeout: 20000 },
    );
    expect(generated.code).toBe(0);
    // Actual upload uses the task's protected artist/song/order relationship.
    await page.locator('input[type="file"]').setInputFiles(audioFile);
    await page
      .getByRole("button", {
        name: "Audio übernehmen & automatisch fortsetzen",
        exact: true,
      })
      .click();
    await expect
      .poll(
        async () => {
          s = await state();
          run = s.automation_runs.find((r: any) => r.artist_id === artistId);
          const failure = s.manual_tasks.find(
            (t: any) => t.state === "open" && t.kind === "fix_production",
          );
          if (failure) throw new Error(failure.body);
          return run.state;
        },
        { timeout: 620000, intervals: [3000] },
      )
      .toBe("ready");
    expect(s.audio_variants[0].order_id).toBe(run.music_order_id);
    expect(s.audio_variants[0].lyrics_version_id).toBe(
      s.music_orders[0].lyrics_version_id,
    );
    const images = s.image_generations.filter(
      (g: any) => g.artist_id === artistId,
    );
    expect(images).toHaveLength(2);
    expect(images.find((g: any) => g.song_id)?.reference_asset_id).toBe(
      policy.reference_asset_id,
    );
    const posts = s.posts.filter((p: any) => p.artist_id === artistId);
    expect(posts).toHaveLength(3);
    expect(
      s.manual_tasks.filter(
        (t: any) => t.kind === "publish_video" && t.state === "open",
      ),
    ).toHaveLength(3);
    expect(new Set(s.video_projects.map((p: any) => p.template))).toEqual(
      new Set(["character", "scenes", "visualizer"]),
    );
    const probes = [];
    for (const post of posts) {
      expect(post.caption.length).toBeGreaterThan(10);
      expect(post.is_aigc).toBe(true);
      expect(post.status).toBe("waiting_for_approval");
      const response = await page.request.get("/api/assets/" + post.asset_id);
      expect(response.ok()).toBeTruthy();
      const file = ".local/e2e-automation/" + post.id + ".mp4";
      await writeFile(file, await response.body());
      const info = await runProcess(
        "ffprobe",
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
        { timeout: 20000 },
      );
      expect(info.code).toBe(0);
      const probe = JSON.parse(info.stdout),
        video = probe.streams.find((st: any) => st.codec_type === "video"),
        audio = probe.streams.find((st: any) => st.codec_type === "audio");
      expect([
        video.width,
        video.height,
        video.codec_name,
        video.pix_fmt,
      ]).toEqual([1080, 1920, "h264", "yuv420p"]);
      expect(audio.codec_name).toBe("aac");
      expect(Number(probe.format.duration)).toBeGreaterThanOrEqual(6);
      expect(Number(probe.format.duration)).toBeLessThan(6.3);
      const decode = await runProcess(
        "ffmpeg",
        ["-v", "error", "-i", file, "-f", "null", "-"],
        { timeout: 30000 },
      );
      expect(decode.code, decode.stderr).toBe(0);
      probes.push({
        template: s.video_projects.find(
          (p: any) => p.song_id === post.song_id && p.name === post.title,
        )?.template,
        width: video.width,
        height: video.height,
        video: video.codec_name,
        audio: audio.codec_name,
        duration: Number(probe.format.duration),
        decoded: true,
      });
    }
    await expect(
      page.getByRole("link", { name: "MP4 herunterladen", exact: true }),
    ).toHaveCount(3, { timeout: 15000 });
    await page.screenshot({
      path: "docs/screenshots/automation-videos-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/automation-videos-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.setViewportSize({ width: 1440, height: 1000 });
    const delivery = await page.request.get(
      "/api/exports/delivery/" + posts[0].id,
    );
    expect(delivery.ok()).toBeTruthy();
    const zip = ".local/e2e-automation/delivery.zip";
    await writeFile(zip, await delivery.body());
    const contents = await runProcess("unzip", ["-Z1", zip], {
      timeout: 10000,
    });
    expect(contents.stdout).toContain("video.mp4");
    expect(contents.stdout).toContain("caption.txt");
    expect(contents.stdout).toContain("entwurf.json");
    expect(contents.stdout).not.toContain("freigabe.json");
    const task = s.manual_tasks.find((t: any) => t.post_id === posts[0].id);
    // Test evidence only: no actual TikTok posting is performed.
    const bad = await page.request.post("/api/command", {
      headers: { Origin: "http://127.0.0.1:3212" },
      data: {
        action: "auto_publish",
        data: {
          task_id: task.id,
          post_version: posts[0].version + 1,
          url: "https://www.tiktok.com/@test/video/1",
          published_at: new Date().toISOString(),
          rights_note: "Synthetischer Testnachweis – kein echter TikTok-Post",
          confirmed: true,
        },
      },
    });
    expect(bad.status()).toBe(409);
    const card = page.locator("section.manual-task").filter({
      has: page.getByRole("heading", { name: task.title, exact: true }),
    });
    await card
      .getByRole("button", { name: "Ich habe auf TikTok veröffentlicht" })
      .click();
    await card
      .getByLabel("TikTok-Link")
      .fill("https://www.tiktok.com/@test/video/1");
    await card
      .getByLabel("Tatsächlicher Veröffentlichungszeitpunkt", { exact: false })
      .fill("2026-09-20T12:00");
    await card
      .getByLabel("Geprüfte Bild-/Musikrechte und Kennzeichnungen")
      .fill(
        "Synthetischer Testnachweis, kein echter TikTok-Post. Testaudio lokal erstellt, Bild aus Codex-Testgeneration.",
      );
    await card.getByLabel("Ich habe Rechte").check();
    await card
      .getByRole("button", { name: "Veröffentlichung dokumentieren" })
      .click();
    await expect(card).toHaveCount(0);
    s = await state();
    expect(s.posts.find((p: any) => p.id === posts[0].id).verification).toBe(
      "manual_unverified",
    );
    const attempt = (
      await db.query(
        "SELECT state FROM publication_attempts WHERE post_id=$1",
        [posts[0].id],
      )
    ).rows;
    expect(attempt).toHaveLength(1);
    expect(attempt[0].state).toBe("manually_confirmed");
    await page.getByRole("button", { name: "Pausieren", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Fortsetzen", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Manuelle Aufgaben." }),
    ).toBeVisible();
    expect((await state()).artist_automations[0].enabled).toBe(false);
    expect(errors).toEqual([]);
    await writeFile(
      "docs/test-evidence/automation-e2e.json",
      JSON.stringify(
        {
          checked_at: new Date().toISOString(),
          live_codex_identity: true,
          live_codex_lyrics: true,
          live_codex_portrait: true,
          live_codex_reference_scene: true,
          suno_generation_live: false,
          manual_audio_import: true,
          synthetic_test_audio: true,
          automatic_resumption: true,
          real_renders: probes,
          manual_tasks: 3,
          public_post_performed: false,
          manual_evidence_saved: true,
          paused_after_test: true,
          browser_errors: errors,
        },
        null,
        2,
      ),
    );
  } finally {
    if (artistId)
      await db.query(
        "UPDATE artist_automations SET enabled=false WHERE artist_id=$1",
        [artistId],
      );
    await db.query("DELETE FROM sessions WHERE id=$1", [sid]);
    await db.end();
  }
});
