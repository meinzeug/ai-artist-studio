import { spawn } from "node:child_process";
import { writeFile, mkdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import net from "node:net";
const action = process.argv[2] ?? "start";
const pidFile = ".local/studio.pid";
if (action === "stop") {
  const pid = Number(await readFile(pidFile, "utf8"));
  const cwd = await import("node:fs/promises").then((fs) =>
    fs.readlink(`/proc/${pid}/cwd`),
  );
  if (cwd !== process.cwd())
    throw new Error("PID gehört nicht zu diesem Projekt.");
  process.kill(pid, "SIGTERM");
  console.log("Studio wird beendet.");
  process.exit(0);
}
await mkdir(".local", { recursive: true });
for (const port of [3210, 3211]) {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} ist belegt. Bestehende Studio-Prozesse zuerst beenden.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(() => resolve()));
  });
}
await writeFile(pidFile, String(process.pid));
const services = [
  [
    "Web",
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3210",
    ],
  ],
  ["Worker", ["--import", "tsx", "src/worker/main.ts"]],
  ["Runner", ["--import", "tsx", "src/runner/main.ts"]],
] as const;
const processes = services.map(([name, args]) => {
  const p = spawn(process.execPath, [...args], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });
  p.on("exit", (code) => {
    console.log(name, "beendet", code);
    if (!stopping) {
      console.error(
        "Studio-Prozess unerwartet beendet; die übrigen Prozesse werden angehalten.",
      );
      void stop();
    }
  });
  return p;
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const p of processes) p.kill("SIGTERM");
  await unlink(pidFile).catch(() => {});
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log(
  "Studio: http://127.0.0.1:3210. Strg+C beendet alle drei Anwendungsprozesse.",
);
