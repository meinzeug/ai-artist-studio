import { test, expect } from "@playwright/test";
import pg from "pg";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { runProcess } from "../../src/lib/process";
test("Artist mit Stilrecherche und MP3-Referenz im Dashboard, Quellen und Audioanalyse (synthetische Provider)", async ({
  page,
  context,
}) => {
  test.setTimeout(150000);
  const url = process.env.TEST_DATABASE_URL!;
  if (new URL(url).pathname !== "/artist_studio_test")
    throw Error("Test DB only");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  const user = randomUUID(),
    token = randomBytes(32).toString("hex"),
    sid = createHash("sha256").update(token).digest("hex");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await db.query(
      "INSERT INTO users(id,email,password_hash) VALUES($1,$2,'synthetic')",
      [user, user + "@example.invalid"],
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
    const command = await page.request.post("/api/command", {
      headers,
      data: {
        action: "image_configure",
        data: {
          provider: "manual",
          version: 0,
          daily_limit: 10,
          monthly_limit: 100,
        },
      },
    });
    expect(command.ok()).toBe(true);
    const state = async () => (await page.request.get("/api/state")).json();
    await mkdir(".local/style-e2e", { recursive: true });
    const file = ".local/style-e2e/SYNTHETIC.mp3";
    const ff = await runProcess("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=660:duration=4",
      "-c:a",
      "libmp3lame",
      "-y",
      file,
    ]);
    expect(ff.code).toBe(0);
    const bytes = await readFile(file);
    const invalid = await page.request.post("/api/artists/create", {
      headers,
      multipart: {
        data: JSON.stringify({ key: randomUUID(), data: { approved: true } }),
        file: { name: "SYNTHETIC.mp3", mimeType: "audio/mpeg", buffer: bytes },
      },
    });
    expect(invalid.status()).toBe(400);
    expect(await invalid.text()).toContain("bestätigen");
    expect((await state()).artists).toHaveLength(0);
    await page.goto("/");
    await page.getByRole("button", { name: "Künstler", exact: true }).click();
    await page
      .getByRole("button", { name: "Artist erstellen", exact: true })
      .first()
      .click();
    await page.getByText("Eigene Wünsche (optional)", { exact: true }).click();
    await page
      .getByLabel("Name (optional)", { exact: true })
      .fill("SYNTHETIC STYLE BROWSER");
    await page
      .getByLabel("Musikstil (optional)", { exact: true })
      .fill("SYNTHETIC STYLE BROWSER Synthpop");
    await page
      .getByLabel("Band oder Musikstil im Internet recherchieren (optional)")
      .fill(
        "SYNTHETIC STYLE BROWSER – recherchiere Band und entwickle einen eigenen Stil",
      );
    await page
      .getByLabel("Musikreferenz hochladen (optional)")
      .setInputFiles(file);
    await page.getByRole("checkbox", { name: /Ich darf diese Datei/ }).check();
    await page.screenshot({
      path: "docs/screenshots/artist-style-create.png",
      fullPage: true,
      animations: "disabled",
    });
    const response = page.waitForResponse((r) =>
      r.url().endsWith("/api/artists/create"),
    );
    await page
      .getByRole("button", {
        name: "Artist erstellen & Automatik starten",
        exact: true,
      })
      .click();
    const created = await response;
    expect(created.ok(), await created.text()).toBe(true);
    const a = await created.json();
    await expect
      .poll(
        async () => {
          const s = await state();
          return s.artists.find((x: any) => x.id === a.id)?.version;
        },
        { timeout: 70000, intervals: [1000] },
      )
      .toBe(2);
    const s = await state(),
      p = s.artist_style_profiles.find((p: any) => p.artist_id === a.id);
    expect(p.research_result.search_activity.executed).toBe(true);
    expect(p.audio_result.heard_audio).toBe(true);
    expect(p.audio_result.tempo_bpm).toBe(null);
    expect(p.reference_asset_id).toBeTruthy();
    expect(
      s.artists.find((x: any) => x.id === a.id).identity.instrumentation,
    ).toContain("Stilrecherche");
    expect(s.image_generations).toHaveLength(0);
    await page.getByRole("button", { name: "Künstler", exact: true }).click();
    await page
      .getByRole("button", { name: "Stil & Quellen", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Synthetische Stilrecherche",
    );
    await expect(
      page.getByRole("link", { name: "Synthetische Musikquelle" }),
    ).toHaveAttribute("href", "https://example.invalid/music");
    await expect(page.locator("audio")).toHaveAttribute(
      "src",
      "/api/assets/" + p.reference_asset_id,
    );
    const asset = await page.request.get("/api/assets/" + p.reference_asset_id);
    expect(asset.ok()).toBe(true);
    expect(
      createHash("sha256")
        .update(await asset.body())
        .digest("hex"),
    ).toBe(createHash("sha256").update(bytes).digest("hex"));
    await page.screenshot({
      path: "docs/screenshots/artist-style-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/artist-style-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    await writeFile(
      "docs/test-evidence/artist-style-browser.json",
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          provider: "explicit synthetic search/audio/identity fixtures",
          actualUploadedAudio: true,
          originalHashUnchanged: true,
          sourcesVisible: true,
          styleUsedForIdentity: true,
          desktop: 1440,
          mobile: 390,
          browserErrors: errors,
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
