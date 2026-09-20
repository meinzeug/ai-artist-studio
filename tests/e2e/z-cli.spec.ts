import { test, expect } from "@playwright/test";
import pg from "pg";
import { randomBytes, createHash } from "node:crypto";
test("CLI-Konten: echte offizielle Loginlinks im Dashboard, kein API-Key, Abbruch und CSRF-Schutz", async ({
  page,
  context,
}) => {
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  const token = randomBytes(32).toString("hex"),
    sid = createHash("sha256").update(token).digest("hex");
  try {
    let user = (await db.query("SELECT id FROM users LIMIT 1")).rows[0];
    if (!user) {
      const r = await page.request.post("/api/auth", {
        headers: { Origin: "http://127.0.0.1:3212" },
        data: {
          action: "setup",
          email: "cli-test@example.invalid",
          password: randomBytes(24).toString("hex"),
        },
      });
      expect(r.ok()).toBeTruthy();
      user = (await db.query("SELECT id FROM users LIMIT 1")).rows[0];
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
    await page.goto("/");
    await page
      .getByRole("button", { name: "Jobs & Einstellungen", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Provider & Konten", exact: true })
      .click();
    await page.screenshot({
      path: "docs/screenshots/cli-providers-desktop.png",
      fullPage: true,
    });
    for (const provider of ["ChatGPT", "Google"]) {
      await page
        .getByRole("button", { name: provider + " verbinden", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText("ohne API-Key");
      if (provider === "ChatGPT")
        await page.screenshot({
          path: "docs/screenshots/cli-login-desktop.png",
          fullPage: true,
        });
      await page
        .getByRole("button", { name: "Anmeldung starten", exact: true })
        .click();
      const link = page.getByRole("link", {
        name: provider + "-Anmeldung öffnen",
        exact: true,
      });
      await expect(link).toBeVisible({ timeout: 45000 });
      const u = new URL((await link.getAttribute("href"))!);
      expect(u.hostname).toBe(
        provider === "ChatGPT" ? "auth.openai.com" : "accounts.google.com",
      );
      await page
        .getByRole("button", { name: "Anmeldung abbrechen", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Anmeldung starten", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Schließen", exact: true })
        .click();
    }
    const csrf = await page.request.post("/api/providers", {
      headers: { Origin: "https://evil.example" },
      data: { action: "start", provider: "codex" },
    });
    expect(csrf.status()).toBe(403);
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Google verbinden", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "docs/screenshots/cli-login-mobile.png",
      fullPage: true,
    });
  } finally {
    await db.query("DELETE FROM sessions WHERE id=$1", [sid]);
    await db.end();
  }
});
