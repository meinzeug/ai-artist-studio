import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, readdir, rm, mkdir } from "node:fs/promises";
import sharp from "sharp";
import {
  fullMusicVideoTimeline,
  validateStoryboard,
} from "../src/lib/music-video";
import { runProcess } from "../src/lib/process";
const schema = "music_video_" + randomBytes(5).toString("hex"),
  url = new URL(process.env.TEST_DATABASE_URL!);
if (url.pathname !== "/artist_studio_test")
  throw Error("Isolierte Testdatenbank erforderlich");
url.searchParams.set("options", "-csearch_path=" + schema + ",public");
process.env.DATABASE_URL = url.toString();
process.env.STORAGE_ROOT = ".local/" + schema;
const { pool, query, one } = await import("../src/server/db"),
  { command } = await import("../src/server/commands"),
  { tickMusicVideos } = await import("../src/server/music-video"),
  { runMusicVideoStoryboard } =
    await import("../src/worker/music-video-storyboard"),
  { storage, saveUpload } = await import("../src/server/storage"),
  { renderVideo, makeAss } = await import("../src/server/media");
const user = randomUUID();
let runId: string,
  artistId: string,
  production: any,
  audio: any,
  portraits: any[] = [];
const lyrics =
  "Das Blatt ist weiß.\nDie Lampe scheint.\nIch lasse los.\nDer Morgen bleibt.";
