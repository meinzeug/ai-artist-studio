import {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
  createHmac,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { one, query, type Client } from "./db";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  const candidate = scryptSync(password, salt, 64);
  return (
    key?.length === 128 && timingSafeEqual(Buffer.from(key, "hex"), candidate)
  );
}
export function verifyOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN || "http://127.0.0.1:3210";
  if (origin !== expected)
    throw new AppError("Anfrage stammt nicht aus diesem Studio.", 403);
}
export async function currentUser(request: Request) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("studio_session="))
    ?.slice(15);
  if (!cookie) return undefined;
  return one(
    "SELECT u.id,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>now()",
    [hash(cookie)],
  );
}
export async function requireUser(request: Request) {
  const user = await currentUser(request);
  if (!user) throw new AppError("Bitte anmelden.", 401);
  return user;
}
export async function ownArtist(userId: string, artistId: string, c?: Client) {
  const row = await one(
    "SELECT * FROM artists WHERE id=$1 AND user_id=$2",
    [artistId, userId],
    c,
  );
  if (!row) throw new AppError("Künstler nicht gefunden.", 404);
  return row;
}
const ownedTables = new Set([
  "ideas",
  "songs",
  "assets",
  "video_projects",
  "campaigns",
  "social_accounts",
  "posts",
  "comments",
  "insights",
  "experiments",
]);
export async function own(
  userId: string,
  table: string,
  objectId: string,
  c?: Client,
) {
  if (!ownedTables.has(table)) throw new Error("Invalid ownership table");
  const row = await one(
    `SELECT x.* FROM ${table} x JOIN artists a ON a.id=x.artist_id WHERE x.id=$1 AND a.user_id=$2`,
    [objectId, userId],
    c,
  );
  if (!row) throw new AppError("Objekt nicht gefunden.", 404);
  return row;
}
export function encryptionKey() {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key || !/^[a-f\d]{64}$/i.test(key))
    throw new AppError("TOKEN_ENCRYPTION_KEY fehlt oder ist ungültig.", 503);
  return Buffer.from(key, "hex");
}
export function encrypt(token: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((x) => x.toString("base64"))
    .join(".");
}
export function decrypt(value: string) {
  const [iv, tag, ciphertext] = value
    .split(".")
    .map((x) => Buffer.from(x, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(ciphertext), cipher.final()]).toString(
    "utf8",
  );
}
export function validFilename(name: string) {
  if (
    !name ||
    name.length > 180 ||
    /[\/\\\x00-\x1f\x7f]/.test(name) ||
    name.includes("..") ||
    name.startsWith(".")
  )
    throw new AppError(
      "Ungültiger Dateiname. Keine Pfade oder Steuerzeichen verwenden.",
    );
  return name;
}
export async function safeRemoteUrl(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443")
  )
    throw new AppError("Nur öffentliche HTTPS-Adressen erlaubt.");
  const addresses = isIP(u.hostname)
    ? [{ address: u.hostname }]
    : await lookup(u.hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some(
      ({ address: a }) =>
        a === "::1" ||
        a === "::" ||
        /^f[cd]/i.test(a) ||
        /^fe[89ab]/i.test(a) ||
        a.includes("::ffff:") ||
        /^(0|10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(a),
    )
  )
    throw new AppError("Lokale oder private Zieladresse ist nicht erlaubt.");
  return u;
}
export function verifyWebhook(
  raw: string,
  header: string,
  secret: string,
  now = Date.now(),
) {
  const parts = Object.fromEntries(
    header.split(",").map((v) => v.trim().split("=")),
  );
  if (
    !parts.t ||
    !parts.s ||
    !/^[a-f\d]{64}$/i.test(parts.s) ||
    Math.abs(now / 1000 - Number(parts.t)) > 300
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(parts.t + "." + raw)
    .digest();
  return timingSafeEqual(expected, Buffer.from(parts.s, "hex"));
}
export async function audit(
  userId: string,
  action: string,
  objectId?: string,
  details: unknown = {},
  c?: Client,
) {
  await query(
    "INSERT INTO audit_events(id,user_id,action,object_id,details) VALUES(gen_random_uuid(),$1,$2,$3,$4)",
    [userId, action, objectId ?? null, JSON.stringify(details)],
    c,
  );
}
