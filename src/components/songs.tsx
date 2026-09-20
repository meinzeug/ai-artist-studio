"use client";
import { useState, useRef, useEffect } from "react";
import { SunoConnectionCard, SunoOrderActions } from "./suno";
import {
  Plus,
  Sparkles,
  Copy,
  Download,
  ArrowRight,
  Undo2,
  Lock,
  Disc3,
  Star,
  Upload,
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
  CopyButton,
  Preview,
  type Row,
  formatDate,
} from "./ui";
export function Lyrics() {
  const { data, artistId, act, nav } = useStudio();
  const [songId, setSongId] = useState(""),
    [create, setCreate] = useState(false),
    [revision, setRevision] = useState(false);
  const songs = data.songs.filter((s: Row) => s.artist_id === artistId),
    song = songs.find((s: Row) => s.id === songId) ?? songs[0];
  const versions = data.lyrics_versions
    .filter((v: Row) => v.song_id === song?.id)
    .sort((a: Row, b: Row) => b.version - a.version);
  return (
    <>
      <SectionHead
        eyebrow="WORTE, DIE BLEIBEN"
        title="Songs & Lyrics."
        description="Schreibe, höre auf deinen Instinkt und gib jeder Zeile Raum."
      >
        <button onClick={() => setCreate(true)}>
          <Plus size={16} />
          Song anlegen
        </button>
      </SectionHead>
      <ArtistRequired>
        {songs.length ? (
          <>
            <div className="toolbar">
              <select
                aria-label="Song auswählen"
                value={song?.id}
                onChange={(e) => setSongId(e.target.value)}
              >
                {songs.map((s: Row) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              <Badge label={"Identitätsversion " + song.identity_version} />
              {data.settings.mode === "production" && (
                <button
                  className="primary"
                  onClick={() =>
                    act("production_workflow", { song_id: song.id })
                  }
                >
                  <Sparkles size={16} />
                  Lyrics & Suno-Paket automatisch
                </button>
              )}
              <button
                onClick={async () =>
                  await act("queue_ai", {
                    artist_id: artistId,
                    kind: "write_lyrics",
                    input: { song_id: song.id },
                  })
                }
              >
                <Sparkles size={16} />
                Songtext entwickeln
              </button>
            </div>
            <LyricsEditor
              key={song.id}
              song={song}
              versions={versions}
              onRevise={() => setRevision(true)}
            />
          </>
        ) : (
          <Empty
            title="Eine leere Seite voller Möglichkeiten"
            body="Übernimm eine Songidee oder lege einen Song an. Lyrics und Musikstil werden getrennt und versioniert gespeichert."
            action="Song anlegen"
            onClick={() => setCreate(true)}
          />
        )}
      </ArtistRequired>
      {create && (
        <Modal title="Neuen Song anlegen" onClose={() => setCreate(false)}>
          <Form
            onSubmit={async (v) => {
              const r = await act("create_song", {
                artist_id: artistId,
                title: v.title,
              });
              if (r) {
                setSongId(r.id);
                setCreate(false);
              }
            }}
          >
            <Input name="title" label="Songtitel" required />
            <Submit>Song anlegen</Submit>
          </Form>
        </Modal>
      )}
      {revision && song && (
        <Modal
          title="Gezielt überarbeiten"
          description="Ein begrenzter Schreibauftrag. Geschützte menschliche Passagen bleiben erhalten."
          onClose={() => setRevision(false)}
        >
          <Form
            onSubmit={async (v) => {
              if (
                await act("queue_ai", {
                  artist_id: artistId,
                  kind: "revise_lyrics",
                  input: {
                    song_id: song.id,
                    prompt: v.action + "\n" + v.prompt,
                  },
                })
              )
                setRevision(false);
            }}
          >
            <Select label="Aktion" name="action">
              {[
                "Refrainvarianten entwickeln",
                "Ausgewählte Zeile verbessern",
                "Reimschema ändern",
                "Sprache vereinfachen",
                "Sprache verdichten",
                "Perspektive wechseln",
                "Ausspracheprobleme markieren",
                "Song kürzen",
                "Song erweitern",
                "TikTok-Passage herausarbeiten",
                "Alternative Bridge",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
            <Textarea
              label="Ausgewählte Zeile oder genaue Anweisung"
              name="prompt"
              required
            />
            <Submit>Überarbeitung starten</Submit>
          </Form>
        </Modal>
      )}
    </>
  );
}
function LyricsEditor({
  song,
  versions,
  onRevise,
}: {
  song: Row;
  versions: Row[];
  onRevise: () => void;
}) {
  const { act, nav } = useStudio();
  const [draft] = useState(() => {
    try {
      return JSON.parse(
        sessionStorage.getItem("lyrics-draft:" + song.id) ?? "null",
      );
    } catch {
      return null;
    }
  });
  const [latest, setLatest] = useState<Row | undefined>(
    draft?.base ?? versions[0],
  );
  const [lyrics, setLyrics] = useState(draft?.lyrics ?? latest?.lyrics ?? ""),
    [style, setStyle] = useState(draft?.style ?? latest?.style_prompt ?? ""),
    [title, setTitle] = useState(draft?.title ?? latest?.title ?? song.title),
    [locks, setLocks] = useState<string[]>(
      draft?.locks ?? latest?.protected_lines ?? [],
    ),
    [compare, setCompare] = useState("");
  const history = useRef<string[]>([]);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    sessionStorage.setItem(
      "lyrics-draft:" + song.id,
      JSON.stringify({ base: latest, lyrics, style, title, locks }),
    );
  }, [song.id, latest, lyrics, style, title, locks]);
  const other = versions.find((v) => v.id === compare);
  return (
    <div className="lyrics-layout">
      <div className="panel lyrics-paper">
        {(versions[0]?.version ?? 0) !== (latest?.version ?? 0) && (
          <div className="warning">
            Eine neuere gespeicherte Version liegt vor. Dein Arbeitsstand bleibt
            erhalten.
            <button
              onClick={() => {
                const v = versions[0];
                setCompare(v.id);
              }}
            >
              Vergleichen
            </button>
            <button
              onClick={() => {
                const v = versions[0];
                history.current.push(lyrics);
                setLatest(v);
                setLyrics(v.lyrics);
                setStyle(v.style_prompt);
                setTitle(v.title);
                setLocks(v.protected_lines ?? []);
              }}
            >
              Neueste Version in Editor laden
            </button>
          </div>
        )}
        <div className="editor-toolbar">
          <div>
            <NotebookIcon /> <strong>Songtext</strong>
            <Badge
              label={latest ? "Version " + latest.version : "Neuer Entwurf"}
            />
          </div>
          <div className="actions">
            <button
              className="subtle"
              title="Letzte Änderung rückgängig"
              onClick={() => {
                const value = history.current.pop();
                if (value !== undefined) setLyrics(value);
              }}
            >
              <Undo2 size={15} />
            </button>
            <button
              className="subtle"
              onClick={() => {
                const a = area.current;
                if (a) {
                  const line = lyrics.slice(a.selectionStart, a.selectionEnd);
                  if (line.trim()) setLocks([...locks, line]);
                }
              }}
            >
              <Lock size={15} />
              Auswahl schützen
            </button>
            <CopyButton value={lyrics} />
          </div>
        </div>
        <input
          className="song-title-input"
          aria-label="Songtitel im Editor"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className={other ? "compare-grid" : ""}>
          <textarea
            ref={area}
            aria-label="Songtext"
            className="lyric-input"
            value={lyrics}
            onChange={(e) => {
              history.current.push(lyrics);
              setLyrics(e.target.value);
            }}
            placeholder={
              "[Verse 1]\nHier beginnt deine Geschichte …\n\n[Chorus]\nEine Zeile, die bleibt."
            }
          />
          {other && (
            <div className="comparison">
              <Badge label={"Version " + other.version} />
              <pre>{other.lyrics}</pre>
              <button
                onClick={() => {
                  history.current.push(lyrics);
                  setLyrics(other.lyrics);
                  setStyle(other.style_prompt);
                }}
              >
                Als Arbeitsstand übernehmen
              </button>
            </div>
          )}
        </div>
        {locks.length > 0 && (
          <div className="protected-lines">
            <strong>
              <Lock size={14} /> Geschützte Passagen
            </strong>
            {locks.map((line, i) => (
              <blockquote key={i}>{line}</blockquote>
            ))}
            <button
              onClick={async () => {
                if (latest && (await act("unlock_lyrics", { id: latest.id })))
                  setLocks([]);
                else if (!latest) setLocks([]);
              }}
            >
              Schutz bewusst aufheben
            </button>
          </div>
        )}
        <div className="editor-footer">
          <small>
            {lyrics.length} Zeichen · Originale Versionen bleiben erhalten
          </small>
          <button onClick={onRevise}>
            <Sparkles size={16} />
            Mit KI überarbeiten
          </button>
        </div>
      </div>
      <div className="stack">
        <div className="panel">
          <h3>Der Sound zum Text</h3>
          <Form
            key={latest?.version ?? 0}
            onSubmit={async (v) => {
              const saved = await act("save_lyrics", {
                song_id: song.id,
                base_version: latest?.version ?? 0,
                title,
                lyrics,
                style_prompt: style,
                negative_prompt: v.negative_prompt,
                pronunciation: v.pronunciation,
                notes: v.notes,
                hooks: String(v.hooks ?? "")
                  .split("\n")
                  .filter(Boolean),
                protected_lines: locks,
              });
              if (saved)
                setLatest({
                  ...latest,
                  id: saved.id,
                  version: (latest?.version ?? 0) + 1,
                  title,
                  lyrics,
                  style_prompt: style,
                  negative_prompt: v.negative_prompt,
                  pronunciation: v.pronunciation,
                  notes: v.notes,
                  hooks: String(v.hooks ?? "")
                    .split("\n")
                    .filter(Boolean),
                  protected_lines: locks,
                });
            }}
          >
            <Textarea
              label="Musikstil-Prompt"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="Tempo, Instrumente, Stimmung, Stimmcharakter …"
            />
            <Textarea
              label="Negative Stilvorgaben (soweit unterstützt)"
              name="negative_prompt"
              rows={2}
              defaultValue={latest?.negative_prompt ?? ""}
            />
            <Textarea
              label="Aussprachehinweise"
              name="pronunciation"
              rows={2}
              defaultValue={latest?.pronunciation ?? ""}
            />
            <Textarea
              label="Produktionsnotizen"
              name="notes"
              rows={2}
              defaultValue={latest?.notes ?? ""}
            />
            <Textarea
              label="Hook-Passagen (eine pro Zeile)"
              name="hooks"
              rows={2}
              defaultValue={latest?.hooks?.join("\n") ?? ""}
            />
            <Submit>Neue Version speichern</Submit>
          </Form>
        </div>
        <div className="panel">
          <h3>Versionen vergleichen</h3>
          <select
            aria-label="Vergleichsversion"
            value={compare}
            onChange={(e) => setCompare(e.target.value)}
          >
            <option value="">Version auswählen</option>
            {versions.map((v) => (
              <option value={v.id} key={v.id}>
                Version {v.version} · {v.source === "human" ? "Mensch" : "KI"} ·{" "}
                {formatDate(v.created_at)}
              </option>
            ))}
          </select>
          <p className="muted">
            Die Übernahme eines älteren Stands wird beim Speichern zu einer
            neuen Version.
          </p>
          {latest && (
            <button
              className="primary full"
              onClick={async () => {
                if (
                  await act("prepare_music_generation", {
                    song_id: song.id,
                    lyrics_version_id: latest.id,
                  })
                )
                  nav("music");
              }}
            >
              Suno-Paket vorbereiten
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
function NotebookIcon() {
  return <Disc3 size={18} />;
}
export function MusicProduction() {
  const { data, artistId, act, nav } = useStudio();
  const [songId, setSongId] = useState(""),
    [variant, setVariant] = useState<Row | null>(null);
  const songs = data.songs.filter((s: Row) => s.artist_id === artistId),
    song = songs.find((s: Row) => s.id === songId) ?? songs[0],
    orders = data.music_orders.filter((o: Row) => o.song_id === song?.id),
    variants = data.audio_variants.filter((v: Row) => v.song_id === song?.id);
  return (
    <>
      <SectionHead
        eyebrow="VOM ENTWURF ZUR AUFNAHME"
        title="Dein Sound nimmt Form an."
        description="Produziere mit Suno, importiere deine Aufnahme und finde deinen Master."
      >
        <Badge
          label={
            data.music_connection?.state === "connected"
              ? "SunoAPI.org · API verbunden"
              : "Suno · manueller Workflow"
          }
        />
      </SectionHead>
      <SunoConnectionCard />
      <ArtistRequired>
        {song ? (
          <>
            <div className="toolbar">
              <select
                aria-label="Produktionssong"
                value={song.id}
                onChange={(e) => setSongId(e.target.value)}
              >
                {songs.map((s: Row) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              <button className="primary" onClick={() => nav("library")}>
                <Upload size={16} />
                Audio importieren
              </button>
            </div>
            <div className="info-bar">
              Produktionspaket → API-Produktion mit automatischem Import oder
              manuelle Suno-Produktion → Varianten vergleichen
            </div>
            {orders.length ? (
              <div className="stack">
                {orders.map((order: Row) => (
                  <div className="panel" key={order.id}>
                    <div className="panel-heading">
                      <div>
                        <small>{order.production_number}</small>
                        <h3>{order.package.title}</h3>
                      </div>
                      <Badge status={order.state} />
                    </div>
                    <div className="package-grid">
                      {[
                        ["Titel", order.package.title],
                        ["Lyrics", order.package.lyrics],
                        ["Musikstil", order.package.style_prompt],
                        [
                          "Aussprache & Notizen",
                          order.package.pronunciation +
                            "\n" +
                            order.package.notes,
                        ],
                      ].map(([label, value]) => (
                        <div className="package-field" key={label}>
                          <div>
                            <strong>{label}</strong>
                            <CopyButton value={value} />
                          </div>
                          <pre>{value || "Keine Angaben"}</pre>
                        </div>
                      ))}
                    </div>
                    <SunoOrderActions order={order} />
                    <p className="muted">{order.package.note}</p>
                    <div className="actions">
                      <a
                        className="button primary"
                        href={"/api/exports/suno/" + order.id}
                      >
                        <Download size={16} />
                        Produktionspaket ZIP
                      </a>
                      <a
                        className="button"
                        href="https://suno.com/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Suno öffnen ↗
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="Produktionspaket vorbereiten"
                body="Speichere eine Lyrics-Version und erstelle daraus dein eindeutig zugeordnetes Suno-Paket."
                action="Zum Lyrics-Studio"
                onClick={() => nav("lyrics")}
              />
            )}
            <div className="sub-heading">
              <h2>Aufnahmen vergleichen</h2>
              <span className="muted">
                A/B-Vergleich · Originaldateien bleiben unverändert
              </span>
            </div>
            {variants.length ? (
              <div className="grid-two">
                {variants.map((v: Row) => {
                  const asset = data.assets.find(
                    (a: Row) => a.id === v.asset_id,
                  );
                  return (
                    <div className="panel" key={v.id}>
                      <div className="panel-heading">
                        <h3>{v.label}</h3>
                        {v.is_master && <Badge label="Freigegebener Master" />}
                      </div>
                      <Preview asset={asset} />
                      <Waveform values={asset?.metadata.waveform} />
                      <div className="audio-facts">
                        <span>
                          {Number(asset?.metadata.duration).toFixed(1)} s
                        </span>
                        <span>
                          {asset?.metadata.streams?.find(
                            (s: Row) => s.type === "audio",
                          )?.sample_rate ?? "—"}{" "}
                          Hz
                        </span>
                        <span>{asset?.metadata.lufs ?? "—"} LUFS</span>
                        <span>{asset?.metadata.true_peak_db ?? "—"} dBTP</span>
                      </div>
                      {asset?.metadata.warnings?.map((w: string) => (
                        <p className="warning" key={w}>
                          {w}
                        </p>
                      ))}
                      <p>
                        {v.notes ||
                          "Noch keine Hörnotizen. Text-KI hat diese Aufnahme nicht gehört."}
                      </p>
                      <button onClick={() => setVariant(v)}>
                        Ausschnitt, Timing & Freigabe
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty
                title="Deine Aufnahme fehlt noch"
                body="Importiere eine MP3-, WAV-, FLAC- oder OGG-Datei und ordne sie dem Produktionspaket zu."
                action="Audio importieren"
                onClick={() => nav("library")}
              />
            )}
          </>
        ) : (
          <Empty
            title="Zuerst einen Song entwickeln"
            body="Der Produktionsauftrag verknüpft Künstler, Song und Lyrics-Version."
            action="Zum Lyrics-Studio"
            onClick={() => nav("lyrics")}
          />
        )}
      </ArtistRequired>
      {variant && (
        <VariantEditor variant={variant} onClose={() => setVariant(null)} />
      )}
    </>
  );
}
export function Waveform({ values }: { values?: number[] }) {
  return (
    <div
      className="waveform"
      aria-label={
        values ? "Gemessene Audiowellenform" : "Audioanalyse noch ausstehend"
      }
    >
      {values?.length ? (
        <svg viewBox="0 0 960 90" preserveAspectRatio="none">
          {values.map((v, i) => (
            <rect
              key={i}
              x={(i * 960) / values.length}
              y={45 - v * 42}
              width={Math.max(1, 960 / values.length - 1)}
              height={Math.max(2, v * 84)}
              rx="1"
            />
          ))}
        </svg>
      ) : (
        <span>Wellenform wird im Hintergrund berechnet …</span>
      )}
    </div>
  );
}
function VariantEditor({
  variant,
  onClose,
}: {
  variant: Row;
  onClose: () => void;
}) {
  const { data, act } = useStudio();
  const [timings, setTimings] = useState<Row[]>(variant.timings ?? []),
    [markers, setMarkers] = useState<Row[]>(variant.markers ?? []);
  const asset = data.assets.find((a: Row) => a.id === variant.asset_id);
  return (
    <Modal
      title="Aufnahme prüfen & Ausschnitt festlegen"
      onClose={onClose}
      wide
    >
      <Preview asset={asset} />
      <Form
        onSubmit={async (v) => {
          if (
            await act("save_variant", {
              id: variant.id,
              version: variant.version,
              label: v.label,
              notes: v.notes,
              clip_start: Number(v.clip_start),
              clip_end: Number(v.clip_end),
              is_master: v.is_master === "on",
              markers,
              timings,
            })
          )
            onClose();
        }}
      >
        <Input
          label="Variantenname"
          name="label"
          defaultValue={variant.label}
        />
        <div className="form-grid">
          <Input
            label="Clip-Start (Sekunden)"
            name="clip_start"
            type="number"
            step="0.01"
            min="0"
            defaultValue={variant.clip_start}
          />
          <Input
            label="Clip-Ende (Sekunden)"
            name="clip_end"
            type="number"
            step="0.01"
            max={asset?.metadata.duration}
            defaultValue={variant.clip_end}
          />
        </div>
        <Textarea
          label="Hörnotizen & Vergleich"
          name="notes"
          defaultValue={variant.notes}
        />
        <label className="check">
          <input
            name="is_master"
            type="checkbox"
            defaultChecked={variant.is_master}
          />
          Als freigegebenen Master dieses Songs auswählen
        </label>
        <h3>Manuelles Lyrics-Timing</h3>
        <p className="muted">
          Zeitpunkte beziehen sich auf diese Aufnahme. Keine automatische oder
          wortgenaue Ausrichtung wird behauptet.
        </p>
        {timings.map((t, i) => (
          <div className="timing-row" key={i}>
            <input
              aria-label={"Zeile " + (i + 1) + " Start"}
              type="number"
              step=".1"
              value={t.start}
              onChange={(e) =>
                setTimings(
                  timings.map((x, j) =>
                    j === i ? { ...x, start: Number(e.target.value) } : x,
                  ),
                )
              }
            />
            <input
              aria-label={"Zeile " + (i + 1) + " Ende"}
              type="number"
              step=".1"
              value={t.end}
              onChange={(e) =>
                setTimings(
                  timings.map((x, j) =>
                    j === i ? { ...x, end: Number(e.target.value) } : x,
                  ),
                )
              }
            />
            <input
              aria-label={"Zeile " + (i + 1) + " Text"}
              value={t.text}
              onChange={(e) =>
                setTimings(
                  timings.map((x, j) =>
                    j === i ? { ...x, text: e.target.value } : x,
                  ),
                )
              }
            />
            <button
              type="button"
              onClick={() => setTimings(timings.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setTimings([...timings, { start: 0, end: 3, text: "" }])
          }
        >
          <Plus size={15} />
          Timingzeile
        </button>
        <h3>Markierungen</h3>
        {markers.map((m, i) => (
          <div className="timing-row" key={i}>
            <input
              aria-label="Markierung Sekunde"
              type="number"
              step=".1"
              value={m.time}
              onChange={(e) =>
                setMarkers(
                  markers.map((x, j) =>
                    i === j ? { ...x, time: Number(e.target.value) } : x,
                  ),
                )
              }
            />
            <input
              aria-label="Markierungsnotiz"
              value={m.note}
              onChange={(e) =>
                setMarkers(
                  markers.map((x, j) =>
                    i === j ? { ...x, note: e.target.value } : x,
                  ),
                )
              }
            />
            <button
              type="button"
              onClick={() => setMarkers(markers.filter((_, j) => i !== j))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setMarkers([...markers, { time: 0, note: "" }])}
        >
          Markierung hinzufügen
        </button>
        <Submit>Aufnahme speichern</Submit>
      </Form>
    </Modal>
  );
}
