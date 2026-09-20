import "dotenv/config";
import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const database =
  process.env.TEST_DATABASE_URL ??
  "postgresql://dennis@127.0.0.1:56432/artist_studio_test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 900000,
  expect: { timeout: 15000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3212",
    channel:
      process.env.PLAYWRIGHT_CHANNEL ??
      (existsSync("/usr/bin/google-chrome") ? "chrome" : undefined),
    headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx tsx scripts/test-server.ts",
    url: "http://127.0.0.1:3212/api/health",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      DATABASE_URL: database,
      APP_ORIGIN: "http://127.0.0.1:3212",
      STORAGE_ROOT: ".local/test-assets",
      QUEUE_NAME: "studio-test",
      NODE_OPTIONS:
        "--import=" + process.cwd() + "/tests/mocks/suno-preload.mjs",
    },
  },
});
