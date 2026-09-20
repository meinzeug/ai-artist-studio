import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  copyFile,
  rm,
  access,
  rename,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
export type LoginProvider = "codex" | "gemini";
const filenames = { codex: "auth.json", gemini: "oauth_creds.json" };
export const managedRoot = () =>
  path.resolve(process.env.RUNNER_AUTH_ROOT || ".local/runner-auth");
export const managedDir = (p: LoginProvider) => path.join(managedRoot(), p);
export async function authDirectory(p: LoginProvider) {
  try {
    await access(path.join(managedDir(p), filenames[p]));
    return managedDir(p);
  } catch {}
  return (
    process.env[p === "codex" ? "CODEX_AUTH_DIR" : "GEMINI_AUTH_DIR"] ||
    path.join(homedir(), p === "codex" ? ".codex" : ".gemini")
  );
}
export async function authStatus(p: LoginProvider) {
  const dir = await authDirectory(p);
  try {
    const data = JSON.parse(
      await readFile(path.join(dir, filenames[p]), "utf8"),
    );
    const connected =
      p === "codex"
        ? !!data.tokens &&
          !data.OPENAI_API_KEY &&
          (!data.auth_mode || data.auth_mode === "chatgpt")
        : !!data.refresh_token;
    return {
      authenticated: connected,
      managed: dir === managedDir(p),
      accountLogin: connected,
      method: p === "codex" ? "ChatGPT" : "Google",
    };
  } catch {
    return { authenticated: false, managed: false, accountLogin: false };
  }
}
// Keep official refreshes only in studio-owned credentials, never mutate a global CLI config.
export async function persistRefresh(
  p: LoginProvider,
  dir: string,
  copiedFile: string,
) {
  if (dir !== managedDir(p)) return;
  const bytes = await readFile(copiedFile);
  JSON.parse(bytes.toString());
  const dest = path.join(dir, filenames[p]);
  const temp = dest + ".tmp";
  await writeFile(temp, bytes, { mode: 0o600 });
  await rename(temp, dest);
}
export function parseLoginOutput(p: LoginProvider, text: string) {
  const clean = text
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  const urls = clean.match(/https:\/\/[^\s<>"\x1b]+/g) || [];
  const url = urls.find((value) => {
    try {
      const u = new URL(value);
      return p === "codex"
        ? ["auth.openai.com", "auth0.openai.com"].includes(u.hostname) &&
            u.pathname.includes("device")
        : u.hostname === "accounts.google.com" && u.pathname.includes("oauth");
    } catch {
      return false;
    }
  });
  const deviceCode =
    p === "codex"
      ? clean.match(/\b[A-Z0-9]{4,5}-[A-Z0-9]{4,5}\b/)?.[0]
      : undefined;
  return { url, deviceCode };
}
type Login = {
  id: string;
  owner: string;
  provider: LoginProvider;
  state: string;
  url?: string;
  deviceCode?: string;
  error?: string;
  expiresAt: string;
  child?: ChildProcess;
  dir: string;
  timer?: NodeJS.Timeout;
  output: string;
  saving?: boolean;
};
const logins = new Map<string, Login>();
export function loginBusy() {
  return [...logins.values()].some((x) =>
    ["starting", "waiting", "verifying"].includes(x.state),
  );
}
function publicLogin(x: Login) {
  return {
    id: x.id,
    provider: x.provider,
    state: x.state,
    url: x.url,
    deviceCode: x.deviceCode,
    error: x.error,
    expiresAt: x.expiresAt,
  };
}
function owned(id: string, owner: string) {
  const x = logins.get(id);
  if (!x || x.owner !== owner)
    throw new Error(
      "Anmeldevorgang nicht gefunden oder nach Runner-Neustart abgelaufen.",
    );
  return x;
}
function kill(x: Login) {
  if (x.timer) clearInterval(x.timer);
  if (x.child?.pid) {
    try {
      process.kill(-x.child.pid, "SIGTERM");
    } catch {}
  }
}
export async function startLogin(provider: LoginProvider, owner: string) {
  if (loginBusy())
    throw new Error(
      "Eine Anmeldung läuft bereits. Erst abschließen oder abbrechen.",
    );
  for (const [id, x] of logins)
    if (Date.parse(x.expiresAt) < Date.now()) logins.delete(id);
  const dir = await mkdtemp(path.join(tmpdir(), "studio-login-"));
  await mkdir(path.join(dir, ".codex"), { mode: 0o700 });
  await mkdir(path.join(dir, ".gemini"), { mode: 0o700 });
  await writeFile(
    path.join(dir, ".gemini/settings.json"),
    JSON.stringify({
      security: {
        auth: { selectedType: "oauth-personal" },
        folderTrust: { enabled: false },
      },
      general: { enableAutoUpdate: false },
      mcpServers: {},
      tools: { core: [] },
    }),
    { mode: 0o600 },
  );
  const x: Login = {
    id: randomUUID(),
    owner,
    provider,
    state: "starting",
    expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
    dir,
    output: "",
  };
  logins.set(x.id, x);
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: dir,
    CODEX_HOME: path.join(dir, ".codex"),
    NO_BROWSER: "true",
    NO_COLOR: "1",
    TERM: "xterm-256color",
    LANG: "C.UTF-8",
    NODE_ENV: "production",
  };
  const child = spawn(
    provider === "codex" ? "codex" : "python3",
    provider === "codex"
      ? ["login", "--device-auth", "-c", 'cli_auth_credentials_store="file"']
      : [path.resolve("src/runner/login_terminal.py"), "gemini", "-e", "none"],
    {
      cwd: dir,
      env,
      shell: false,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  x.child = child;
  const capture = (chunk: Buffer) => {
    x.output += chunk.toString();
    if (x.output.length > 100000) {
      x.state = "failed";
      x.error = "CLI-Anmeldung lieferte zu viel Ausgabe.";
      kill(x);
      return;
    }
    const parsed = parseLoginOutput(provider, x.output);
    if (parsed.url) {
      x.url = parsed.url;
      x.deviceCode = parsed.deviceCode;
      if (x.state === "starting") x.state = "waiting";
    }
    if (/Failed to authenticate with user code/i.test(x.output)) {
      x.state = "failed";
      x.error = "Google hat den Code nicht akzeptiert. Neue Anmeldung starten.";
      kill(x);
    }
  };
  child.stdout!.on("data", capture);
  child.stderr!.on("data", capture);
  const save = async () => {
    if (x.saving || !["starting", "waiting", "verifying"].includes(x.state))
      return;
    const file = path.join(
      dir,
      provider === "codex" ? ".codex" : ".gemini",
      filenames[provider],
    );
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
      const data = JSON.parse(raw);
      if (
        !(provider === "codex"
          ? data.tokens && !data.OPENAI_API_KEY
          : data.refresh_token)
      )
        return;
    } catch {
      return;
    }
    x.saving = true;
    try {
      await mkdir(managedDir(provider), { recursive: true, mode: 0o700 });
      const dest = path.join(managedDir(provider), filenames[provider]);
      await writeFile(dest + ".tmp", raw, { mode: 0o600 });
      await rename(dest + ".tmp", dest);
      x.state = "connected";
      x.url = undefined;
      x.deviceCode = undefined;
      x.output = "";
      kill(x);
    } catch {
      x.state = "failed";
      x.error = "Anmeldung konnte im Runner nicht gespeichert werden.";
      kill(x);
    }
  };
  child.on("error", () => {
    x.state = "failed";
    x.error = "CLI oder Python-PTY-Helfer fehlt auf diesem Runner.";
    kill(x);
    void rm(dir, { recursive: true, force: true });
  });
  child.on("exit", async () => {
    await save();
    kill(x);
    if (["starting", "waiting", "verifying"].includes(x.state)) {
      x.state = "failed";
      x.error =
        provider === "codex"
          ? "ChatGPT-Anmeldung abgebrochen. Gerätecode-Anmeldung in den ChatGPT-Sicherheitseinstellungen erlauben und erneut versuchen."
          : "Google-Anmeldung beendet. Erneut starten; bei Workspace-Konten kann ein Cloud-Projekt erforderlich sein.";
    }
    x.output = "";
    await rm(dir, { recursive: true, force: true });
  });
  x.timer = setInterval(() => {
    if (Date.now() > Date.parse(x.expiresAt)) {
      x.state = "expired";
      x.error = "Anmeldung abgelaufen. Bitte neu starten.";
      kill(x);
    } else void save();
  }, 700);
  x.timer.unref();
  return publicLogin(x);
}
export function loginStatus(id: string, owner: string) {
  return publicLogin(owned(id, owner));
}
export function submitLoginCode(id: string, owner: string, code: string) {
  const x = owned(id, owner);
  if (x.provider !== "gemini" || x.state !== "waiting")
    throw new Error("Dieser Login erwartet keinen Google-Code.");
  if (!/^[A-Za-z0-9_\/.~-]{10,2048}$/.test(code))
    throw new Error("Ungültiger Google-Bestätigungscode.");
  x.state = "verifying";
  x.child?.stdin?.write(code + "\n");
  return publicLogin(x);
}
export function cancelLogin(id: string, owner: string) {
  const x = owned(id, owner);
  if (x.state !== "connected") {
    x.state = "cancelled";
    kill(x);
  }
  return publicLogin(x);
}
export async function disconnectLogin(p: LoginProvider) {
  if (loginBusy()) throw new Error("Laufende Anmeldung zuerst abbrechen.");
  await rm(path.join(managedDir(p), filenames[p]), { force: true });
  return { ok: true, ...(await authStatus(p)) };
}
