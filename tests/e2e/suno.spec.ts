import { test, expect } from "@playwright/test";
import pg from "pg";
import { randomBytes, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
test("SunoAPI: Dashboard verbinden, Modal-Anleitung, Budgetfreigabe und gespeicherter Auftrag (Offline-Anbieter)", async ({
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
  try {
    const user = (
      await db.query("SELECT id FROM users ORDER BY created_at LIMIT 1")
    ).rows[0];
    if (!user) throw new Error("Core-E2E zuerst ausführen.");
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
    await page.goto("/");
    await page
      .getByRole("heading", { name: "Willkommen im Studio." })
      .waitFor();
    await page
      .getByRole("button", { name: "Einrichtungsanleitung", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Rückmelde-Adresse");
    await page.screenshot({
      path: "docs/screenshots/suno-guide-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Jetzt verbinden", exact: true })
      .click();
    await page
      .getByLabel("API-Schlüssel", { exact: true })
      .fill("wrong-test-key");
    await page
      .getByRole("button", { name: "Verbinden & prüfen", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "ungültig",
    );
    await page
      .getByLabel("API-Schlüssel", { exact: true })
      .fill("studio-test-key");
    await page
      .getByText("Produktion einrichten: Budget & Rückmelde-Adresse", {
        exact: true,
      })
      .click();
    await page
      .getByLabel("Rückmelde-Adresse (HTTPS)", { exact: true })
      .fill("https://example.com/api/suno/callback");
    await page.getByLabel("Bestätigte Credits pro Generierung").fill("5");
    await page.getByLabel("Creditlimit pro Tag").fill("10");
    await page.getByLabel("Creditlimit pro Monat").fill("50");
    await page.screenshot({
      path: "docs/screenshots/suno-connect-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Verbinden & prüfen", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText("Bereit zur Produktion", { exact: true }),
    ).toBeVisible();
    const state = await (await page.request.get("/api/state")).json();
    expect(JSON.stringify(state)).not.toContain("studio-test-key");
    expect(state.music_connection.encrypted_key).toBeUndefined();
    expect(Number(state.music_connection.remaining_credits)).toBe(125);
    const cmd = async (action: string, data: any) => {
      const r = await page.request.post("/api/command", {
        headers: { Origin: "http://127.0.0.1:3212" },
        data: { action, data },
      });
      expect(r.ok(), await r.text()).toBeTruthy();
      return r.json();
    };
    const song = state.songs[0],
      lyrics = state.lyrics_versions.find((l: any) => l.song_id === song.id);
    const order = await cmd("prepare_music_generation", {
      song_id: song.id,
      lyrics_version_id: lyrics.id,
    });
    await page.reload();
    await page
      .getByRole("button", { name: "Musikproduktion", exact: true })
      .click();
    const card = page
      .locator(".panel")
      .filter({ hasText: "SUNO-" + order.id.slice(0, 8).toUpperCase() })
      .first();
    await card
      .getByRole("button", { name: "Mit API produzieren", exact: true })
      .click();
    await page
      .getByLabel(
        "Ich bestätige den eingetragenen Creditbedarf für dieses Modell und gebe diesen Auftrag frei.",
      )
      .check();
    await page
      .getByRole("button", { name: "Produktion starten", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(
        async () => {
          const r = await db.query(
            "SELECT external_id FROM music_orders WHERE id=$1",
            [order.id],
          );
          return r.rows[0]?.external_id;
        },
        { timeout: 20000 },
      )
      .toBe("offline-browser-task");
    expect(
      (
        await db.query(
          "SELECT count(*) n FROM music_credit_reservations WHERE order_id=$1",
          [order.id],
        )
      ).rows[0].n,
    ).toBe("1");
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Einrichtungsanleitung", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "docs/screenshots/suno-guide-mobile.png",
      fullPage: true,
    });
    // Stop fixture polling after this test; this is not a real external cancellation.
    await db.query(
      "UPDATE music_orders SET state='cancelled',error='Offline-Test beendet' WHERE id=$1",
      [order.id],
    );
    await writeFile(
      ".local/suno-evidence.json",
      JSON.stringify(
        {
          testedAt: new Date().toISOString(),
          passed: true,
          provider: "sunoapi_org",
          liveProvider: false,
          mockedProvider: true,
          dashboardConnection: true,
          keyNeverReturned: true,
          productionQueued: true,
          mobileWidth: 390,
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
