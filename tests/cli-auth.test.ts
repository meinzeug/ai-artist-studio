import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseLoginOutput,
  authStatus,
  managedDir,
  disconnectLogin,
  persistRefresh,
  loginStatus,
} from "../src/runner/auth";
test("CLI-Login extrahiert nur offizielle Loginlinks und Gerätecodes", () => {
  assert.deepEqual(
    parseLoginOutput(
      "codex",
      "\x1b[32mhttps://auth.openai.com/codex/device\x1b[0m\nABCD-EFGHJ",
    ),
    { url: "https://auth.openai.com/codex/device", deviceCode: "ABCD-EFGHJ" },
  );
  assert.equal(
    parseLoginOutput("codex", "https://evil.test/codex/device").url,
    undefined,
  );
  assert.equal(
    parseLoginOutput(
      "gemini",
      "https://accounts.google.com/o/oauth2/v2/auth?state=example",
    ).url,
    "https://accounts.google.com/o/oauth2/v2/auth?state=example",
  );
  assert.throws(() => loginStatus("missing", "other-owner"), /nicht gefunden/);
});
test("Studio-Login und Refresh bleiben im eigenen Authverzeichnis; API-Key gilt nicht als Konto", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "studio-auth-test-"));
  const old = process.env.RUNNER_AUTH_ROOT;
  process.env.RUNNER_AUTH_ROOT = root;
  try {
    await mkdir(managedDir("codex"));
    await writeFile(
      path.join(managedDir("codex"), "auth.json"),
      JSON.stringify({ OPENAI_API_KEY: "test-only", tokens: {} }),
    );
    assert.equal((await authStatus("codex")).authenticated, false);
    const fresh = path.join(root, "refresh.json");
    await writeFile(
      fresh,
      JSON.stringify({
        auth_mode: "chatgpt",
        tokens: { refresh_token: "mock-test-token" },
      }),
    );
    await persistRefresh("codex", managedDir("codex"), fresh);
    assert.equal((await authStatus("codex")).authenticated, true);
    const before = await readFile(fresh, "utf8");
    await persistRefresh("codex", "/unmanaged-global", fresh);
    assert.equal(await readFile(fresh, "utf8"), before);
    await disconnectLogin("codex");
    await assert.rejects(readFile(path.join(managedDir("codex"), "auth.json")));
  } finally {
    if (old) process.env.RUNNER_AUTH_ROOT = old;
    else delete process.env.RUNNER_AUTH_ROOT;
    await rm(root, { recursive: true, force: true });
  }
});
