import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "./security";
export function publicAddress(ip: string) {
  if (isIP(ip) === 6)
    return /^[23][\da-f]{3}:/i.test(ip) && !/^2001:db8:/i.test(ip);
  if (isIP(ip) !== 4) return false;
  const [a, b, c] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export async function downloadAudio(
  value: string,
  signal?: AbortSignal,
  redirects = 0,
): Promise<Buffer> {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new AppError(
      "Audio-Download benötigt eine öffentliche HTTPS-Adresse.",
    );
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new AppError("Private Audio-Zieladresse gesperrt.");
  const chosen = addresses[0],
    max = 250 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        agent: false,
        headers: { Accept: "audio/*", "Accept-Encoding": "identity" },
        signal,
        lookup: ((_host: any, opts: any, cb: any) =>
          opts?.all
            ? cb(null, [chosen])
            : cb(null, chosen.address, chosen.family)) as any,
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) {
          res.resume();
          req.setTimeout(0);
          if (!res.headers.location || redirects >= 3)
            return reject(new AppError("Zu viele Audio-Weiterleitungen."));
          downloadAudio(
            new URL(res.headers.location, url).toString(),
            signal,
            redirects + 1,
          ).then(resolve, reject);
          return;
        }
        if (
          res.statusCode !== 200 ||
          Number(res.headers["content-length"] ?? 0) > max
        ) {
          res.destroy();
          reject(
            new AppError("Audio-Download abgewiesen oder größer als 250 MB."),
          );
          return;
        }
        const parts: Buffer[] = [];
        let bytes = 0;
        res.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > max) {
            res.destroy(new Error("Download zu groß."));
            return;
          }
          parts.push(chunk);
        });
        res.on("error", () =>
          reject(new AppError("Audio-Download unterbrochen.")),
        );
        res.on("end", () => resolve(Buffer.concat(parts)));
      },
    );
    req.setTimeout(30000, () => req.destroy(new Error("Download-Zeitlimit")));
    req.on("error", () =>
      reject(
        new AppError(
          "Audio-Download fehlgeschlagen. Statusabruf erneut starten.",
        ),
      ),
    );
  });
}
