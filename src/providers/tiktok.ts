import { z } from "zod";
import { randomBytes, randomUUID } from "node:crypto";
import { one, query, transaction } from "../server/db";
import {
  AppError,
  encrypt,
  decrypt,
  hash,
  ownArtist,
  own,
  audit,
  verifyWebhook,
} from "../server/security";
const endpoint = "https://open.tiktokapis.com";
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
  open_id: z.string(),
  scope: z.string(),
});
function config() {
  const client_key = process.env.TIKTOK_CLIENT_KEY,
    client_secret = process.env.TIKTOK_CLIENT_SECRET,
    redirect_uri = process.env.TIKTOK_REDIRECT_URI;
  if (!client_key || !client_secret || !redirect_uri)
    throw new AppError(
      "TikTok OAuth nicht eingerichtet. App-Schlüssel und Redirect-URI fehlen.",
      503,
    );
  return { client_key, client_secret, redirect_uri };
}
async function tiktokFetch(path: string, init: RequestInit) {
  const r = await fetch(endpoint + path, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  const body = await r.json();
  if (
    !r.ok ||
    (body.error?.code && body.error.code !== "ok") ||
    typeof body.error === "string"
  )
    throw new AppError(
      "TikTok-Anfrage abgewiesen. Verbindung und gewährte Scopes prüfen.",
      502,
    );
  return body;
}
export async function connectUrl(userId: string, artistId: string) {
  await ownArtist(userId, artistId);
  const { client_key, redirect_uri } = config(),
    state = randomBytes(32).toString("hex");
  await query(
    "INSERT INTO oauth_states(state_hash,user_id,artist_id,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",
    [hash(state), userId, artistId],
  );
  return (
    "https://www.tiktok.com/v2/auth/authorize/?" +
    new URLSearchParams({
      client_key,
      redirect_uri,
      response_type: "code",
      scope: "user.info.basic,video.list",
      state,
    })
  );
}
export async function completeOAuth(
  userId: string,
  state: string,
  code: string,
) {
  const binding = await transaction(async (c) => {
    const s = await one(
      "DELETE FROM oauth_states WHERE state_hash=$1 AND user_id=$2 AND expires_at>now() RETURNING *",
      [hash(state), userId],
      c,
    );
    if (!s)
      throw new AppError(
        "OAuth-State ungültig, abgelaufen oder bereits verwendet.",
        403,
      );
    return s;
  });
  const cfg = config();
  const token = tokenSchema.parse(
    await tiktokFetch("/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...cfg,
        code,
        grant_type: "authorization_code",
      }),
    }),
  );
  let label = "TikTok-Konto";
  if (token.scope.split(",").includes("user.info.basic")) {
    const profile = await tiktokFetch(
      "/v2/user/info/?fields=open_id,display_name",
      { headers: { Authorization: "Bearer " + token.access_token } },
    );
    label = z.string().parse(profile.data.user.display_name);
  }
  const aid = randomUUID();
  const saved = await one(
    "INSERT INTO social_accounts(id,artist_id,label,external_id,scopes,access_token,refresh_token,expires_at,status) VALUES($1,$2,$3,$4,$5,$6,$7,now()+$8*interval '1 second','connected') ON CONFLICT (artist_id,platform,external_id) WHERE external_id IS NOT NULL DO UPDATE SET label=EXCLUDED.label,scopes=EXCLUDED.scopes,access_token=EXCLUDED.access_token,refresh_token=EXCLUDED.refresh_token,expires_at=EXCLUDED.expires_at,status='connected' RETURNING id",
    [
      aid,
      binding.artist_id,
      label,
      token.open_id,
      token.scope.split(","),
      encrypt(token.access_token),
      encrypt(token.refresh_token),
      token.expires_in,
    ],
  );
  await audit(userId, "tiktok.connected", saved!.id, {
    scopes: token.scope.split(","),
  });
  return saved!.id;
}
async function accessToken(accountId: string) {
  return transaction(async (c) => {
    const account = await one(
      "SELECT * FROM social_accounts WHERE id=$1 FOR UPDATE",
      [accountId],
      c,
    );
    if (!account?.access_token)
      throw new AppError("Konto besitzt keine OAuth-Verbindung.");
    if (new Date(account.expires_at).valueOf() > Date.now() + 60000)
      return { token: decrypt(account.access_token), scopes: account.scopes };
    const cfg = config();
    const fresh = tokenSchema.parse(
      await tiktokFetch("/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: cfg.client_key,
          client_secret: cfg.client_secret,
          grant_type: "refresh_token",
          refresh_token: decrypt(account.refresh_token),
        }),
      }),
    );
    await c.query(
      "UPDATE social_accounts SET access_token=$2,refresh_token=$3,scopes=$4,expires_at=now()+$5*interval '1 second' WHERE id=$1",
      [
        accountId,
        encrypt(fresh.access_token),
        encrypt(fresh.refresh_token),
        fresh.scope.split(","),
        fresh.expires_in,
      ],
    );
    return { token: fresh.access_token, scopes: fresh.scope.split(",") };
  });
}
export async function syncMetrics(userId: string, accountId: string) {
  await own(userId, "social_accounts", accountId);
  const { token, scopes } = await accessToken(accountId);
  if (!scopes.includes("video.list"))
    throw new AppError("Scope video.list wurde nicht gewährt.");
  const video = z.object({
    id: z.string(),
    share_url: z.url().optional(),
    view_count: z.number().nullable().optional(),
    like_count: z.number().nullable().optional(),
    comment_count: z.number().nullable().optional(),
    share_count: z.number().nullable().optional(),
  });
  let cursor: unknown = undefined,
    matched = 0;
  for (let page = 0; page < 10; page++) {
    const result = await tiktokFetch(
      "/v2/video/list/?fields=id,share_url,view_count,like_count,comment_count,share_count",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }),
      },
    );
    const videos = z.array(video).parse(result.data.videos ?? []);
    for (const v of videos) {
      const post = await one(
        "SELECT * FROM posts WHERE account_id=$1 AND (external_id=$2 OR published_url=$3)",
        [accountId, v.id, v.share_url ?? ""],
      );
      if (!post) continue;
      await transaction(async (c) => {
        await c.query(
          "UPDATE posts SET external_id=$2,verification='api_verified' WHERE id=$1",
          [post.id, v.id],
        );
        for (const [metric, value] of Object.entries({
          views: v.view_count,
          likes: v.like_count,
          comments: v.comment_count,
          shares: v.share_count,
        }))
          await c.query(
            "INSERT INTO metric_snapshots(id,post_id,metric,value,source,captured_at,quality) VALUES($1,$2,$3,$4,'TikTok Display API',now(),$5)",
            [
              randomUUID(),
              post.id,
              metric,
              value ?? null,
              value == null ? "unavailable" : "api",
            ],
          );
      });
      matched++;
    }
    if (!result.data.has_more) break;
    cursor = result.data.cursor;
  }
  await query("UPDATE social_accounts SET last_sync_at=now() WHERE id=$1", [
    accountId,
  ]);
  return {
    matched,
    note: "Nur freigegebene Basiskennzahlen; keine Watchtime oder Kommentartexte.",
  };
}
export async function receiveWebhook(raw: string, signature: string) {
  const secret = process.env.TIKTOK_CLIENT_SECRET;
  if (!secret || !verifyWebhook(raw, signature, secret))
    throw new AppError("Ungültige Webhook-Signatur.", 401);
  const payload = z
    .object({
      event: z.string(),
      client_key: z.string().optional(),
      create_time: z.number().optional(),
      user_openid: z.string().optional(),
      content: z.unknown().optional(),
    })
    .parse(JSON.parse(raw));
  if (
    payload.client_key &&
    payload.client_key !== process.env.TIKTOK_CLIENT_KEY
  )
    throw new AppError("Webhook für andere Anwendung.", 403);
  const eventId = hash(raw);
  const row = await one(
    "INSERT INTO webhook_events(id,provider,event) VALUES($1,'tiktok',$2) ON CONFLICT(id) DO NOTHING RETURNING id",
    [eventId, payload.event],
  );
  return { accepted: true, duplicate: !row };
}
