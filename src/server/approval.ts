import { one, query, type Client } from "./db";
import { AppError, hash } from "./security";
export async function postSnapshot(postId: string, c?: Client) {
  const p = await one(
    "SELECT p.*,a.sha256,a.rights_status,acc.label AS account_label,acc.external_id AS account_external_id,cover.sha256 AS cover_hash FROM posts p JOIN assets a ON a.id=p.asset_id JOIN social_accounts acc ON acc.id=p.account_id LEFT JOIN assets cover ON cover.id=p.cover_id WHERE p.id=$1",
    [postId],
    c,
  );
  if (!p) throw new AppError("Beitrag nicht gefunden.", 404);
  return {
    post_id: p.id,
    version: p.version,
    account_id: p.account_id,
    account_external_id: p.account_external_id,
    account_label: p.account_label,
    asset_id: p.asset_id,
    sha256: p.sha256,
    cover_id: p.cover_id,
    cover_hash: p.cover_hash,
    caption: p.caption,
    hashtags: p.hashtags,
    is_aigc: p.is_aigc,
    commercial: p.commercial,
    privacy: p.privacy,
    interactions: p.interactions,
    rights_status: p.rights_status,
    rights_note: p.rights_note,
    scheduled_at: p.scheduled_at,
    timezone: p.timezone,
    action: "manual_export",
  };
}
export async function activeApproval(postId: string, c?: Client) {
  const snapshot = await postSnapshot(postId, c);
  const approval = await one(
    "SELECT * FROM approvals WHERE post_id=$1 AND state='approved' ORDER BY created_at DESC LIMIT 1",
    [postId],
    c,
  );
  if (!approval || approval.snapshot_hash !== hash(JSON.stringify(snapshot)))
    throw new AppError(
      "Keine gültige Freigabe für den aktuellen Inhalt vorhanden.",
      409,
    );
  return { approval, snapshot };
}
export async function invalidate(postId: string, c?: Client) {
  await query(
    "UPDATE approvals SET state='invalidated' WHERE post_id=$1 AND state='approved'",
    [postId],
    c,
  );
}
