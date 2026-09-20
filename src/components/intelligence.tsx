"use client";
import { useState } from "react";
import {
  Plus,
  Sparkles,
  MessageSquare,
  ArrowUpRight,
  Send,
  FlaskConical,
  ChartNoAxesCombined,
  Trash2,
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
  type Row,
  formatDate,
} from "./ui";
export function Community() {
  const { data, artistId, act } = useStudio();
  const [importing, setImporting] = useState(false),
    [reply, setReply] = useState<Row | null>(null),
    [filter, setFilter] = useState("new");
  const comments = data.comments.filter(
    (c: Row) =>
      c.artist_id === artistId && (filter === "all" || c.status === filter),
  );
  return (
    <>
      <SectionHead
        eyebrow="ZUHÖREN. VERSTEHEN. WEITERDENKEN."
        title="Deine Community."
        description="Fragen, ehrliches Feedback und der Impuls für deinen nächsten Song."
      >
        <button className="primary" onClick={() => setImporting(true)}>
          <Plus size={16} />
          Kommentare importieren
        </button>
      </SectionHead>
      <ArtistRequired>
        <div className="info-bar">
          <MessageSquare size={18} />
          Kommentar-API nicht eingerichtet. Einzelne Kommentare, CSV und JSON
          lassen sich hier in dieselbe Inbox importieren.
        </div>
        <div className="tabs">
          {[
            ["new", "Neue Kommentare"],
            ["reviewed", "Geprüft"],
            ["archived", "Archiv"],
            ["all", "Alle"],
          ].map(([k, l]) => (
            <button
              key={k}
              className={filter === k ? "selected" : ""}
              onClick={() => setFilter(k)}
            >
              {l}
            </button>
          ))}
        </div>
        {comments.length ? (
          <div className="stack">
            {comments.map((c: Row) => {
              const drafts = data.reply_drafts.filter(
                (r: Row) => r.comment_id === c.id,
              );
              return (
                <article className="panel comment-card" key={c.id}>
                  <div className="comment-avatar">
                    {c.author.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="comment-main">
                    <div className="card-top">
                      <strong>{c.author}</strong>
                      <small>
                        {formatDate(c.imported_at)} · {c.source}
                      </small>
                    </div>
                    <p>{c.body}</p>
                    {c.category && (
                      <Badge
                        label={
                          {
                            question: "Frage",
                            wish: "Songwunsch",
                            criticism: "Kritik",
                            spam_suspected: "Spamverdacht · prüfen",
                            other: "Sonstiges",
                          }[c.category as string] ?? c.category
                        }
                      />
                    )}
                    <div className="actions">
                      <button
                        onClick={() =>
                          act("queue_ai", {
                            artist_id: artistId,
                            kind: "draft_reply",
                            input: { comment_id: c.id },
                          })
                        }
                      >
                        <Sparkles size={15} />
                        Antwort entwerfen
                      </button>
                      <button
                        onClick={() =>
                          act("update_comment", {
                            id: c.id,
                            status: "reviewed",
                          })
                        }
                      >
                        Als geprüft markieren
                      </button>
                      <button
                        onClick={() =>
                          act("update_comment", {
                            id: c.id,
                            status: "archived",
                          })
                        }
                      >
                        Archivieren
                      </button>
                      <button
                        aria-label="Kommentar löschen"
                        onClick={() => setReply({ delete: c })}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {drafts.map((r: Row) => (
                      <div className="reply-draft" key={r.id}>
                        <div className="card-top">
                          <strong>Antwortentwurf</strong>
                          <Badge status={r.state} />
                        </div>
                        <p>{r.body}</p>
                        <button onClick={() => setReply(r)}>
                          Prüfen & bearbeiten
                        </button>
                        {r.state === "approved" && (
                          <CopyButton value={r.body} />
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title="Was bewegt dein Publikum?"
            body="Importiere echte Kommentare. Die KI kann Fragen und Themen erkennen und Antworten entwerfen. Kritik wird nicht automatisch als Spam behandelt."
            action="Kommentar hinzufügen"
            onClick={() => setImporting(true)}
          />
        )}
      </ArtistRequired>
      {importing && (
        <Modal
          title="Kommentare übernehmen"
          description="Eigenes Importschema: body, author und optional external_id. Keine automatischen öffentlichen Antworten."
          onClose={() => setImporting(false)}
        >
          <Form
            onSubmit={async (v) => {
              const r = await act("import_comments", {
                artist_id: artistId,
                account_id: v.account_id || null,
                format: v.format,
                content: v.content,
                entries:
                  v.format === "manual"
                    ? [{ body: v.content, author: v.author || "Anonym" }]
                    : undefined,
              });
              if (r) setImporting(false);
            }}
          >
            <Select name="account_id" label="Konto">
              <option value="">Nur Künstler zuordnen</option>
              {data.social_accounts
                .filter((a: Row) => a.artist_id === artistId)
                .map((a: Row) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
            </Select>
            <Select label="Format" name="format">
              <option value="manual">Einzelner Kommentar</option>
              <option value="csv">CSV: body,author,external_id</option>
              <option value="json">
                JSON: Array mit body, author, external_id
              </option>
            </Select>
            <Input name="author" label="Anzeigename (Einzelkommentar)" />
            <Textarea
              label="Kommentar oder Importinhalt"
              name="content"
              required
              rows={8}
            />
            <Submit>In Inbox übernehmen</Submit>
          </Form>
        </Modal>
      )}
      {reply && (
        <Modal
          title={reply.delete ? "Kommentar löschen" : "Antwort prüfen"}
          onClose={() => setReply(null)}
        >
          {reply.delete ? (
            <>
              <p>
                Der Kommentar und seine Antwortentwürfe werden aus diesem Studio
                gelöscht. Das hat keine Wirkung auf TikTok.
              </p>
              <button
                className="danger"
                onClick={async () => {
                  if (await act("delete_comment", { id: reply.delete.id }))
                    setReply(null);
                }}
              >
                Kommentar endgültig lokal löschen
              </button>
            </>
          ) : (
            <Form
              onSubmit={async (v) => {
                if (
                  await act("save_reply", {
                    id: reply.id,
                    body: v.body,
                    state: v.state,
                  })
                )
                  setReply(null);
              }}
            >
              <Textarea
                name="body"
                label="Antworttext"
                defaultValue={reply.body}
              />
              <Select label="Status" name="state" defaultValue={reply.state}>
                <option value="draft">Entwurf</option>
                <option value="approved">
                  Geprüft und zum Kopieren freigegeben
                </option>
                <option value="manually_replied">
                  Manuell extern beantwortet
                </option>
              </Select>
              <p className="muted">
                Es wird keine Antwort automatisch an TikTok gesendet.
              </p>
              <Submit />
            </Form>
          )}
        </Modal>
      )}
    </>
  );
}
export function Analytics() {
  const { data, artistId, act } = useStudio();
  const [metrics, setMetrics] = useState(false),
    [experiment, setExperiment] = useState<Row | null>(null),
    [editExperiment, setEditExperiment] = useState<Row | null>(null);
  const rows = data.analytics.rows.filter((r: Row) => r.artist_id === artistId),
    insights = data.insights.filter((i: Row) => i.artist_id === artistId);
  const hasValues = rows.some((r: Row) => r.views !== null);
  const valid = rows.filter((r: Row) => r.rate !== null);
  const totalViews = valid.reduce((n: number, r: Row) => n + r.views, 0);
  const rate = totalViews
    ? valid.reduce(
        (n: number, r: Row) => n + r.likes + r.comments + r.shares,
        0,
      ) / totalViews
    : null;
  return (
    <>
      <SectionHead
        eyebrow="AUS ECHTEN DATEN LERNEN"
        title="Was bleibt hängen?"
        description="Vergleiche Beobachtungen und entwickle Hypothesen für deine nächste Produktion."
      >
        <button onClick={() => setMetrics(true)}>
          <Plus size={16} />
          Kennzahlen erfassen
        </button>
        <button
          className="primary"
          disabled={!hasValues}
          title={!hasValues ? "Zuerst echte Messwerte erfassen" : undefined}
          onClick={() =>
            act("queue_ai", {
              artist_id: artistId,
              kind: "analyze_metrics",
              input: {},
            })
          }
        >
          <Sparkles size={16} />
          Daten analysieren
        </button>
      </SectionHead>
      <ArtistRequired>
        <div className="stats-grid three">
          <div className="stat-card">
            <span>Beiträge mit vergleichbaren Messwerten</span>
            <strong>{valid.length}</strong>
            <small>Gleicher Messzeitpunkt pro Verhältnis</small>
          </div>
          <div className="stat-card">
            <span>Gewichtete Interaktionsrate</span>
            <strong>
              {rate === null ? "—" : (rate * 100).toFixed(2) + " %"}
            </strong>
            <small>Likes + Kommentare + Shares / Views</small>
          </div>
          <div className="stat-card">
            <span>Datenqualität</span>
            <strong className="stat-text">
              {valid.length < 10 ? "Kleine Stichprobe" : "Beobachtungsdaten"}
            </strong>
            <small>Keine Kausalitäts- oder Erfolgsaussage</small>
          </div>
        </div>
        {data.analytics.corrections.length > 0 && (
          <div className="warning">
            Sinkende Zähler erkannt. Mögliche Datenkorrektur; Zeitreihen vor
            Schlussfolgerungen prüfen.
          </div>
        )}
        {rows.length ? (
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Beitrag</th>
                  <th>Alter bei Messung</th>
                  <th>Views</th>
                  <th>Likes</th>
                  <th>Kommentare</th>
                  <th>Shares</th>
                  <th>Interaktion</th>
                  <th>Watchtime</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: Row) => (
                  <tr key={r.id}>
                    <td>{r.title}</td>
                    <td>{r.age_days == null ? "—" : r.age_days + " Tage"}</td>
                    <td>{r.views ?? "—"}</td>
                    <td>{r.likes ?? "—"}</td>
                    <td>{r.comments ?? "—"}</td>
                    <td>{r.shares ?? "—"}</td>
                    <td>
                      {r.rate == null ? "—" : (r.rate * 100).toFixed(2) + " %"}
                    </td>
                    <td>
                      {r.watchtime == null
                        ? "Nicht verfügbar"
                        : r.watchtime + " s"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">
              Je Kennzahl wird nur der jüngste kumulative Wert verwendet.
              Fehlend ist kein Nullwert. Vergleiche Beiträge ähnlichen Alters
              und gleiche Beobachtungszeiträume.
            </p>
          </div>
        ) : (
          <Empty
            title="Jede Veröffentlichung ist eine Beobachtung"
            body="Erfasse die tatsächlichen Messwerte eines Beitrags. Nicht verfügbare Kennzahlen bleiben leer."
            action="Kennzahlen erfassen"
            onClick={() => setMetrics(true)}
          />
        )}
        <div className="sub-heading">
          <h2>Erkenntnisse & nächste Tests</h2>
        </div>
        <div className="grid-two">
          {insights.map((i: Row) => (
            <div className="panel" key={i.id}>
              <Badge label="Hypothese" />
              <h3>{i.claim}</h3>
              <p>{i.rationale}</p>
              <div className="insight-caution">{i.uncertainty}</div>
              <h4>Nächster Test</h4>
              <p>{i.proposed_test}</p>
              <small>
                Datenbezug:{" "}
                {i.data_refs
                  .map(
                    (id: string) =>
                      rows.find((r: Row) => r.id === id)?.title ?? id,
                  )
                  .join(", ") || "Keine Referenz angegeben"}
              </small>
              <div className="actions">
                <button
                  onClick={() =>
                    act("rate_insight", { id: i.id, rating: "useful" })
                  }
                >
                  Hilfreich
                </button>
                <button
                  onClick={() =>
                    act("rate_insight", { id: i.id, rating: "uncertain" })
                  }
                >
                  Unsicher
                </button>
                <button
                  onClick={() =>
                    act("rate_insight", { id: i.id, rating: "rejected" })
                  }
                >
                  Verwerfen
                </button>
                <button onClick={() => setExperiment(i)}>
                  <FlaskConical size={15} />
                  Test planen
                </button>
              </div>
              <Badge label={i.rating ?? "Noch nicht bewertet"} />
            </div>
          ))}
        </div>
        {data.experiments
          .filter((e: Row) => e.artist_id === artistId)
          .map((e: Row) => (
            <div className="panel" key={e.id}>
              <h3>{e.name}</h3>
              <p>{e.hypothesis}</p>
              <p>{e.plan}</p>
              <Badge status={e.status} />
              <p>{e.result}</p>
              <button onClick={() => setEditExperiment(e)}>
                Ergebnis dokumentieren
              </button>
            </div>
          ))}
      </ArtistRequired>
      {metrics && (
        <Modal
          title="Echte Kennzahlen erfassen"
          description="Lasse nicht verfügbare Werte leer. Nur Kennzahlen eingeben, die du aus einer zulässigen Quelle tatsächlich ablesen kannst."
          onClose={() => setMetrics(false)}
        >
          <Form
            onSubmit={async (v) => {
              if (
                await act("save_metrics", {
                  post_id: v.post_id,
                  source: v.source,
                  captured_at: new Date(v.captured_at).toISOString(),
                  values: Object.fromEntries(
                    ["views", "likes", "comments", "shares", "watchtime"].map(
                      (k) => [k, v[k] === "" ? null : Number(v[k])],
                    ),
                  ),
                })
              )
                setMetrics(false);
            }}
          >
            <Select label="Beitrag" name="post_id" required>
              <option value="">Beitrag auswählen</option>
              {rows.map((r: Row) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </Select>
            <Input
              label="Quelle"
              name="source"
              required
              placeholder="TikTok-App, manuell abgelesen"
            />
            <Input
              label="Erfassungszeitpunkt (Browser-Zeitzone)"
              name="captured_at"
              type="datetime-local"
              required
            />
            <div className="form-grid">
              {[
                ["views", "Aufrufe"],
                ["likes", "Likes"],
                ["comments", "Kommentare"],
                ["shares", "Shares"],
                ["watchtime", "Watchtime in Sekunden (nur mit Quelle)"],
              ].map(([key, label]) => (
                <Input
                  label={label}
                  name={key}
                  type="number"
                  min="0"
                  key={key}
                  placeholder="Nicht verfügbar"
                />
              ))}
            </div>
            <Submit>Messwerte speichern</Submit>
          </Form>
        </Modal>
      )}
      {editExperiment && (
        <Modal
          title="Experiment auswerten"
          onClose={() => setEditExperiment(null)}
        >
          <Form
            onSubmit={async (v) => {
              if (
                await act("update_experiment", { id: editExperiment.id, ...v })
              )
                setEditExperiment(null);
            }}
          >
            <Select
              label="Status"
              name="status"
              defaultValue={editExperiment.status}
            >
              <option value="planned">Geplant</option>
              <option value="running">Läuft</option>
              <option value="completed">Abgeschlossen</option>
              <option value="cancelled">Abgebrochen</option>
            </Select>
            <Textarea
              label="Beobachtung, Datenbezug und Unsicherheit"
              name="result"
              defaultValue={editExperiment.result ?? ""}
            />
            <Submit>Ergebnis speichern</Submit>
          </Form>
        </Modal>
      )}
      {experiment && (
        <Modal title="Experiment planen" onClose={() => setExperiment(null)}>
          <Form
            onSubmit={async (v) => {
              if (
                await act("create_experiment", {
                  insight_id: experiment.id,
                  ...v,
                })
              )
                setExperiment(null);
            }}
          >
            <Input label="Testname" name="name" required />
            <Textarea
              label="Vorgehen, Vergleich und Zeitraum"
              name="plan"
              defaultValue={experiment.proposed_test}
              required
            />
            <Submit>Test speichern</Submit>
          </Form>
        </Modal>
      )}
    </>
  );
}
const directorActions = [
  ["create_song_ideas", "Neue Songideen entwickeln"],
  ["revise_lyrics", "Lyrics gezielt überarbeiten"],
  ["prepare_music_generation", "Suno-Produktionspaket erstellen"],
  ["create_storyboard", "Storyboard entwickeln"],
  ["render_video", "Videoprojekt rendern"],
  ["prepare_campaign", "Content-Woche planen"],
  ["request_approval", "Freigabe anfragen"],
  ["analyze_metrics", "Kennzahlen analysieren"],
];
export function Director() {
  const { data, artistId, act, nav } = useStudio();
  const [type, setType] = useState("create_song_ideas");
  const messages = data.director_messages.filter(
    (m: Row) => m.artist_id === artistId,
  );
  const targets = [
    "revise_lyrics",
    "prepare_music_generation",
    "prepare_campaign",
  ].includes(type)
    ? data.songs
    : type === "render_video"
      ? data.video_projects
      : type === "request_approval"
        ? data.posts
        : [];
  return (
    <>
      <SectionHead
        eyebrow="DEIN KREATIVER SPARRINGSPARTNER"
        title="KI-Director."
        description="Eine klare Anweisung. Ein überprüfbarer Plan. Echte Arbeit in deinem Studio."
      />
      <ArtistRequired>
        <div className="director-layout">
          <div className="panel director-composer">
            <div className="director-orb">
              <Sparkles size={30} />
            </div>
            <h2>Woran arbeiten wir?</h2>
            <p className="muted">
              Wähle die passende Aktion und beschreibe das gewünschte Ergebnis.
              Du prüfst den Plan vor der Ausführung.
            </p>
            <Form
              onSubmit={async (v) => {
                await act("director_plan", {
                  artist_id: artistId,
                  action_type: type,
                  target_id: v.target_id || null,
                  prompt: v.prompt,
                });
              }}
            >
              <Select
                label="Aktion"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {directorActions.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
              {targets.length > 0 && (
                <Select name="target_id" label="Betroffenes Objekt" required>
                  <option value="">Auswählen</option>
                  {targets
                    .filter((t: Row) => t.artist_id === artistId)
                    .map((t: Row) => (
                      <option value={t.id} key={t.id}>
                        {t.title ?? t.name}
                      </option>
                    ))}
                </Select>
              )}
              <Textarea
                name="prompt"
                label="Deine Anweisung"
                rows={5}
                required
                placeholder="Entwickle fünf neue Songideen über den Moment, in dem man endlich loslässt. Berücksichtige unsere bisherigen Erkenntnisse."
              />
              <Submit>Plan vorbereiten</Submit>
            </Form>
            <button className="text-link" onClick={() => nav("publishing")}>
              Zeig mir offene Freigaben
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="director-history">
            <h3>Deine Aufträge</h3>
            {messages.length ? (
              messages.map((m: Row) => {
                const job = data.jobs.find((j: Row) => j.id === m.job_id);
                return (
                  <article className="panel" key={m.id}>
                    <div className="card-top">
                      <Badge
                        label={
                          directorActions.find(
                            (a) => a[0] === m.action.type,
                          )?.[1]
                        }
                      />
                      <small>{formatDate(m.created_at)}</small>
                    </div>
                    <h3>{m.body}</h3>
                    <ol>
                      <li>
                        Aktuelle Künstlerdaten und ausgewählte Objekte laden.
                      </li>
                      <li>
                        {
                          directorActions.find(
                            (a) => a[0] === m.action.type,
                          )?.[1]
                        }
                        .
                      </li>
                      <li>
                        Validiertes Ergebnis im Studio speichern und zur Prüfung
                        bereitstellen.
                      </li>
                    </ol>
                    <p>
                      <b>Ressourcen:</b> {m.action.cost}
                    </p>
                    <p className="muted">{m.action.requires}</p>
                    {job ? (
                      <>
                        <Badge status={job.state} />
                        {job.error && <p className="error">{job.error}</p>}
                        <button onClick={() => nav("settings")}>
                          Ergebnis & Auftragsdetails
                        </button>
                      </>
                    ) : (
                      <button
                        className="primary"
                        onClick={() => act("director_execute", { id: m.id })}
                      >
                        <PlayIcon />
                        Plan ausführen
                      </button>
                    )}
                  </article>
                );
              })
            ) : (
              <Empty
                title="Eine Idee genügt"
                body="Der Director kann vorhandene Objekte bearbeiten und neue Inhalte erzeugen. Öffentliche Aktionen haben eigene Freigaben."
              />
            )}
          </div>
        </div>
      </ArtistRequired>
    </>
  );
}
function PlayIcon() {
  return <Send size={15} />;
}
