import { createHash } from "node:crypto";
import { one, transaction } from "./db";
import { enqueue } from "./jobs";
import { AppError } from "./security";
export async function prepareArtistStyle(run: any) {
  const profile = await one(
    "SELECT * FROM artist_style_profiles WHERE artist_id=$1 AND user_id=$2",
    [run.artist_id, run.user_id],
  );
  if (!profile) return true;
  for (const mode of ["research", "audio"] as const) {
    if (
      !(mode === "research"
        ? profile.research_query
        : profile.reference_asset_id) ||
      profile[mode + "_result"]
    )
      continue;
    const prior = profile[mode + "_job_id"]
      ? await one("SELECT * FROM jobs WHERE id=$1", [profile[mode + "_job_id"]])
      : null;
    if (prior && ["queued", "running"].includes(prior.state)) return false;
    if (prior && prior.input.run_attempt === run.attempt)
      throw new AppError(
        prior.error ??
          "Stilauftrag ohne Ergebnis. Unter Manuelle Aufgaben prüfen und gezielt fortsetzen.",
      );
    const digest = createHash("sha256")
      .update(`${run.id}:style:${mode}:${run.attempt}`)
      .digest("hex");
    const key = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    await transaction(async (c) => {
      // The existing enqueue path reserves one AI call and obeys the global stop.
      const job = await enqueue(
        run.user_id,
        run.artist_id,
        mode === "research" ? "auto_style_research" : "auto_style_audio",
        { run_id: run.id, run_attempt: run.attempt },
        key,
        c,
      );
      await c.query(
        `UPDATE artist_style_profiles SET ${mode}_job_id=$2,version=version+1 WHERE artist_id=$1`,
        [run.artist_id, job.id],
      );
    });
    return false;
  }
  return true;
}
