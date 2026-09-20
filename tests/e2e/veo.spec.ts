import { test, expect } from "@playwright/test";
import pg from "pg";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { runProcess } from "../../src/lib/process";
test("FFmpeg-Hauptweg und optionale Veo-Szene: verbinden, freigeben, importieren und im Musikvideo verwenden (Offline-Google)", async ({
  page,
  context,
}) => {
  const url = process.env.TEST_DATABASE_URL!;
  if (new URL(url).pathname !== "/artist_studio_test")
    throw new Error("Testdatenbank erforderlich.");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  const token = randomBytes(32).toString("hex"),
    sid = createHash("sha256").update(token).digest("hex");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    let user = (
      await db.query("SELECT id FROM users ORDER BY created_at LIMIT 1")
    ).rows[0];
    if (!user) {
      user = { id: randomUUID() };
      await db.query(
        "INSERT INTO users(id,email,password_hash) VALUES($1,'veo-browser@example.invalid','test-session-only')",
        [user.id],
      );
      await db.query("INSERT INTO settings(user_id,setup_step) VALUES($1,9)", [
        user.id,
      ]);
    }
    await db.query(
      "INSERT INTO sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [sid, user.id],
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
    await mkdir(".local/fixtures", { recursive: true });
    const ff = await runProcess("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=180x320:d=4",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=999:duration=4",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-y",
      ".local/fixtures/SYNTHETIC-VEO.mp4",
    ]);
    expect(ff.code, ff.stderr).toBe(0);
    // Also runnable independently without the live CLI/core test.
    const initial = await (await page.request.get("/api/state")).json();
    if (!initial.artists.length) {
      const cmd = async (action: string, data: any) => {
        const r = await page.request.post("/api/command", {
          headers: { Origin: "http://127.0.0.1:3212" },
          data: { action, data },
        });
        expect(r.ok(), await r.text()).toBeTruthy();
        return r.json();
      };
      const artist = await cmd("create_artist", {
        name: "TEST · Videostudio",
        genre: "Synthetische Testdaten",
      });
      const song = await cmd("create_song", {
        artist_id: artist.id,
        title: "SYNTHETISCHER SUNO-IMPORT",
      });
      const image = await sharp({
        create: { width: 360, height: 640, channels: 3, background: "#6b4351" },
      })
        .png()
        .toBuffer();
      const pic = await page.request.post("/api/upload", {
        headers: { Origin: "http://127.0.0.1:3212" },
        multipart: {
          artist_id: artist.id,
          file: {
            name: "SYNTHETISCHES-TESTBILD.png",
            mimeType: "image/png",
            buffer: image,
          },
        },
      });
      expect(pic.ok(), await pic.text()).toBeTruthy();
      const sound = await runProcess("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=3",
        "-c:a",
        "libmp3lame",
        "-y",
        ".local/fixtures/SYNTHETIC-SUNO.mp3",
      ]);
      expect(sound.code).toBe(0);
      const { readFile } = await import("node:fs/promises");
      const audio = await page.request.post("/api/upload", {
        headers: { Origin: "http://127.0.0.1:3212" },
        multipart: {
          artist_id: artist.id,
          song_id: song.id,
          origin: "Synthetische Testdatei · kein Suno-Liveauftrag",
          file: {
            name: "SYNTHETIC-SUNO.mp3",
            mimeType: "audio/mpeg",
            buffer: await readFile(".local/fixtures/SYNTHETIC-SUNO.mp3"),
          },
        },
      });
      expect(audio.ok(), await audio.text()).toBeTruthy();
    }
    await page.goto("/");
    await page
      .getByRole("button", { name: "Video-Studio", exact: true })
      .click();
    await expect(
      page.getByText("Aus Bildern wird dein Musikvideo."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Optionale KI-Szenen öffnen" })
      .click();
    await expect(page.getByText(/Veo ist noch nicht verbunden/)).toBeVisible();
    await page
      .getByRole("button", { name: "Video-Provider einrichten" })
      .click();
    await page
      .getByRole("button", { name: "Provider & Konten", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Veo-Anleitung", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("kein Video");
    await page.screenshot({
      path: "docs/screenshots/veo-guide-desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Schließen", exact: true }).click();
    await page
      .getByRole("button", { name: "Veo verbinden", exact: true })
      .click();
    await page.getByLabel("Veo API-Key", { exact: true }).fill("wrong-key");
    await page
      .getByLabel("Bestätigter Kostenansatz", { exact: false })
      .fill("0.12");
    await page.getByLabel("Veo-Tageslimit (USD)").fill("5");
    await page.getByLabel("Veo-Monatslimit (USD)").fill("20");
    await page.getByRole("button", { name: "Veo speichern & prüfen" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "abgewiesen",
    );
    await page
      .getByLabel("Veo API-Key", { exact: true })
      .fill("veo-browser-test-key");
    await page.getByRole("button", { name: "Veo speichern & prüfen" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const state = async () => (await page.request.get("/api/state")).json();
    let st = await state();
    expect(JSON.stringify(st)).not.toContain("veo-browser-test-key");
    expect(st.video_connection.live_tested_at).toBeNull();
    await page
      .getByRole("button", { name: "Video-Studio", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Optionale KI-Szenen öffnen" })
      .click();
    await page
      .getByRole("button", { name: "KI-Szene vorbereiten", exact: true })
      .click();
    await page
      .getByLabel("Name der KI-Szene")
      .fill("TEST · Veo-Szene ohne Cloudgenerierung");
    await page
      .getByLabel("Szenenbeschreibung", { exact: true })
      .fill("Synthetic offline test: slow camera movement.");
    await page.getByLabel("Szenenlänge").selectOption("4");
    const start = page.getByRole("button", {
      name: "Kostenpflichtige KI-Szene starten",
    });
    await expect(start).toBeDisabled();
    await page.getByRole("checkbox", { name: /Ich darf dieses Bild/ }).check();
    await page.getByRole("checkbox", { name: /Diesen Szenenauftrag/ }).check();
    await page.screenshot({
      path: "docs/screenshots/veo-approval-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/veo-approval-mobile.png",
      fullPage: true,
    });
    expect(
      await page
        .getByRole("dialog")
        .evaluate((e) => e.scrollWidth - e.clientWidth),
    ).toBeLessThanOrEqual(1);
    await start.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(async () => (await state()).video_generations[0]?.state, {
        timeout: 90000,
        intervals: [1000, 2000],
      })
      .toBe("succeeded");
    st = await state();
    const gen = st.video_generations[0];
    const asset = st.assets.find((a: any) => a.id === gen.asset_id);
    expect(asset.origin).toBe("google_veo");
    expect(asset.rights_status).toBe("unclear");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(
      page.getByRole("button", { name: "Im Musikvideo verwenden" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Im Musikvideo verwenden" }).click();
    await expect(page.getByLabel("Szenenmaterial").first()).toHaveValue(
      asset.id,
    );
    expect(
      await page
        .getByLabel("Ende (s)", { exact: true })
        .evaluate((e: HTMLInputElement) => e.validity.stepMismatch),
    ).toBe(false);
    expect(
      await page
        .getByLabel("Dauer (s)", { exact: true })
        .evaluate((e: HTMLInputElement) => e.validity.stepMismatch),
    ).toBe(false);
    await page
      .getByLabel("Projektname")
      .fill("TEST · KI-Szene + Suno-Aufnahme");
    await page
      .getByRole("button", { name: "Projekt speichern", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    st = await state();
    const project = st.video_projects.find(
      (p: any) => p.name === "TEST · KI-Szene + Suno-Aufnahme",
    );
    expect(project.timeline.scenes[0].asset_id).toBe(asset.id);
    const response = await page.request.post("/api/command", {
      headers: { Origin: "http://127.0.0.1:3212" },
      data: { action: "render_video", data: { project_id: project.id } },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const renderJob = await response.json();
    await expect
      .poll(
        async () =>
          (await state()).jobs.find((j: any) => j.id === renderJob.id)?.state,
        { timeout: 120000, intervals: [1000, 2000] },
      )
      .toBe("succeeded");
    st = await state();
    const rendered = st.renders.find((r: any) => r.project_id === project.id);
    const output = st.assets.find((a: any) => a.id === rendered.asset_id);
    expect(
      output.metadata.streams.find((s: any) => s.type === "video"),
    ).toMatchObject({ width: 1080, height: 1920, codec: "h264" });
    await expect(
      page
        .getByRole("link", { name: "MP4 herunterladen", exact: true })
        .first(),
    ).toBeVisible();
    await page.screenshot({
      path: "docs/screenshots/video-optional-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/video-optional-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
    await writeFile(
      "docs/test-evidence/veo-browser.json",
      JSON.stringify(
        {
          at: new Date().toISOString(),
          provider: "offline simulation, no paid Google request",
          generationState: gen.state,
          importedFile: asset.mime,
          output: output.metadata,
          desktop: true,
          mobile: true,
          javascriptErrors: errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.query("DELETE FROM sessions WHERE id=$1", [sid]);
    await db.end();
  }
});
