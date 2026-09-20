"use client";
import { useState, type ReactNode } from "react";
import { Film, Sparkles, Download, Image as ImageIcon } from "lucide-react";
import { useStudio, Modal, Preview, Badge, type Row } from "./ui";
const stageNames: Record<string, string> = {
  planning: "Storyboard entsteht",
  images: "Szenenbilder entstehen",
  rendering: "Vollständigen Song rendern",
  ready: "Vollständiges Musikvideo fertig",
  blocked: "Produktion angehalten",
  cancelled: "Abgebrochen",
};
export function FullMusicVideos({
  runs,
  renderDelivery,
}: {
  runs?: Row[];
  renderDelivery?: (task: Row) => ReactNode;
}) {
  const { data, artistId, act, nav } = useStudio();
  const [selected, setSelected] = useState<Row | null>(null),
    [count, setCount] = useState(8),
    [busy, setBusy] = useState(false);
  const candidates = (
    runs ?? data.automation_runs.filter((r: Row) => r.artist_id === artistId)
  ).filter((r: Row) =>
    data.audio_variants.some((a: Row) => a.order_id === r.music_order_id),
  );
  if (!candidates.length) return null;
  const connection = data.image_connection;
  return (
    <section className="full-music-videos">
      <div className="sub-heading">
        <div>
          <small>DER GANZE SONG · EINE VISUELLE GESCHICHTE</small>
          <h2>Vollständige Musikvideos</h2>
        </div>
        <Film size={24} />
      </div>
      {candidates.map((run: Row) => {
        const p = data.music_video_productions?.find(
            (x: Row) => x.run_id === run.id,
          ),
          song = data.songs.find((s: Row) => s.id === run.song_id),
          scenes = (data.music_video_scenes ?? [])
            .filter((s: Row) => s.production_id === p?.id)
            .sort((a: Row, b: Row) => a.position - b.position),
          post = data.posts.find((x: Row) => x.id === p?.post_id),
          task = data.manual_tasks.find(
            (x: Row) =>
              x.post_id === post?.id &&
              x.task_key === "publish_full_music_video",
          ),
          job = data.jobs.find((j: Row) => j.id === p?.job_id);
        return (
          <article className="panel full-video-card" key={run.id}>
            <div className="panel-heading">
              <div>
                <small>
                  {p
                    ? `${Math.floor(p.snapshot.duration / 60)}:${String(Math.round(p.snapshot.duration % 60)).padStart(2, "0")} Minuten · ${p.scene_count} Bildmotive · ganzer Song`
                    : "Vollversion aus der vorhandenen Aufnahme"}
                </small>
                <h3>{song?.title}</h3>
              </div>
              {p && (
                <Badge
                  label={stageNames[p.state]}
                  status={
                    p.state === "ready"
                      ? "succeeded"
                      : p.state === "blocked"
                        ? "failed"
                        : "running"
                  }
                />
              )}
            </div>
            {!p ? (
              <>
                <p>
                  Die KI entwickelt ein Storyboard passend zu den Lyrics und
                  erzeugt mehrere Bilder mit deiner Künstlerreferenz. Daraus
                  entsteht ein Musikvideo über die gesamte Songlänge mit
                  Kamerabewegungen und weichen Übergängen.
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    setCount(8);
                    setSelected({ run });
                  }}
                >
                  <Sparkles size={17} />
                  Vollständiges Musikvideo erstellen
                </button>
              </>
            ) : (
              <>
                {p.error && (
                  <p className="error" role="alert">
                    {p.error}
                  </p>
                )}
                {p.state === "images" && (
                  <p>
                    {scenes.filter((s: Row) => s.asset_id).length} von{" "}
                    {p.scene_count} Szenenbildern fertig. Hauptporträt als feste
                    Künstlerreferenz.
                  </p>
                )}
                {p.state === "rendering" && (
                  <>
                    <progress max={100} value={job?.progress ?? 0} />
                    <p>
                      {job?.progress ?? 0} % · Gesamte Songlänge, Bildbewegung
                      und Überblendungen.
                    </p>
                  </>
                )}
                {p.state === "blocked" && (
                  <div className="actions">
                    <button
                      className="primary"
                      onClick={() => {
                        setCount(p.scene_count);
                        setSelected({ run, production: p });
                      }}
                    >
                      Vorhandene Produktion fortsetzen
                    </button>
                    <button onClick={() => nav("settings")}>
                      Provider & Budgets prüfen
                    </button>
                  </div>
                )}
                {p.storyboard && (
                  <details
                    className="storyboard-details"
                    open={p.state !== "ready"}
                  >
                    <summary>Storyboard & Szenen ({scenes.length})</summary>
                    <p>{p.storyboard.treatment}</p>
                    <p className="muted">
                      Dramaturgische Zuordnung anhand der Lyrics. Keine
                      automatische wortgenaue Gesangs-Ausrichtung.
                    </p>
                    <div className="music-storyboard-grid">
                      {scenes.map((s: Row) => {
                        const asset = data.assets.find(
                            (a: Row) => a.id === s.asset_id,
                          ),
                          generation = data.image_generations.find(
                            (g: Row) => g.id === s.generation_id,
                          );
                        return (
                          <div className="music-storyboard-scene" key={s.id}>
                            {asset ? (
                              <img
                                src={"/api/assets/" + asset.id}
                                alt={s.title}
                              />
                            ) : (
                              <div className="scene-placeholder">
                                <ImageIcon />
                                <span>
                                  {generation
                                    ? generation.state === "running"
                                      ? "Bild wird generiert"
                                      : generation.state
                                    : "Geplant"}
                                </span>
                              </div>
                            )}
                            <small>SZENE {s.position + 1}</small>
                            <h4>{s.title}</h4>
                            <blockquote>{s.lyric_excerpt}</blockquote>
                            <details>
                              <summary>Bildauftrag ansehen</summary>
                              <p>{s.prompt}</p>
                            </details>
                            {!asset && p.state === "blocked" && (
                              <label>
                                Vorhandenes Szenenbild zuordnen
                                <select
                                  defaultValue=""
                                  onChange={async (e) => {
                                    if (e.target.value)
                                      await act("music_video_scene_asset", {
                                        id: p.id,
                                        version: p.version,
                                        scene_id: s.id,
                                        asset_id: e.target.value,
                                      });
                                  }}
                                >
                                  <option value="">Bild auswählen …</option>
                                  {data.assets
                                    .filter(
                                      (a: Row) =>
                                        a.artist_id === p.artist_id &&
                                        a.kind === "image" &&
                                        !scenes.some(
                                          (x: Row) => x.asset_id === a.id,
                                        ),
                                    )
                                    .map((a: Row) => (
                                      <option key={a.id} value={a.id}>
                                        {a.name}
                                      </option>
                                    ))}
                                </select>
                                <button onClick={() => nav("library")}>
                                  Bild importieren
                                </button>
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
                {p.state === "ready" &&
                  post &&
                  (renderDelivery && task ? (
                    renderDelivery(task)
                  ) : (
                    <>
                      <Preview
                        asset={data.assets.find(
                          (a: Row) => a.id === post.asset_id,
                        )}
                        compact
                      />
                      <div className="actions">
                        <a
                          className="button primary"
                          href={"/api/assets/" + post.asset_id + "?download"}
                        >
                          <Download size={16} />
                          Vollständiges Musikvideo herunterladen
                        </a>
                        <button onClick={() => nav("tasks")}>
                          Beschreibung & Veröffentlichung
                        </button>
                      </div>
                    </>
                  ))}
              </>
            )}
          </article>
        );
      })}
      {selected && (
        <Modal
          title={
            selected.production
              ? "Musikvideo fortsetzen"
              : "Vollständiges Musikvideo produzieren"
          }
          description="Die vorhandene Aufnahme bleibt erhalten. Die KI erstellt die Bildgeschichte für den ganzen Song."
          onClose={() => !busy && setSelected(null)}
        >
          <label>
            Neue Bildmotive
            <input
              type="number"
              min={4}
              max={24}
              value={count}
              disabled={!!selected.production}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </label>
          <p>
            Ein Storyboard-Auftrag, {count} referenzbasierte Szenenbilder und
            ein lokales Rendering. Längere Szenen erhalten zusätzliche
            Nahaufnahmen und wechselnde Kamerabewegungen. Der Titel erscheint
            nur kurz am Anfang.
          </p>
          <p>
            {connection?.provider === "gemini_api"
              ? `Kostenansatz maximal ${(count * Number(connection.estimated_cost_usd)).toFixed(4)} USD für ${count} neue Bilder; vorhandene Bilder werden wiederverwendet.`
              : connection?.provider === "manual"
                ? "Bildprovider ist manuell: Storyboard entsteht per Text-KI, danach eigene Szenenbilder zuordnen."
                : "Bildproduktion über das vorhandene ChatGPT-Kontingent. Keine separate API-Abrechnung."}
          </p>
          <p className="muted">
            Eingerichtete Grenzen bleiben wirksam:{" "}
            {connection?.daily_limit ?? "–"} Bilder/Tag,{" "}
            {connection?.monthly_limit ?? "–"}/Monat. Bei fehlendem Kontingent
            hält die Produktion an. Ein unklarer Bildauftrag wird nicht
            automatisch erneut gesendet.
          </p>
          <button
            className="primary"
            disabled={
              busy || count < 4 || count > 24 || !Number.isInteger(count)
            }
            onClick={async () => {
              setBusy(true);
              try {
                const result = await act(
                  selected.production
                    ? "music_video_resume"
                    : "music_video_create",
                  {
                    ...(selected.production
                      ? {
                          id: selected.production.id,
                          version: selected.production.version,
                        }
                      : { run_id: selected.run.id, scene_count: count }),
                    approved: true,
                    connection_version: connection?.version ?? null,
                    approved_cost_usd:
                      connection?.provider === "gemini_api"
                        ? count * Number(connection.estimated_cost_usd)
                        : null,
                  },
                );
                if (result) setSelected(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Wird gestartet …"
              : selected.production
                ? "Bestätigen & fortsetzen"
                : "Musikvideo jetzt produzieren"}
          </button>
        </Modal>
      )}
    </section>
  );
}
