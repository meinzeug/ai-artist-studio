"use client";
import { VideoScenes } from "./veo";
import { FullMusicVideos } from "./music-videos";
import { useState, useRef } from "react";
import {
  Plus,
  Play,
  Download,
  Clapperboard,
  Type,
  Image as ImageIcon,
  AudioLines,
  ChevronUp,
  ChevronDown,
  Trash2,
  Sparkles,
} from "lucide-react";
import {
  useStudio,
  SectionHead,
  Empty,
  Modal,
  Form,
  Input,
  Textarea,
  Select,
  Submit,
  Badge,
  ArtistRequired,
  Preview,
  type Row,
} from "./ui";
const templates = [
  {
    id: "character",
    name: "Charakter & Lyrics",
    sub: "Dein Künstler. Deine Worte.",
    icon: Type,
    className: "template-character",
  },
  {
    id: "scenes",
    name: "Visueller Musikclip",
    sub: "Eine Geschichte in Szenen.",
    icon: Clapperboard,
    className: "template-scenes",
  },
  {
    id: "visualizer",
    name: "Cover-Visualizer",
    sub: "Lass deinen Sound sichtbar werden.",
    icon: AudioLines,
    className: "template-visualizer",
  },
];
export function VideoStudio() {
  const { data, artistId, act, nav } = useStudio();
  const [edit, setEdit] = useState<Row | null>(null);
  const projects = data.video_projects.filter(
    (p: Row) => p.artist_id === artistId,
  );
  return (
    <>
      <SectionHead
        eyebrow="BRING DEINE MUSIK IN BEWEGUNG"
        title="Video-Studio."
        description="Künstlerbilder + Suno-Song → fertiges TikTok-MP4. Lokal gerendert, mit Bewegung und optionalen Lyrics."
      >
        <Badge label="1080 × 1920 · H.264 / AAC" />
      </SectionHead>
      <ArtistRequired>
        <FullMusicVideos />
        <div className="panel video-workflow">
          <div>
            <small>DEIN STANDARD-WORKFLOW · LOKAL MIT FFMPEG</small>
            <h2>Aus Bildern wird dein Musikvideo.</h2>
            <p>
              1. Künstlerbilder importieren · 2. Suno-Aufnahme und Songstelle
              wählen · 3. Vorlage gestalten und MP4 rendern
            </p>
            <p className="muted">
              Keine zusätzliche Video-API nötig. Alle Vorlagen verwenden die
              gewählte Songaufnahme als Tonspur, auch bei eingefügten
              Videoszenen.
            </p>
          </div>
          <button onClick={() => nav("library")}>
            Bilder & Audio importieren
          </button>
        </div>
        <div className="template-grid">
          {templates.map((t) => (
            <button
              className={"template-card " + t.className}
              onClick={() => setEdit({ template: t.id })}
              key={t.id}
            >
              <div className="template-art">
                <div className="template-phone">
                  {t.id === "character" ? (
                    <>
                      <div className="abstract-person" />
                      <span>
                        Deine Worte.
                        <br />
                        Deine Geschichte.
                      </span>
                    </>
                  ) : t.id === "scenes" ? (
                    <div className="scene-blocks">
                      <i />
                      <i />
                      <i />
                    </div>
                  ) : (
                    <>
                      <div className="mini-vinyl" />
                      <div className="viz-bars">
                        {Array.from({ length: 15 }, (_, i) => (
                          <i
                            key={i}
                            style={{ height: 10 + Math.abs(Math.sin(i)) * 27 }}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="template-icon">
                  <t.icon size={20} />
                </div>
              </div>
              <div className="template-title">
                <div>
                  <h3>{t.name}</h3>
                  <p>{t.sub}</p>
                </div>
                <Plus size={20} />
              </div>
            </button>
          ))}
        </div>
        <VideoScenes
          onUse={(id) => setEdit({ template: "scenes", seed_asset_id: id })}
        />
        <div className="sub-heading">
          <h2>Deine Videoprojekte</h2>
          <span className="muted">{projects.length} Projekte</span>
        </div>
        {projects.length ? (
          <div className="grid-two">
            {projects.map((p: Row) => {
              const renders = data.renders.filter(
                (r: Row) => r.project_id === p.id,
              );
              return (
                <article className="panel" key={p.id}>
                  <div className="panel-heading">
                    <div>
                      <small>
                        {p.template === "music_video"
                          ? "Vollständiges Musikvideo"
                          : templates.find((t) => t.id === p.template)
                              ?.name}{" "}
                        · v{p.version}
                      </small>
                      <h3>{p.name}</h3>
                    </div>
                    <button onClick={() => setEdit(p)}>Bearbeiten</button>
                  </div>
                  <div className="project-timeline">
                    {p.timeline.scenes.map((s: Row, i: number) => (
                      <div key={i} style={{ flex: s.duration }}>
                        <span>Szene {i + 1}</span>
                        <small>{s.duration}s</small>
                      </div>
                    ))}
                  </div>
                  <div className="actions">
                    <button
                      className="primary"
                      onClick={() => act("render_video", { project_id: p.id })}
                    >
                      <Play size={15} />
                      Video rendern
                    </button>
                    <a className="button" href={"/api/exports/project/" + p.id}>
                      <Download size={15} />
                      Projekt
                    </a>
                  </div>
                  {renders.map((r: Row) => (
                    <div className="render-result" key={r.id}>
                      <div className="card-top">
                        <strong>
                          Rendering · Projektversion {r.project_version}
                        </strong>
                        <Badge status={r.state} />
                      </div>
                      {["running", "queued"].includes(r.state) && (
                        <>
                          <progress value={r.progress} max="100" />
                          <small>{r.progress} %</small>
                        </>
                      )}
                      {r.error && <p className="error">{r.error}</p>}
                      {r.asset_id && (
                        <>
                          <Preview
                            asset={data.assets.find(
                              (a: Row) => a.id === r.asset_id,
                            )}
                            compact
                          />
                          <div className="actions">
                            <a
                              className="button"
                              href={"/api/assets/" + r.asset_id + "?download"}
                            >
                              <Download size={15} />
                              MP4 herunterladen
                            </a>
                            <button onClick={() => nav("publishing")}>
                              Beitrag vorbereiten
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title="Welcher Look passt zu deinem Song?"
            body="Wähle oben eine Vorlage, einen Audioausschnitt und dein Bildmaterial. Jedes Rendering erzeugt eine echte MP4-Datei."
          />
        )}
      </ArtistRequired>
      {edit && <VideoEditor project={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
function VideoEditor({
  project,
  onClose,
}: {
  project: Row;
  onClose: () => void;
}) {
  const { data, artistId, act, nav } = useStudio();
  const songs = data.songs.filter((s: Row) => s.artist_id === artistId);
  const assets = data.assets.filter(
    (a: Row) =>
      a.artist_id === artistId &&
      (project.template === "music_video"
        ? a.kind === "image"
        : ["image", "video"].includes(a.kind)),
  );
  const [songId, setSongId] = useState(
    project.song_id ??
      songs.find((s: Row) =>
        data.audio_variants.some((v: Row) => v.song_id === s.id),
      )?.id ??
      songs[0]?.id ??
      "",
  );
  const variants = data.audio_variants.filter((v: Row) => v.song_id === songId);
  const [variantId, setVariantId] = useState(
    project.variant_id ?? variants[0]?.id ?? "",
  );
  const variant = variants.find((v: Row) => v.id === variantId) ?? variants[0];
  const audio = data.assets.find((a: Row) => a.id === variant?.asset_id);
  const [start, setStart] = useState(
      Number(project.timeline?.start ?? variant?.clip_start ?? 0),
    ),
    [end, setEnd] = useState(
      Number(project.timeline?.end ?? variant?.clip_end ?? 15),
    ),
    [scenes, setScenes] = useState<Row[]>(
      project.timeline?.scenes ??
        (assets[0]
          ? [
              {
                asset_id: project.seed_asset_id ?? assets[0].id,
                duration:
                  Number(variant?.clip_end ?? 15) -
                  Number(variant?.clip_start ?? 0),
                crop_x: 0.5,
                crop_y: 0.5,
                motion: true,
              },
            ]
          : []),
    ),
    [subtitles, setSubtitles] = useState<Row[]>(
      project.timeline?.subtitles ?? [],
    ),
    [overlay, setOverlay] = useState(true),
    [title, setTitle] = useState(
      project.timeline?.title ??
        songs.find((s: Row) => s.id === songId)?.title ??
        "",
    ),
    [y, setY] = useState(project.timeline?.text_y ?? 0.65),
    [fontSize, setFontSize] = useState(project.timeline?.font_size ?? 56),
    [color, setColor] = useState(project.timeline?.color ?? "#ffffff"),
    [playTime, setPlayTime] = useState(0);
  const player = useRef<HTMLAudioElement>(null);
  const sceneAsset = data.assets.find((a: Row) => a.id === scenes[0]?.asset_id);
  const patch = (i: number, key: string, value: unknown) =>
    setScenes(scenes.map((s, j) => (j === i ? { ...s, [key]: value } : s)));
  const move = (i: number, delta: number) => {
    const next = [...scenes],
      dest = i + delta;
    if (dest < 0 || dest >= next.length) return;
    [next[i], next[dest]] = [next[dest], next[i]];
    setScenes(next);
  };
  return (
    <Modal
      title={
        templates.find((t) => t.id === project.template)?.name ??
        "Video bearbeiten"
      }
      description="Timeline, sichere Textbereiche und lokale Medien. Die Vorschau zeigt die Anordnung; das endgültige Ergebnis entsteht im Rendering."
      onClose={onClose}
      wide
    >
      {!variant || !assets.length ? (
        <Empty
          title="Für dieses Video fehlen noch Medien"
          body="Du benötigst eine dem Song zugeordnete Audioaufnahme und mindestens ein Bild oder Video."
          action="Medien importieren"
          onClick={() => {
            onClose();
            nav("library");
          }}
        />
      ) : (
        <div className="video-editor">
          <div className="video-controls">
            <Form
              onSubmit={async (v) => {
                const r = await act("save_video", {
                  ...project,
                  artist_id: artistId,
                  song_id: songId,
                  variant_id: variant.id,
                  name: v.name,
                  template: project.template,
                  timeline: {
                    start,
                    end,
                    scenes: ["scenes", "music_video"].includes(project.template)
                      ? scenes
                      : scenes
                          .slice(0, 1)
                          .map((s) => ({ ...s, duration: end - start })),
                    subtitles,
                    title,
                    title_duration: project.timeline?.title_duration ?? null,
                    font_size: fontSize,
                    text_y: y,
                    color,
                    fps: v.fps,
                    quality: v.quality,
                    transition: v.transition,
                  },
                });
                if (r) onClose();
              }}
            >
              <Input
                label="Projektname"
                name="name"
                defaultValue={
                  project.name ??
                  (songs.find((s: Row) => s.id === songId)?.title ?? "Video") +
                    " · " +
                    templates.find((t) => t.id === project.template)?.name
                }
                required
              />
              <div className="form-grid">
                <Select
                  label="Song"
                  value={songId}
                  onChange={(e) => {
                    setSongId(e.target.value);
                    setVariantId("");
                  }}
                >
                  {songs.map((s: Row) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Audioaufnahme"
                  value={variant?.id ?? ""}
                  onChange={(e) => setVariantId(e.target.value)}
                >
                  {variants.map((v: Row) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="form-grid">
                <Input
                  label="Start (s)"
                  type="number"
                  min="0"
                  step="any"
                  value={start}
                  onChange={(e) => setStart(Number(e.target.value))}
                />
                <Input
                  label="Ende (s)"
                  type="number"
                  min=".1"
                  max={audio?.metadata.duration}
                  step="any"
                  value={end}
                  onChange={(e) => setEnd(Number(e.target.value))}
                />
              </div>
              <h3>Bildspur & Szenen</h3>
              {scenes.map((s, i) => (
                <div className="scene-editor" key={i}>
                  <div className="card-top">
                    <strong>Szene {i + 1}</strong>
                    <div className="actions">
                      <button
                        type="button"
                        className="icon"
                        aria-label="Szene nach oben"
                        onClick={() => move(i, -1)}
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon"
                        aria-label="Szene nach unten"
                        onClick={() => move(i, 1)}
                      >
                        <ChevronDown size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon"
                        aria-label="Szene entfernen"
                        onClick={() =>
                          setScenes(scenes.filter((_, j) => j !== i))
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <Select
                    label="Szenenmaterial"
                    value={s.asset_id}
                    onChange={(e) => patch(i, "asset_id", e.target.value)}
                  >
                    {assets.map((a: Row) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Select>
                  {["scenes", "music_video"].includes(project.template) && (
                    <Input
                      label="Dauer (s)"
                      type="number"
                      step="any"
                      min=".5"
                      value={s.duration}
                      onChange={(e) =>
                        patch(i, "duration", Number(e.target.value))
                      }
                    />
                  )}
                  <div className="form-grid">
                    <Input
                      label="Bildausschnitt horizontal"
                      type="range"
                      min="0"
                      max="1"
                      step=".01"
                      value={s.crop_x}
                      onChange={(e) =>
                        patch(i, "crop_x", Number(e.target.value))
                      }
                    />
                    <Input
                      label="Bildausschnitt vertikal"
                      type="range"
                      min="0"
                      max="1"
                      step=".01"
                      value={s.crop_y}
                      onChange={(e) =>
                        patch(i, "crop_y", Number(e.target.value))
                      }
                    />
                  </div>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={s.motion}
                      onChange={(e) => patch(i, "motion", e.target.checked)}
                    />
                    Dezente Bewegung bei Bildern
                  </label>
                </div>
              ))}
              {["scenes", "music_video"].includes(project.template) && (
                <button
                  type="button"
                  onClick={() =>
                    setScenes([
                      ...scenes,
                      {
                        asset_id: assets[0].id,
                        duration: 5,
                        crop_x: 0.5,
                        crop_y: 0.5,
                        motion: true,
                      },
                    ])
                  }
                >
                  <Plus size={15} />
                  Szene hinzufügen
                </button>
              )}
              <Input
                label="Titel im Video"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <h3>Untertitel & Einblendzeiten</h3>
              <p className="muted">
                Zeitpunkte relativ zum Clipstart. Manuell prüfen und
                korrigieren.
              </p>
              {subtitles.map((s, i) => (
                <div className="timing-row" key={i}>
                  <input
                    aria-label="Untertitel Start"
                    type="number"
                    step="any"
                    value={s.start}
                    onChange={(e) =>
                      setSubtitles(
                        subtitles.map((x, j) =>
                          i === j ? { ...x, start: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label="Untertitel Ende"
                    type="number"
                    step="any"
                    value={s.end}
                    onChange={(e) =>
                      setSubtitles(
                        subtitles.map((x, j) =>
                          i === j ? { ...x, end: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label="Untertitel Text"
                    value={s.text}
                    onChange={(e) =>
                      setSubtitles(
                        subtitles.map((x, j) =>
                          i === j ? { ...x, text: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSubtitles(subtitles.filter((_, j) => i !== j))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="actions">
                <button
                  type="button"
                  onClick={() =>
                    setSubtitles([
                      ...subtitles,
                      { start: 0, end: Math.min(3, end - start), text: "" },
                    ])
                  }
                >
                  Textzeile hinzufügen
                </button>
                {variant.timings?.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setSubtitles(
                        variant.timings
                          .filter((t: Row) => t.end > start && t.start < end)
                          .map((t: Row) => ({
                            ...t,
                            start: Math.max(0, Number(t.start) - start),
                            end: Math.min(end - start, Number(t.end) - start),
                          })),
                      )
                    }
                  >
                    Aufnahme-Timing übernehmen
                  </button>
                )}
              </div>
              <div className="form-grid">
                <Input
                  label="Schriftgröße"
                  type="number"
                  min="28"
                  max="96"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                />
                <Input
                  label="Textposition vertikal"
                  type="range"
                  min=".15"
                  max=".8"
                  step=".01"
                  value={y}
                  onChange={(e) => setY(Number(e.target.value))}
                />
                <Input
                  label="Textfarbe"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
                <Select
                  label="Übergang"
                  name="transition"
                  defaultValue={project.timeline?.transition ?? "fade"}
                >
                  {project.template === "music_video" && (
                    <option value="dissolve">Weiche Überblendung</option>
                  )}
                  <option value="fade">Sanfte Ein-/Ausblendung</option>
                  <option value="cut">Harter Schnitt</option>
                </Select>
                <Select
                  label="Bildrate"
                  name="fps"
                  defaultValue={project.timeline?.fps ?? "30"}
                >
                  <option>24</option>
                  <option>25</option>
                  <option>30</option>
                </Select>
                <Select
                  label="Qualität"
                  name="quality"
                  defaultValue={project.timeline?.quality ?? "standard"}
                >
                  <option value="preview">Schnelle Vorschau</option>
                  <option value="standard">Standard</option>
                  <option value="high">Hohe Qualität</option>
                </Select>
              </div>
              <Submit>Projekt speichern</Submit>
            </Form>
          </div>
          <div className="video-preview-column">
            <div className="phone-preview">
              {sceneAsset?.kind === "image" ? (
                <img
                  src={"/api/assets/" + sceneAsset.id}
                  alt="Videoanordnung"
                  style={{
                    objectPosition: `${scenes[0].crop_x * 100}% ${scenes[0].crop_y * 100}%`,
                  }}
                />
              ) : (
                sceneAsset && (
                  <video
                    src={"/api/assets/" + sceneAsset.id}
                    muted
                    autoPlay
                    loop
                  />
                )
              )}
              <strong className="preview-title">{title}</strong>
              <div
                className="preview-subtitle"
                style={{ top: y * 100 + "%", fontSize: fontSize / 3.6, color }}
              >
                {subtitles
                  .filter((s) => s.start <= playTime && s.end > playTime)
                  .map((s) => s.text)
                  .join("\n")}
              </div>
              {overlay && (
                <div className="safe-overlay">
                  <div className="safe-top">SICHERER TEXTBEREICH</div>
                  <div className="safe-right">
                    ♡<br />◇<br />↗
                  </div>
                  <div className="safe-bottom">
                    Caption & Plattformnavigation
                  </div>
                </div>
              )}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={overlay}
                onChange={(e) => setOverlay(e.target.checked)}
              />
              Plattform-Overlay anzeigen
            </label>
            <audio
              ref={player}
              controls
              src={"/api/assets/" + audio?.id}
              onPlay={() => {
                if (
                  player.current &&
                  (player.current.currentTime < start ||
                    player.current.currentTime >= end)
                )
                  player.current.currentTime = start;
              }}
              onTimeUpdate={() => {
                const p = player.current;
                if (p) {
                  setPlayTime(p.currentTime - start);
                  if (p.currentTime >= end) p.pause();
                }
              }}
            />
            <div className="timeline-ruler">
              <span>{start.toFixed(1)} s</span>
              <span>{(end - start).toFixed(1)} s Clip</span>
              <span>{end.toFixed(1)} s</span>
            </div>
            <div className="project-timeline">
              {scenes.map((s, i) => (
                <div key={i} style={{ flex: s.duration }}>
                  {i + 1}
                  <small>{s.duration}s</small>
                </div>
              ))}
            </div>
            <p className="muted">
              Finale Ausgabe: 1080 × 1920, MP4, H.264, AAC. Ohne
              App-Wasserzeichen.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
