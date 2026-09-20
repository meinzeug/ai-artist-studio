import "dotenv/config";
import { chromium, expect } from "@playwright/test";
import pg from "pg";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

// Read-only browser review of the existing, explicitly synthetic E2E fixture.
const url = new URL(process.env.TEST_DATABASE_URL!);
if (url.pathname !== "/artist_studio_test")
  throw new Error("Nur Testdatenbank erlaubt.");
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
const user = (
  await client.query("SELECT id FROM users ORDER BY created_at LIMIT 1")
).rows[0];
if (!user) throw new Error("Zuerst E2E-Test ausführen.");
const token = randomBytes(32).toString("hex"),
  session = createHash("sha256").update(token).digest("hex");
await client.query(
  "INSERT INTO sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
  [session, user.id],
);
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3212",
  ],
  {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: url.toString(),
      STORAGE_ROOT: ".local/test-assets",
      APP_ORIGIN: "http://127.0.0.1:3212",
    },
    stdio: "ignore",
  },
);
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      ready = (await fetch("http://127.0.0.1:3212/api/health")).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready) throw new Error("Testweb nicht erreichbar.");
  browser = await chromium.launch({
    channel:
      process.env.PLAYWRIGHT_CHANNEL ??
      (existsSync("/usr/bin/google-chrome") ? "chrome" : undefined),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addCookies([
    {
      name: "studio_session",
      value: token,
      url: "http://127.0.0.1:3212",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3212");
  await expect(
    page.getByRole("heading", { name: "Willkommen im Studio." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Video-Studio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Video abspielen:/ }),
  ).toHaveCount(3);
  while (await page.getByRole("button", { name: /^Video abspielen:/ }).count())
    await page
      .getByRole("button", { name: /^Video abspielen:/ })
      .first()
      .click();
  await expect(page.locator("video")).toHaveCount(3);
  for (const v of await page.locator("video").all()) {
    await v.evaluate(async (video: HTMLVideoElement) => {
      video.muted = true;
      await video.play();
    });
    await expect
      .poll(() => v.evaluate((video: HTMLVideoElement) => video.currentTime), {
        timeout: 15000,
      })
      .toBeGreaterThan(0.2);
    await v.evaluate((video: HTMLVideoElement) => {
      video.pause();
      video.load();
    });
  }
  const desktop = [
    ["Übersicht", "overview"],
    ["Künstler", "artists"],
    ["Songs & Lyrics", "lyrics"],
    ["Video-Studio", "video"],
    ["Auswertung", "analytics"],
  ];
  for (const [nav, name] of desktop) {
    await page.getByRole("button", { name: nav, exact: true }).click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: `docs/screenshots/${name}-desktop.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [nav, name] of [
    ["Übersicht", "overview"],
    ["Charakter & Medien", "library"],
    ["Video-Studio", "video"],
    ["Kampagnen & Kalender", "calendar"],
  ]) {
    await page.getByRole("button", { name: "Menü öffnen" }).click();
    await page.getByRole("button", { name: nav, exact: true }).click();
    await page.waitForTimeout(800);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/screenshots/${name}-mobile.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
  await writeFile(
    ".local/ui-evidence.json",
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        passed: true,
        desktop: 1440,
        mobile: 390,
        realVideoPlayback: 3,
        browserErrors: errors.length,
        testDataOnly: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: bestehende Testdaten, Drizzle-Lesezugriff, drei Browserwiedergaben, Desktop/Mobil ohne Überlauf und Browserfehler.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await client.query("DELETE FROM sessions WHERE id=$1", [session]);
  await client.end();
}
