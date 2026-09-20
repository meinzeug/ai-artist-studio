import { spawn } from "node:child_process";
export async function runProcess(
  bin: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string;
    timeout?: number;
    maxBytes?: number;
    signal?: AbortSignal;
    onStderr?: (s: string) => void;
  } = {},
) {
  return new Promise<{ stdout: string; stderr: string; code: number }>(
    (resolve, reject) => {
      const child = spawn(bin, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        detached: true,
      });
      let stdout = "",
        stderr = "",
        bytes = 0,
        settled = false;
      const stop = () => {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      };
      const timeout = setTimeout(() => {
        stop();
        finish(new Error("Zeitlimit überschritten."));
      }, options.timeout ?? 60000);
      const abort = () => {
        stop();
        finish(new Error("Auftrag abgebrochen."));
      };
      options.signal?.addEventListener("abort", abort, { once: true });
      function finish(error?: Error, code = 0) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve({ stdout, stderr, code });
      }
      child.on("error", finish);
      child.stdout.on("data", (b) => {
        bytes += b.length;
        if (bytes > (options.maxBytes ?? 2_000_000)) {
          stop();
          finish(new Error("Ausgabe überschreitet das Größenlimit."));
        } else stdout += b.toString();
      });
      child.stderr.on("data", (b) => {
        const s = b.toString();
        bytes += b.length;
        stderr = (stderr + s).slice(-100000);
        options.onStderr?.(s);
        if (bytes > (options.maxBytes ?? 2_000_000)) {
          stop();
          finish(new Error("Ausgabe überschreitet das Größenlimit."));
        }
      });
      child.on("close", (code) => finish(undefined, code ?? -1));
      child.stdin.on("error", () => {});
      child.stdin.end(options.input ?? "");
      if (options.signal?.aborted) abort();
    },
  );
}
