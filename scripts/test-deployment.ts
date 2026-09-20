import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const origin = "https://artist.dorfspy.de";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  const r = await page.goto(origin);
  if (r?.status() !== 200) throw new Error("Startseite nicht erreichbar");
  const before = await (await page.request.get(origin + "/api/auth")).json();
  await page.getByLabel("E-Mail", { exact: true }).waitFor();
  await page.getByLabel("Passwort", { exact: true }).waitFor();
  if (before.needsSetup)
    await page.getByLabel("Einrichtungscode", { exact: false }).waitFor();
  await page.screenshot({
    path: before.needsSetup
      ? "docs/screenshots/server-setup-desktop.png"
      : "docs/screenshots/server-login-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  if (
    !(await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ))
  )
    throw new Error("Mobiler Überlauf");
  await page.screenshot({
    path: before.needsSetup
      ? "docs/screenshots/server-setup-mobile.png"
      : "docs/screenshots/server-login-mobile.png",
    fullPage: true,
  });
  const health = await page.request.get(origin + "/api/health");
  if (!health.ok()) throw new Error("Healthcheck fehlgeschlagen");
  const state = await page.request.get(origin + "/api/state");
  if (state.status() !== 401) throw new Error("Daten ungeschützt");
  const setup = await page.request.post(origin + "/api/auth", {
    headers: { Origin: origin },
    data: {
      action: "setup",
      email: "unauthorized-check@example.invalid",
      password: "not-a-real-account-password",
      setup_token: "invalid",
    },
  });
  if (setup.status() !== 403) throw new Error("Einrichtung ungeschützt");
  const auth = await (await page.request.get(origin + "/api/auth")).json();
  if (auth.needsSetup !== before.needsSetup)
    throw new Error("Test hat den Einrichtungsstatus geändert");
  if (errors.length) throw new Error(errors.join("; "));
  await writeFile(
    before.needsSetup
      ? "docs/test-evidence/deployment.json"
      : "docs/test-evidence/automation-deployment-browser.json",
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        origin,
        httpsVerified: true,
        health: health.status(),
        unauthenticatedState: state.status(),
        invalidSetupToken: setup.status(),
        productionHasNoAccount: before.needsSetup,
        desktopWidth: 1440,
        mobileWidth: 390,
        browserErrors: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: HTTPS, Dashboard-Startseite, Desktop/Mobil, Anmeldungspflicht und Einrichtungsschutz.",
  );
} finally {
  await browser.close();
}
