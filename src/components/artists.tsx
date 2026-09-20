"use client";
import { useState } from "react";
import {
  Plus,
  Sparkles,
  ArrowUpRight,
  PenLine,
  Download,
  Merge,
  Archive,
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
  type Row,
  Preview,
} from "./ui";
import { CreateAutomaticArtist, AutomationSettings } from "./automation";
const identityLabels: Record<string, string> = {
  aliases: "Alternative Namen",
  handles: "Handle-Vorschläge (Verfügbarkeit ungeprüft)",
  personality: "Persönlichkeit, Humor & Kommunikation",
  fiction: "Fiktionale Hintergrundgeschichte",
  confirmedFacts: "Tatsächlich bestätigte Informationen",
  internalInstructions: "Interne Produktionsanweisungen",
  themes: "Thematische Schwerpunkte",
  taboos: "Tabuthemen",
  visual: "Visuelle Identität & Bildstil",
  outfits: "Wiederkehrende Outfits",
  colors: "Farbwelt",
  features: "Charakteristische Merkmale",
  lighting: "Licht & Atmosphäre",
  variations: "Erlaubte Variationen",
  negativeVisual: "Visuelle Ausschlüsse",
  voice: "Stimmcharakter & Referenzen",
  pronunciation: "Aussprachehinweise",
  instrumentation: "Instrumentierung",
  rhythm: "Rhythmische Merkmale",
  structures: "Typische Songstrukturen",
  signature: "Wiederkehrende Klangmerkmale",
  exclusions: "Musikalische Ausschlüsse",
  goals: "Veröffentlichungsziele",
};
export function Artists() {
  const { data, act, setArtistId, nav } = useStudio();
  const [edit, setEdit] = useState<Row | null>(null),
    [concepts, setConcepts] = useState(false),
    [automatic, setAutomatic] = useState(false),
    [automationSettings, setAutomationSettings] = useState<Row | null>(null),
    [history, setHistory] = useState<Row | null>(null);
  const conceptJobs = data.jobs.filter(
    (j: Row) => j.kind === "artist_concepts" && j.state === "succeeded",
  );
  return (
    <>
      <SectionHead
        eyebrow="IDENTITÄT & CHARAKTER"
        title="Deine Künstler."
        description="Eine eigene Geschichte. Eine erkennbare Stimme. Ein unverwechselbarer Stil."
      >
        <button onClick={() => setConcepts(true)}>
          <Sparkles size={16} />
          Konzepte entwickeln
        </button>
        <button onClick={() => setEdit({})}>
          <Plus size={16} />
          Künstler anlegen
        </button>
        <button className="primary" onClick={() => setAutomatic(true)}>
          <Sparkles size={16} />
          Artist erstellen
        </button>
      </SectionHead>
      {data.artists.length ? (
        <div className="artist-grid">
          {data.artists.map((a: Row) => {
            const portrait = data.artist_references.find(
              (r: Row) =>
                r.artist_id === a.id &&
                r.type === "portrait" &&
                r.state === "approved",
            );
            const asset = data.assets.find(
              (x: Row) => x.id === portrait?.asset_id,
            );
            return (
              <article className="artist-card" key={a.id}>
                <div
                  className="artist-cover"
                  style={{
                    background: `radial-gradient(ellipse at 60% 10%,${a.color}70,transparent 70%),#202128`,
                  }}
                >
                  {asset ? (
                    <img src={"/api/assets/" + asset.id} alt={a.name} />
                  ) : (
                    <div className="artist-initial">{a.name.slice(0, 1)}</div>
                  )}
                  <div className="cover-badge">
                    <Badge
                      label={a.archived ? "Archiviert" : "Virtueller Künstler"}
                    />
                  </div>
                  <span className="artist-number">
                    IDENTITY / {String(a.version).padStart(2, "0")}
                  </span>
                </div>
                <div className="artist-card-body">
                  <small>
                    {a.genre || "Musikalische Identität offen"} · {a.language}
                  </small>
                  <h2>{a.name}</h2>
                  <p>
                    {a.bio || "Ergänze eine öffentliche Künstlerbeschreibung."}
                  </p>
                  <div className="card-meta">
                    <span>
                      {
                        data.songs.filter((s: Row) => s.artist_id === a.id)
                          .length
                      }{" "}
                      Songs
                    </span>
                    <span>{a.market}</span>
                  </div>
                  <div className="actions">
                    <button
                      className="primary"
                      onClick={() => {
                        setArtistId(a.id);
                        nav(
                          data.artist_automations.some(
                            (p: Row) => p.artist_id === a.id,
                          )
                            ? "tasks"
                            : "ideas",
                        );
                      }}
                    >
                      Studio öffnen
                      <ArrowUpRight size={15} />
                    </button>
                    <button
                      className="icon"
                      aria-label={a.name + " bearbeiten"}
                      onClick={() => setEdit(a)}
                    >
                      <PenLine size={16} />
                    </button>
                    <button onClick={() => setHistory(a)}>Versionen</button>
                    <button onClick={() => setAutomationSettings(a)}>
                      Tägliche Automatik
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title="Dein erster Künstler beginnt hier"
          body="Die KI entwickelt Charakter, Bio und Porträt und produziert anschließend täglich Songs und Videos. Deine Wünsche sind optional. Namen und Handles bleiben ungeprüfte Vorschläge."
          action="Artist erstellen"
          onClick={() => setAutomatic(true)}
        />
      )}
      {automatic && (
        <CreateAutomaticArtist onClose={() => setAutomatic(false)} />
      )}
      {automationSettings && (
        <AutomationSettings
          artist={automationSettings}
          onClose={() => setAutomationSettings(null)}
        />
      )}
      {edit && (
        <Modal
          title={
            edit.id ? "Character Bible bearbeiten" : "Einen Künstler entwickeln"
          }
          description="Öffentliche Beschreibung, Fiktion und interne Anweisungen werden getrennt gespeichert. Jede Änderung erzeugt eine neue Identitätsversion."
          onClose={() => setEdit(null)}
          wide
        >
          <Form
            onSubmit={async (values) => {
              const identity = Object.fromEntries(
                Object.keys(identityLabels).map((k) => [
                  k,
                  values["identity_" + k] ?? "",
                ]),
              );
              const r = await act(edit.id ? "update_artist" : "create_artist", {
                ...edit,
                name: values.name,
                bio: values.bio,
                language: values.language,
                market: values.market,
                genre: values.genre,
                color: values.color,
                identity,
              });
              if (r) {
                setArtistId(r.id);
                setEdit(null);
              }
            }}
          >
            <div className="form-grid">
              <Input
                label="Künstlername"
                name="name"
                defaultValue={edit.name ?? ""}
                required
              />
              <Input
                label="Musikrichtung"
                name="genre"
                defaultValue={edit.genre ?? ""}
              />
              <Input
                label="Sprache"
                name="language"
                defaultValue={edit.language ?? "Deutsch"}
              />
              <Input
                label="Zielmarkt"
                name="market"
                defaultValue={edit.market ?? "DACH"}
              />
            </div>
            <Textarea
              label="Öffentliche Künstlerbeschreibung"
              name="bio"
              defaultValue={edit.bio ?? ""}
              placeholder="Transparent als virtueller oder KI-gestützter Musikcharakter beschreiben."
            />
            <Input
              label="Akzentfarbe"
              name="color"
              type="color"
              defaultValue={edit.color ?? "#ff875d"}
            />
            <details className="form-details" open>
              <summary>Persönlichkeit & Character Bible</summary>
              <div className="form-grid">
                {Object.entries(identityLabels).map(([key, label]) => (
                  <Textarea
                    key={key}
                    label={label}
                    name={"identity_" + key}
                    rows={3}
                    defaultValue={edit.identity?.[key] ?? ""}
                  />
                ))}
              </div>
            </details>
            <div className="form-actions">
              <Submit>Identität speichern</Submit>
              {edit.id && (
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      await act("archive_artist", {
                        id: edit.id,
                        archived: !edit.archived,
                      })
                    )
                      setEdit(null);
                  }}
                >
                  <Archive size={16} />
                  {edit.archived ? "Wieder aktivieren" : "Archivieren"}
                </button>
              )}
            </div>
          </Form>
        </Modal>
      )}
      {history && (
        <Modal
          title={"Identitätsversionen · " + history.name}
          onClose={() => setHistory(null)}
          wide
        >
          <p className="muted">
            Laufende Songs behalten die Identitätsversion ihres
            Produktionsstarts.
          </p>
          {data.identity_versions
            .filter((v: Row) => v.artist_id === history.id)
            .map((v: Row) => (
              <details className="version-row" key={v.id}>
                <summary>
                  Version {v.version} ·{" "}
                  {new Date(v.created_at).toLocaleString("de-DE")}
                </summary>
                <h3>{v.snapshot.name}</h3>
                <p>{v.snapshot.bio}</p>
                <dl>
                  {Object.entries(v.snapshot.identity ?? {})
                    .filter(([, val]) => val)
                    .map(([k, val]) => (
                      <div key={k}>
                        <dt>{identityLabels[k]}</dt>
                        <dd>{String(val)}</dd>
                      </div>
                    ))}
                </dl>
              </details>
            ))}
          <a className="button" href={"/api/exports/artist/" + history.id}>
            <Download size={16} />
            Künstlerdaten exportieren
          </a>
        </Modal>
      )}
      {concepts && (
        <Modal
          title="Neue Künstlerkonzepte"
          onClose={() => setConcepts(false)}
          wide
        >
          <Form
            onSubmit={async (v) => {
              await act("queue_ai", {
                kind: "artist_concepts",
                input: { prompt: v.prompt },
              });
            }}
          >
            <Textarea
              name="prompt"
              label="Deine kreative Richtung"
              required
              placeholder="Zum Beispiel: deutschsprachiger Indie-Pop, trockener Humor und Großstadtnächte …"
            />
            <Submit>Konzepte entwickeln</Submit>
          </Form>
          <div className="stack">
            {conceptJobs
              .slice(0, 2)
              .flatMap((j: Row) => j.output.concepts ?? [])
              .map((c: Row, i: number) => (
                <article className="panel" key={i}>
                  <h3>{c.name}</h3>
                  <p>{c.positioning}</p>
                  <p>{c.bio}</p>
                  <dl>
                    <dt>Sound</dt>
                    <dd>{c.musical_profile}</dd>
                    <dt>Bildsprache</dt>
                    <dd>{c.image_description}</dd>
                    <dt>Startplan</dt>
                    <dd>{c.start_plan.join(" · ")}</dd>
                  </dl>
                  <button
                    onClick={() => {
                      setConcepts(false);
                      setEdit({
                        name: c.name,
                        bio: c.bio,
                        genre: c.musical_profile,
                        identity: {
                          visual: c.image_description,
                          themes: c.song_topics.join("\n"),
                          goals: c.start_plan.join("\n"),
                        },
                      });
                    }}
                  >
                    Konzept bearbeiten und übernehmen
                  </button>
                </article>
              ))}
          </div>
        </Modal>
      )}
    </>
  );
}
export function Ideas() {
  const { data, artist, artistId, act, nav } = useStudio();
  const [edit, setEdit] = useState<Row | null>(null),
    [ai, setAi] = useState(false),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<string[]>([]);
  const ideas = data.ideas.filter(
    (i: Row) =>
      i.artist_id === artistId && (filter === "all" || i.status === filter),
  );
  return (
    <>
      <SectionHead
        eyebrow="DER ANFANG VON ETWAS GUTEM"
        title="Ideen mit Charakter."
        description="Sammle Themen, finde eine Hook und entwickle daraus deinen nächsten Song."
      >
        <button onClick={() => setEdit({})}>
          <Plus size={16} />
          Eigene Idee
        </button>
        <button className="primary" onClick={() => setAi(true)}>
          <Sparkles size={16} />
          Songideen entwickeln
        </button>
      </SectionHead>
      <ArtistRequired>
        <div className="toolbar">
          <div className="tabs">
            {[
              ["all", "Alle Ideen"],
              ["proposed", "Vorschläge"],
              ["accepted", "Angenommen"],
              ["rejected", "Abgelehnt"],
              ["archived", "Archiv"],
            ].map(([k, l]) => (
              <button
                className={filter === k ? "selected" : ""}
                onClick={() => setFilter(k)}
                key={k}
              >
                {l}
              </button>
            ))}
          </div>
          {selected.length >= 2 && (
            <button
              onClick={async () => {
                if (
                  await act("combine_ideas", {
                    ids: selected,
                    title:
                      "Kombination: " +
                      data.ideas.find((i: Row) => i.id === selected[0])?.title,
                  })
                )
                  setSelected([]);
              }}
            >
              <Merge size={16} />
              Ideen kombinieren
            </button>
          )}
        </div>
        {ideas.length ? (
          <div className="idea-grid">
            {ideas.map((idea: Row) => (
              <article className="panel idea-card" key={idea.id}>
                <div className="card-top">
                  <Badge status={idea.status} />
                  <input
                    aria-label={idea.title + " zum Kombinieren auswählen"}
                    type="checkbox"
                    checked={selected.includes(idea.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, idea.id]
                          : selected.filter((x) => x !== idea.id),
                      )
                    }
                  />
                </div>
                <h2>{idea.title}</h2>
                <p>{idea.premise}</p>
                {idea.hook && <blockquote>„{idea.hook}“</blockquote>}
                <small>{idea.direction}</small>
                <details>
                  <summary>Warum diese Idee?</summary>
                  <p>{idea.rationale}</p>
                  <p>
                    <b>Konflikt:</b> {idea.conflict}
                  </p>
                  <p>
                    <b>Videoidee:</b> {idea.video_idea}
                  </p>
                  <p>
                    Ähnlichkeit im eigenen Katalog:{" "}
                    {Math.round(Number(idea.similarity ?? 0) * 100)} %
                    Textüberschneidung, keine Erfolgsprognose.
                  </p>
                  {idea.sources.length ? (
                    idea.sources.map((s: Row, i: number) => (
                      <p key={i}>
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.title}
                        </a>{" "}
                        · {s.retrieved_at}
                      </p>
                    ))
                  ) : (
                    <p>
                      Allgemeine Kreatividee. Keine aktuelle Trendrecherche
                      verwendet.
                    </p>
                  )}
                </details>
                <div className="actions">
                  <button
                    className="primary"
                    onClick={async () => {
                      const song = await act("create_song", {
                        artist_id: artistId,
                        idea_id: idea.id,
                        title: idea.title,
                      });
                      if (song) nav("lyrics");
                    }}
                  >
                    Zum Song entwickeln
                    <ArrowUpRight size={15} />
                  </button>
                  <button onClick={() => setEdit(idea)}>Bearbeiten</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="Platz für den nächsten Gedanken"
            body="Beginne mit einem Thema, einer Stimmung oder einer Geschichte. Die KI berücksichtigt die Künstleridentität und vorhandene Erkenntnisse."
            action="Ideen entwickeln"
            onClick={() => setAi(true)}
          />
        )}
      </ArtistRequired>
      {edit && (
        <Modal
          title={edit.id ? "Idee bearbeiten" : "Eigene Songidee"}
          onClose={() => setEdit(null)}
        >
          <Form
            onSubmit={async (v) => {
              const result = await act(
                edit.id ? "update_idea" : "create_idea",
                {
                  ...edit,
                  artist_id: artistId,
                  title: v.title,
                  premise: v.premise,
                  hook: v.hook,
                  direction: v.direction,
                  status: v.status ?? "proposed",
                  feedback: v.feedback ?? "",
                  conflict: v.conflict ?? "",
                  video_idea: v.video_idea ?? "",
                  rationale: v.rationale ?? "",
                  sources: edit.sources ?? [],
                },
              );
              if (result) setEdit(null);
            }}
          >
            <Input
              label="Arbeitstitel"
              name="title"
              defaultValue={edit.title}
              required
            />
            <Textarea
              label="Kernidee"
              name="premise"
              defaultValue={edit.premise}
            />
            <Textarea label="Hook" name="hook" defaultValue={edit.hook} />
            <Input
              label="Musikalische Richtung"
              name="direction"
              defaultValue={edit.direction ?? artist?.genre}
            />
            {edit.id ? (
              <>
                <Select label="Status" name="status" defaultValue={edit.status}>
                  {["proposed", "accepted", "rejected", "archived"].map((x) => (
                    <option key={x} value={x}>
                      {
                        {
                          proposed: "Vorschlag",
                          accepted: "Angenommen",
                          rejected: "Abgelehnt",
                          archived: "Archiviert",
                        }[x]
                      }
                    </option>
                  ))}
                </Select>
                <Textarea
                  label="Dein Feedback für künftige Ideen"
                  name="feedback"
                  defaultValue={edit.feedback}
                />
              </>
            ) : (
              <>
                <Textarea label="Emotionaler Konflikt" name="conflict" />
                <Textarea label="Videoidee" name="video_idea" />
                <Textarea label="Passung zum Künstler" name="rationale" />
              </>
            )}
            <Submit />
          </Form>
        </Modal>
      )}
      {ai && (
        <Modal
          title="Songideen entwickeln"
          description="Ein begrenzter KI-Auftrag mit Künstlerprofil, bisherigem Katalog und gespeicherten Erkenntnissen. Keine aktuelle Plattformrecherche ohne Quellen."
          onClose={() => setAi(false)}
        >
          <Form
            onSubmit={async (v) => {
              if (
                await act("queue_ai", {
                  artist_id: artistId,
                  kind: "create_song_ideas",
                  input: { prompt: v.prompt, count: Number(v.count) },
                })
              )
                setAi(false);
            }}
          >
            <Textarea
              name="prompt"
              label="Thema, Stimmung, Anlass oder Community-Impuls"
              placeholder="Was soll der Song ausdrücken?"
            />
            <Input
              name="count"
              label="Anzahl unterschiedlicher Ideen"
              type="number"
              min="1"
              max="10"
              defaultValue="5"
            />
            <Submit>Entwicklung starten</Submit>
          </Form>
        </Modal>
      )}
    </>
  );
}
