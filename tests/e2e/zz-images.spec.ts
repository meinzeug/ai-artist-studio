import { test, expect } from "@playwright/test";
import pg from "pg";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

test("Bild-KI wählen, Anleitung öffnen und mit echtem ChatGPT-CLI-Login ein Bild in die Bibliothek übernehmen", async ({
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
  await page.emulateMedia({ reducedMotion: "reduce" });
  try {
    let user = (
      await db.query("SELECT id FROM users ORDER BY created_at LIMIT 1")
    ).rows[0];
    if (!user) {
      user = { id: randomUUID() };
      await db.query(
        "INSERT INTO users(id,email,password_hash) VALUES($1,'image-browser@example.invalid','test-session-only')",
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
    const cmd = async (action: string, data: any) => {
      const r = await page.request.post("/api/command", {
        headers: { Origin: "http://127.0.0.1:3212" },
        data: { action, data },
      });
      expect(r.ok(), await r.text()).toBeTruthy();
      return r.json();
    };
    let state = await (await page.request.get("/api/state")).json();
    if (!state.artists.length)
      await cmd("create_artist", {
        name: "TEST · Bildstudio",
        genre: "Synthetische Testdaten",
      });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Jobs & Einstellungen", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Provider & Konten", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Bild-KI-Anleitung", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("ChatGPT-Konto");
    await page.screenshot({
      path: "docs/screenshots/image-guide-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Schließen", exact: true }).click();
    await page
      .getByRole("button", { name: "Bild-KI auswählen", exact: true })
      .click();
    await page.getByLabel("Anbieter für KI-Bilder").selectOption("gemini_api");
    await expect(page.getByLabel("Gemini Bild-API-Key")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(
      "Der Google-Login der Text-CLI genügt hierfür nicht",
    );
    await page.getByLabel("Bildmodell").selectOption("gemini-3-pro-image");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/image-provider-mobile.png",
      fullPage: false,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel("Anbieter für KI-Bilder").selectOption("codex");
    await page
      .getByRole("button", { name: "Anmeldung prüfen", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "ChatGPT-Konto auf dem Runner angemeldet",
    );
    await page
      .getByRole("button", { name: "Auswahl speichern & prüfen" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    state = await (await page.request.get("/api/state")).json();
    expect(state.image_connection.provider).toBe("codex");
    expect(state.image_connection.live_tested_at).toBeNull();
    expect(state.image_connection.encrypted_key).toBeUndefined();
    await page
      .getByRole("button", { name: "Zur Bilderstellung", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Bild generieren", exact: true })
      .click();
    await page
      .getByLabel("Bildname", { exact: true })
      .fill("TEST · Echte Codex-Bildintegration");
    await page
      .getByLabel("Was soll auf dem Bild zu sehen sein?")
      .fill(
        "Create exactly one minimal original graphic: one turquoise circle on a dark navy background. No text, no people. This is a synthetic integration test image, not artist production. Ignore the artist style for this test.",
      );
    await page.getByLabel("Gewünschtes Bildformat").selectOption("1:1");
    await page.getByLabel("Bildreferenz (optional)").selectOption("");
    await page.getByLabel("Ich darf den Prompt").check();
    await page.getByLabel("Diesen Bildauftrag und die Nutzung").check();
    await page.screenshot({
      path: "docs/screenshots/image-generate-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Bildauftrag starten", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    let order: any;
    await expect
      .poll(
        async () => {
          const s = await (await page.request.get("/api/state")).json();
          order = s.image_generations.find(
            (g: any) => g.name === "TEST · Echte Codex-Bildintegration",
          );
          if (["failed", "unknown_external_state"].includes(order?.state))
            throw new Error(order.error);
          return order?.state;
        },
        { timeout: 590000, intervals: [3000] },
      )
      .toBe("succeeded");
    state = await (await page.request.get("/api/state")).json();
    const asset = state.assets.find((a: any) => a.id === order.asset_id);
    expect(asset.origin).toBe("codex_chatgpt_image");
    expect(asset.rights_status).toBe("unclear");
    expect(state.image_connection.live_tested_at).toBeTruthy();
    const response = await page.request.get("/api/assets/" + asset.id);
    expect(response.ok()).toBeTruthy();
    const metadata = await sharp(await response.body()).metadata();
    expect(metadata.width).toBeGreaterThan(256);
    expect(metadata.height).toBeGreaterThan(256);
    await expect(
      page.getByRole("button", { name: "Bild & Rechte", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await page.screenshot({
      path: "docs/screenshots/image-library-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Bild & Rechte", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("codex_chatgpt_image");
    await expect(page.getByRole("dialog").getByRole("img")).toBeVisible();
    await page.getByRole("button", { name: "Schließen", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/image-library-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole("button", { name: "Bild-KI ändern", exact: true })
      .click();
    await page.getByLabel("Anbieter für KI-Bilder").selectOption("manual");
    await page
      .getByRole("button", { name: "Auswahl speichern & prüfen" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await page
      .getByRole("button", { name: "Charakter & Medien", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Bild generieren", exact: true }),
    ).toBeDisabled();
    await mkdir("docs/test-evidence", { recursive: true });
    await writeFile(
      "docs/test-evidence/image-e2e.json",
      JSON.stringify(
        {
          checked_at: new Date().toISOString(),
          live_codex_image: true,
          cli_version: "0.154.0",
          separate_api_key: false,
          synthetic_test_asset: true,
          provider: asset.origin,
          sha256: asset.sha256,
          width: metadata.width,
          height: metadata.height,
          rights_status: asset.rights_status,
          gemini_api_live: false,
          browser_errors: errors,
        },
        null,
        2,
      ),
    );
    expect(errors).toEqual([]);
  } finally {
    await db.query("DELETE FROM sessions WHERE id=$1", [sid]);
    await db.end();
  }
});
