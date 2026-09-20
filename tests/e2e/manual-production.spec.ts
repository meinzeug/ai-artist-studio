import { test, expect } from "@playwright/test";
import pg from "pg";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
test("Zusatzproduktion über Dashboard bis zur manuellen Suno-Aufgabe (synthetischer Textprovider)", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  const url = process.env.TEST_DATABASE_URL!;
  if (new URL(url).pathname !== "/artist_studio_test")
    throw Error("Only isolated test database");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  const user = randomUUID(),
    token = randomBytes(32).toString("hex"),
    sid = createHash("sha256").update(token).digest("hex"),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await db.query(
      "INSERT INTO users(id,email,password_hash) VALUES($1,$2,'synthetic-only')",
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
    const cmd = async (action: string, data: any) => {
      const r = await page.request.post("/api/command", {
        headers,
        data: { action, data },
      });
      expect(r.ok(), await r.text()).toBeTruthy();
      return r.json();
    };
    const state = async () => (await page.request.get("/api/state")).json();
    const artist = await cmd("create_artist", {
      name: "SYNTHETIC MANUAL START ARTIST",
    });
    const image = await page.request.post("/api/upload", {
      headers,
      multipart: {
        artist_id: artist.id,
        file: {
          name: "SYNTHETIC-REFERENCE.png",
          mimeType: "image/png",
          buffer: await sharp({
            create: {
              width: 64,
              height: 64,
              channels: 3,
              background: "#dd7744",
            },
          })
            .png()
            .toBuffer(),
        },
      },
    });
    expect(image.ok()).toBeTruthy();
    const portrait = await image.json();
    await cmd("auto_settings", {
      artist_id: artist.id,
      version: 0,
      enabled: false,
      daily_time: "09:00",
      music_mode: "manual",
      approved: true,
      image_version: null,
      music_version: null,
      full_music_video: true,
      video_scene_count: 8,
    });
    await db.query(
      "UPDATE artist_automations SET reference_asset_id=$2,next_run_at=now()+interval '1 day' WHERE artist_id=$1",
      [artist.id, portrait.id],
    );
    await db.query(
      "INSERT INTO automation_runs(id,user_id,artist_id,local_day,stage,state,identity_ready) VALUES($1,$2,$3,(now() AT TIME ZONE 'Europe/Berlin')::date,'delivery','ready',true)",
      [randomUUID(), user, artist.id],
    );
    await cmd("auto_pause", {
      artist_id: artist.id,
      version: 1,
      enabled: true,
    });
    const before = await state(),
      schedule = before.artist_automations[0].next_run_at;
    await page.goto("/");
    await page.getByRole("button", { name: /Manuelle Aufgaben/ }).click();
    await page
      .getByRole("button", { name: "Neue Produktion", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("8 neuen Bildmotiven");
    const started = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/command") &&
        r.request().postDataJSON()?.action === "auto_start",
    );
    await page
      .getByRole("button", {
        name: "Produktion bestätigen & starten",
        exact: true,
      })
      .click();
    const response = await started;
    expect(response.ok(), await response.text()).toBeTruthy();
    const result = await response.json();
    await expect
      .poll(
        async () => {
          const s = await state();
          return s.automation_runs.find((r: any) => r.id === result.run_id)
            ?.state;
        },
        { timeout: 60000, intervals: [1000] },
      )
      .toBe("waiting_for_input");
    const s = await state(),
      run = s.automation_runs.find((r: any) => r.id === result.run_id),
      order = s.music_orders.find((o: any) => o.id === run.music_order_id);
    expect(run.start_kind).toBe("manual");
    expect(run.stage).toBe("music");
    expect(order.provider).toBe("suno_manual");
    expect(order.package.lyrics).toContain("Der Morgen");
    expect(s.artist_automations[0].next_run_at).toBe(schedule);
    expect(
      s.automation_runs.filter((r: any) => r.start_kind === "manual"),
    ).toHaveLength(1);
    expect(s.jobs.filter((j: any) => j.kind === "auto_song")).toHaveLength(1);
    expect(
      s.jobs.filter(
        (j: any) => j.kind === "image_generate" || j.kind === "suno_generate",
      ),
    ).toHaveLength(0);
    await expect(
      page.getByRole("button", { name: "Neue Produktion", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("link", { name: "Suno öffnen", exact: true }),
    ).toBeVisible();
    const pack = await page.request.get("/api/exports/suno/" + order.id);
    expect(pack.ok(), await pack.text()).toBeTruthy();
    expect((await pack.body()).subarray(0, 2).toString()).toBe("PK");
    await page.screenshot({
      path: "docs/screenshots/manual-production-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.locator(".sidebar").evaluate((el) => el.getBoundingClientRect().right),
      )
      .toBeLessThanOrEqual(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "docs/screenshots/manual-production-mobile.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
    await writeFile(
      "docs/test-evidence/manual-production-browser.json",
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          provider: "explicit synthetic text fixture",
          runState: run.state,
          stage: run.stage,
          manualStarts: 1,
          aiJobs: 1,
          sunoApiCalls: 0,
          imageApiCalls: 0,
          scheduleUnchanged: true,
          packageDownloaded: true,
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
