import { NextResponse } from "next/server";
import { db, one, query } from "@/server/db";
import { artists } from "@/server/schema";
import { eq, desc } from "drizzle-orm";
import { requireUser, AppError } from "@/server/security";
import { summarizeMetrics } from "@/lib/domain";
import { musicConnection } from "@/server/suno";
import { videoConnection } from "@/server/video-generation";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const direct = [
      "ideas",
      "songs",
      "assets",
      "video_projects",
      "video_generations",
      "campaigns",
      "posts",
      "comments",
      "insights",
      "experiments",
    ];
    const state: Record<string, any> = { user };
    await Promise.all(
      direct.map(async (table) => {
        state[table] = await query(
          `SELECT x.* FROM ${table} x JOIN artists a ON a.id=x.artist_id WHERE a.user_id=$1 ORDER BY x.created_at DESC`.replace(
            "x.created_at",
            table === "comments" ? "x.imported_at" : "x.created_at",
          ),
          [user.id],
        );
      }),
    );
    const relational: Record<string, string> = {
      identity_versions:
        "identity_versions x JOIN artists a ON a.id=x.artist_id",
      lyrics_versions:
        "lyrics_versions x JOIN songs s ON s.id=x.song_id JOIN artists a ON a.id=s.artist_id",
      music_orders:
        "music_orders x JOIN songs s ON s.id=x.song_id JOIN artists a ON a.id=s.artist_id",
      audio_variants:
        "audio_variants x JOIN songs s ON s.id=x.song_id JOIN artists a ON a.id=s.artist_id",
      renders:
        "renders x JOIN video_projects p ON p.id=x.project_id JOIN artists a ON a.id=p.artist_id",
      publication_attempts:
        "publication_attempts x JOIN posts p ON p.id=x.post_id JOIN artists a ON a.id=p.artist_id",
      approvals:
        "approvals x JOIN posts p ON p.id=x.post_id JOIN artists a ON a.id=p.artist_id",
      metric_snapshots:
        "metric_snapshots x JOIN posts p ON p.id=x.post_id JOIN artists a ON a.id=p.artist_id",
      rights_records:
        "rights_records x JOIN assets p ON p.id=x.asset_id JOIN artists a ON a.id=p.artist_id",
      artist_references:
        "artist_references x JOIN artists a ON a.id=x.artist_id",
      reply_drafts:
        "reply_drafts x JOIN comments p ON p.id=x.comment_id JOIN artists a ON a.id=p.artist_id",
    };
    await Promise.all(
      Object.entries(relational).map(async ([name, from]) => {
        state[name] = await query(
          `SELECT x.* FROM ${from} WHERE a.user_id=$1 ORDER BY x.created_at DESC`,
          [user.id],
        );
      }),
    );
    state.artists = await db
      .select()
      .from(artists)
      .where(eq(artists.user_id, user.id))
      .orderBy(desc(artists.created_at));
    state.settings = await one("SELECT * FROM settings WHERE user_id=$1", [
      user.id,
    ]);
    state.social_accounts = await query(
      "SELECT s.id,s.artist_id,s.platform,s.label,s.external_id,s.scopes,s.status,s.expires_at,s.last_sync_at FROM social_accounts s JOIN artists a ON a.id=s.artist_id WHERE a.user_id=$1",
      [user.id],
    );
    state.jobs = await query(
      "SELECT * FROM jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
      [user.id],
    );
    state.job_attempts = await query(
      "SELECT x.* FROM job_attempts x JOIN jobs j ON j.id=x.job_id WHERE j.user_id=$1 ORDER BY x.started_at DESC LIMIT 200",
      [user.id],
    );
    state.providers = await query(
      "SELECT * FROM provider_connections WHERE user_id=$1",
      [user.id],
    );
    state.director_messages = await query(
      "SELECT * FROM director_messages WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
      [user.id],
    );
    state.audit = await query(
      "SELECT * FROM audit_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30",
      [user.id],
    );
    state.budget = await query(
      "SELECT kind,state,count(*)::int AS count FROM budget_reservations WHERE user_id=$1 AND created_at>=date_trunc('day',now()) GROUP BY kind,state",
      [user.id],
    );
    state.analytics = summarizeMetrics(state.posts, state.metric_snapshots);
    state.storage_bytes = state.assets.reduce(
      (n: number, a: any) => n + Number(a.bytes),
      0,
    );
    state.integration = {
      tiktok: !!(
        process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET
      ),
      suno: "manual_or_sunoapi_org",
      direct_post: "not_supported_private_tool",
    };
    state.music_connection = await musicConnection(user.id);
    state.video_connection = await videoConnection(user.id);
    return NextResponse.json(state, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: e instanceof AppError ? e.status : 500 },
    );
  }
}