const storyboard = {
  treatment:
    "Eine zusammenhängende Geschichte aus vier filmischen Einstellungen.",
  visual_style:
    "Warme natürliche Filmfarben, präzise gerichtetes Licht, gleiche fiktive erwachsene Figur.",
  caption:
    "Synthetisches Musikvideo eines virtuellen KI-gestützten Testartists.",
  hashtags: "#Softwaretest",
  scenes: lyrics.split("\n").map((lyric_excerpt, i) => ({
    title: "Szene " + i,
    lyric_excerpt,
    prompt: `Eigenständiges Bildmotiv ${i}, filmisches Licht und eine neue deutliche Handlung mit derselben Testfigur.`,
    camera: ["push_in", "pan_left", "pull_out", "pan_right"][i],
    weight: 1,
  })),
};
const cmd = (action: string, data: any) => command(user, { action, data });
before(async () => {
  await pool.query(`CREATE SCHEMA ${schema}`);
  for (const f of (await readdir("migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pool.query(await readFile("migrations/" + f, "utf8"));
  await query(
    "INSERT INTO users(id,email,password_hash) VALUES($1,'music-video-test@example.invalid','no-login')",
    [user],
  );
  await query("INSERT INTO settings(user_id) VALUES($1)", [user]);
  artistId = (await cmd("create_artist", { name: "Synthetischer Filmtest" }))
    .id;
  const song = (
    await cmd("create_song", {
      artist_id: artistId,
      title: "Vollständiger Testton",
    })
  ).id;
  const lid = (
    await cmd("save_lyrics", {
      song_id: song,
      base_version: 0,
      title: "Vollständiger Testton",
      lyrics,
    })
  ).id;
  const order = (
    await cmd("prepare_music_generation", {
      song_id: song,
      lyrics_version_id: lid,
    })
  ).id;
  await mkdir(storage.root, { recursive: true });
  for (const color of ["#ff2200", "#1144ff", "#eecc11", "#33dd88"]) {
    const saved = await saveUpload(
      "SYNTHETIC.png",
      await sharp({
        create: { width: 180, height: 320, channels: 3, background: color },
      })
        .png()
        .toBuffer(),
    );
    const id = randomUUID();
    await query(
      "INSERT INTO assets(id,artist_id,kind,name,storage_key,mime,bytes,sha256,metadata) VALUES($1,$2,'image','SYNTHETIC TEST IMAGE',$3,$4,$5,$6,$7)",
      [
        id,
        artistId,
        saved.storage_key,
        saved.mime,
        saved.bytes,
        saved.sha256,
        JSON.stringify(saved.metadata),
      ],
    );
    portraits.push({ ...saved, id });
  }
  const ff = await runProcess("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=36.4",
    "-c:a",
    "libmp3lame",
    "-y",
    storage.root + "/SYNTHETIC.mp3",
  ]);
  assert.equal(ff.code, 0);
  audio = {
    ...(await saveUpload(
      "SYNTHETIC.mp3",
      await readFile(storage.root + "/SYNTHETIC.mp3"),
    )),
    id: randomUUID(),
  };
  await query(
    "INSERT INTO assets(id,artist_id,song_id,kind,name,storage_key,mime,bytes,sha256,metadata) VALUES($1,$2,$3,'audio','SYNTHETIC TEST AUDIO',$4,$5,$6,$7,$8)",
    [
      audio.id,
      artistId,
      song,
      audio.storage_key,
      audio.mime,
      audio.bytes,
      audio.sha256,
      JSON.stringify(audio.metadata),
    ],
  );
  await query(
    "INSERT INTO audio_variants(id,song_id,asset_id,order_id,lyrics_version_id,label) VALUES($1,$2,$3,$4,$5,'synthetic')",
    [randomUUID(), song, audio.id, order, lid],
  );
  await query(
    "INSERT INTO artist_automations(artist_id,user_id,reference_asset_id,next_run_at) VALUES($1,$2,$3,now()+interval '1 day')",
    [artistId, user, portraits[0].id],
  );
  runId = randomUUID();
  await query(
    "INSERT INTO automation_runs(id,user_id,artist_id,local_day,stage,state,song_id,music_order_id) VALUES($1,$2,$3,current_date,'delivery','ready',$4,$5)",
    [runId, user, artistId, song, order],
  );
  await cmd("image_configure", {
    provider: "manual",
    version: 0,
    daily_limit: 10,
    monthly_limit: 100,
  });
});
after(async () => {
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
  await rm(storage.root, { recursive: true, force: true });
});
test("Vollversion verteilt alle 188,784 Sekunden; keine 30-/180-Sekunden-Abschneidung", () => {
  const scenes = Array.from({ length: 8 }, (_, i) => ({
    asset_id: randomUUID(),
    camera: "push_in",
    weight: i % 2 ? 1 : 2,
  }));
  const t = fullMusicVideoTimeline(188.784, "Song", scenes);
  assert.equal(t.end, 188.784);
  assert.ok(t.scenes.length > 8);
  assert.ok(
    Math.abs(t.scenes.reduce((n, s) => n + s.duration, 0) - 188.784) < 1 / 30,
  );
  assert.equal(t.subtitles.length, 0);
  assert.equal(t.title_duration, 4);
  assert.equal(t.transition, "dissolve");
  assert.match(makeAss(t), /0:00:04.00/);
  assert.throws(() => fullMusicVideoTimeline(1300, "Song", scenes));
});
test("Storyboard darf keine Lyrics erfinden und braucht unterschiedliche Bildaufträge", () => {
  assert.equal(validateStoryboard(storyboard, 4, lyrics).scenes.length, 4);
  assert.throws(
    () =>
      validateStoryboard(
        {
          ...storyboard,
          scenes: storyboard.scenes.map((s) => ({
            ...s,
            lyric_excerpt: "Nicht vorhanden",
          })),
        },
        4,
        lyrics,
      ),
    /Lyrics/,
  );
  assert.throws(() => validateStoryboard(storyboard, 8, lyrics), /genau 8/);
  assert.throws(
    () =>
      validateStoryboard(
        {
          ...storyboard,
          scenes: storyboard.scenes.map((s) => ({
            ...s,
            prompt: storyboard.scenes[0].prompt,
          })),
        },
        4,
        lyrics,
      ),
    /doppelte/,
  );
});
test("Vollversion benötigt Freigabe und Eigentümer; parallele Starts erzeugen einen Auftrag", async () => {
  await assert.rejects(
    () =>
      cmd("music_video_create", {
        run_id: runId,
        scene_count: 4,
        connection_version: 1,
      }),
    /bestätigen/,
  );
  await assert.rejects(() =>
    command(randomUUID(), {
      action: "music_video_create",
      data: { run_id: runId, approved: true },
    }),
  );
  await query(
    "UPDATE image_connections SET provider='gemini_api',estimated_cost_usd=.1 WHERE user_id=$1",
    [user],
  );
  for (const cost of [null, "kostenlos", NaN, 0.39])
    await assert.rejects(
      () =>
        cmd("music_video_create", {
          run_id: runId,
          scene_count: 4,
          connection_version: 1,
          approved: true,
          approved_cost_usd: cost,
        }),
      /bestätigen/,
    );
  await query(
    "UPDATE image_connections SET provider='manual',estimated_cost_usd=NULL WHERE user_id=$1",
    [user],
  );
  const values = {
    run_id: runId,
    scene_count: 4,
    connection_version: 1,
    approved: true,
    approved_cost_usd: null,
  };
  const created = await Promise.all([
    cmd("music_video_create", values),
    cmd("music_video_create", values),
  ]);
  assert.equal(created[0].id, created[1].id);
  production = created[0];
  await assert.rejects(
    () =>
      cmd("queue_ai", { kind: "music_video_storyboard", artist_id: artistId }),
    /Freigabeweg/,
  );
  await tickMusicVideos();
  await tickMusicVideos();
  assert.equal(
    (await query("SELECT * FROM jobs WHERE kind='music_video_storyboard'"))
      .length,
    1,
  );
});
test("Echte strukturierte Verarbeitung persistiert Lyrics-/Referenz-Snapshot und wiederholt kein fertiges Storyboard", async () => {
  const job = (await one(
    "SELECT * FROM jobs WHERE kind='music_video_storyboard'",
  ))!;
  await assert.rejects(() =>
    runMusicVideoStoryboard(job, new AbortController().signal, async () =>
      Response.json({ result: {} }),
    ),
  );
  await runMusicVideoStoryboard(
    job,
    new AbortController().signal,
    async (_url, opts) => {
      const input = JSON.parse(String(opts?.body));
      assert.match(input.prompt, /genau 4/);
      assert.match(input.prompt, /Das Blatt ist weiß/);
      return Response.json({ result: storyboard });
    },
  );
  await runMusicVideoStoryboard(job, new AbortController().signal, async () => {
    throw Error("No second call");
  });
  assert.equal((await query("SELECT * FROM music_video_scenes")).length, 4);
  await tickMusicVideos();
  assert.equal(
    (await one("SELECT state FROM music_video_productions"))!.state,
    "blocked",
  );
});
test("Manuelle Szenenbilder erhalten denselben Auftrag; Duplikate und veraltete Versionen gesperrt", async () => {
  const scenes = await query(
    "SELECT * FROM music_video_scenes ORDER BY position",
  );
  for (let i = 0; i < scenes.length; i++) {
    production = (await one("SELECT * FROM music_video_productions"))!;
    if (i === 1)
      await assert.rejects(
        () =>
          cmd("music_video_scene_asset", {
            id: production.id,
            version: production.version,
            scene_id: scenes[i].id,
            asset_id: portraits[0].id,
          }),
        /eigenes Bild/,
      );
    await cmd("music_video_scene_asset", {
      id: production.id,
      version: production.version,
      scene_id: scenes[i].id,
      asset_id: portraits[i].id,
    });
  }
  await assert.rejects(
    () =>
      cmd("music_video_resume", {
        id: production.id,
        version: 1,
        approved: true,
        connection_version: 1,
      }),
    /geändert/,
  );
  production = (await one("SELECT * FROM music_video_productions"))!;
  await cmd("music_video_resume", {
    id: production.id,
    version: production.version,
    approved: true,
    connection_version: 1,
  });
  await tickMusicVideos();
  await tickMusicVideos();
  assert.equal(
    (await query("SELECT * FROM video_projects")).length,
    1,
    (await one("SELECT error FROM music_video_productions"))?.error,
  );
  assert.equal(
    (await query("SELECT * FROM jobs WHERE kind='render_video'")).length,
    1,
  );
});
test("Vollständiger 36-Sekunden-Film: echte Überblendung, wechselnde Motive, AAC-Ton und vollständige Dekodierung", async () => {
  const project = (await one("SELECT * FROM video_projects"))!;
  const out = await renderVideo(project, portraits, audio, async () => {});
  assert.ok(out.metadata.duration > 36);
  assert.ok(Math.abs(out.metadata.duration - audio.metadata.duration) < 0.15);
  assert.ok(
    out.metadata.streams.some(
      (s: any) => s.codec === "h264" && s.width === 1080 && s.height === 1920,
    ),
  );
  assert.ok(out.metadata.streams.some((s: any) => s.codec === "aac"));
  const decode = await runProcess(
    "ffmpeg",
    ["-v", "error", "-i", storage.path(out.storage_key), "-f", "null", "-"],
    { timeout: 120000 },
  );
  assert.equal(decode.code, 0);
  // Mid-transition pixel must contain both red and blue, not a fade to black.
  const cut = project.timeline.scenes[0].duration;
  const frame = storage.root + "/transition.png";
  const f = await runProcess("ffmpeg", [
    "-v",
    "error",
    "-ss",
    String(cut + 0.3),
    "-i",
    storage.path(out.storage_key),
    "-frames:v",
    "1",
    "-y",
    frame,
  ]);
  assert.equal(f.code, 0);
  const pixel = await sharp(frame)
    .extract({ left: 540, top: 1000, width: 1, height: 1 })
    .raw()
    .toBuffer();
  assert.ok(pixel[0] > 60 && pixel[2] > 60, `Transition RGB ${pixel}`);
});

test("Szenen nutzen feste Referenz und Idempotenz; unklare Generation und Bildbudget verhindern weitere Aufträge", async () => {
  // Simulated provider state only. No network calls or paid generation.
  await query(
    "UPDATE image_connections SET provider='codex',model='gpt-image-2',version=2,daily_limit=1,state='connected' WHERE user_id=$1",
    [user],
  );
  await query(
    "UPDATE music_video_productions SET state='images',project_id=NULL,job_id=NULL,connection_version=2,error=NULL",
  );
  const scenes = await query(
    "SELECT * FROM music_video_scenes ORDER BY position",
  );
  await query(
    "UPDATE music_video_scenes SET asset_id=NULL WHERE id=ANY($1::uuid[])",
    [[scenes[0].id, scenes[1].id]],
  );
  await tickMusicVideos();
  await tickMusicVideos();
  const generated = await query("SELECT * FROM image_generations");
  assert.equal(
    generated.length,
    1,
    (await one("SELECT error FROM music_video_productions"))?.error,
  );
  assert.equal(generated[0].reference_asset_id, portraits[0].id);
  assert.equal(generated[0].identity_snapshot.name, "Synthetischer Filmtest");
  assert.equal(generated[0].reference_snapshot.sha256, portraits[0].sha256);
  await query(
    "UPDATE image_generations SET state='unknown_external_state',error='Simulierter unklarer Timeout' WHERE id=$1",
    [generated[0].id],
  );
  await tickMusicVideos();
  production = (await one("SELECT * FROM music_video_productions"))!;
  assert.equal(production.state, "blocked");
  await assert.rejects(
    () =>
      cmd("music_video_resume", {
        id: production.id,
        version: production.version,
        approved: true,
        connection_version: 2,
      }),
    /zuerst klären/,
  );
  assert.equal((await query("SELECT * FROM image_generations")).length, 1);
  // Resolve with an existing lawful test image; no second provider request.
  await cmd("image_resolve", {
    id: generated[0].id,
    note: "Manuell aufgelöster synthetischer Testauftrag",
    acknowledged: true,
    asset_id: portraits[0].id,
  });
  await cmd("music_video_resume", {
    id: production.id,
    version: production.version,
    approved: true,
    connection_version: 2,
  });
  await tickMusicVideos();
  await tickMusicVideos();
  production = (await one("SELECT * FROM music_video_productions"))!;
  assert.equal(production.state, "blocked");
  assert.match(production.error, /Bildbudget/);
  assert.equal((await query("SELECT * FROM image_generations")).length, 1);
  assert.equal(
    (await one("SELECT asset_id FROM music_video_scenes WHERE id=$1", [
      scenes[0].id,
    ]))!.asset_id,
    portraits[0].id,
  );
  // Emergency stop prevents even a queued storyboard from being created.
  await query("UPDATE settings SET emergency_stop=true WHERE user_id=$1", [
    user,
  ]);
  await query(
    "UPDATE music_video_productions SET state='planning',job_id=NULL",
  );
  const count = (await query("SELECT * FROM jobs")).length;
  await tickMusicVideos();
  assert.equal((await query("SELECT * FROM jobs")).length, count);
});

test("Künstlerautomatik startet nach Audioimport die Vollversion vor den zusätzlichen Kurzclips", async () => {
  const { tickAutomation } = await import("../src/server/automation");
  await query("UPDATE settings SET emergency_stop=false WHERE user_id=$1", [
    user,
  ]);
  await query(
    "UPDATE artist_automations SET approved_image_version=2,full_music_video=true,video_scene_count=4,next_run_at=now()+interval '1 day' WHERE artist_id=$1",
    [artistId],
  );
  const previous = (await one("SELECT * FROM automation_runs WHERE id=$1", [
      runId,
    ]))!,
    next = randomUUID();
  await query(
    "INSERT INTO automation_runs(id,user_id,artist_id,local_day,stage,state,song_id,music_order_id,full_music_video,video_scene_count) VALUES($1,$2,$3,current_date+1,'music','running',$4,$5,true,4)",
    [next, user, artistId, previous.song_id, previous.music_order_id],
  );
  await tickAutomation();
  await tickAutomation();
  const created = (await one(
    "SELECT * FROM music_video_productions WHERE run_id=$1",
    [next],
  ))!;
  assert.equal(created.scene_count, 4);
  assert.equal(created.state, "planning");
  assert.equal(created.snapshot.audio_hash, audio.sha256);
  assert.equal(
    (await one("SELECT stage FROM automation_runs WHERE id=$1", [next]))!.stage,
    "music_video",
  );
});
