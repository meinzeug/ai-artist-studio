"use client";
import { useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import {
  Plus,
  Download,
  ShieldCheck,
  CalendarDays,
  Check,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
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
  formatDate,
} from "./ui";
const localTime = (instant: string, zone: string) =>
  Temporal.Instant.from(instant)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString()
    .slice(0, 16);
export function Publishing() {
  const { data, artistId, act, nav } = useStudio();
  const [edit, setEdit] = useState<Row | null>(null),
    [confirm, setConfirm] = useState<Row | null>(null),
    [review, setReview] = useState<Row | null>(null),
    [filter, setFilter] = useState("all");
  const posts = data.posts.filter(
    (p: Row) =>
      p.artist_id === artistId && (filter === "all" || p.status === filter),
  );
  return (
    <>
      <SectionHead
        eyebrow="BEREIT FÜR DEIN PUBLIKUM"
        title="Der letzte Schliff."
        description="Prüfe deine Beiträge, gib sie frei und nimm alles für die Veröffentlichung mit."
      >
        <button className="primary" onClick={() => setEdit({})}>
          <Plus size={16} />
          Beitrag vorbereiten
        </button>
      </SectionHead>
      <ArtistRequired>
        <div className="info-bar">
          <ShieldCheck size={19} />
          <span>
            Veröffentlichungsweg:{" "}
            <strong>Export & manuell in TikTok veröffentlichen.</strong> Direct
            Post ist für dieses private interne Werkzeug nicht freigeschaltet.
          </span>
        </div>
        <div className="tabs">
          {[
            ["all", "Alle Beiträge"],
            ["draft", "Entwürfe"],
            ["waiting_for_approval", "Freigabe offen"],
            ["approved", "Freigegeben"],
            ["published", "Veröffentlicht"],
          ].map(([v, l]) => (
            <button
              className={filter === v ? "selected" : ""}
              key={v}
              onClick={() => setFilter(v)}
            >
              {l}
            </button>
          ))}
        </div>
        {posts.length ? (
          <div className="post-grid">
            {posts.map((p: Row) => {
              const asset = data.assets.find((a: Row) => a.id === p.asset_id),
                account = data.social_accounts.find(
                  (a: Row) => a.id === p.account_id,
                );
              return (
                <article className="panel post-card" key={p.id}>
                  <Preview asset={asset} compact />
                  <div className="post-body">
                    <div className="card-top">
                      <small>{account?.label}</small>
                      <Badge status={p.status} />
                    </div>
                    <h2>{p.title}</h2>
                    <p>{p.caption}</p>
                    <small className="accent">{p.hashtags}</small>
                    <div className="post-meta">
                      <CalendarDays size={14} />
                      {formatDate(p.scheduled_at, p.timezone)}
                    </div>
                    <div className="actions">
                      {p.status !== "published" && (
                        <button onClick={() => setEdit(p)}>Bearbeiten</button>
                      )}
                      {["draft", "waiting_for_approval"].includes(p.status) && (
                        <button
                          className="primary"
                          onClick={() => setReview(p)}
                        >
                          <ShieldCheck size={15} />
                          Prüfen & freigeben
                        </button>
                      )}
                      {p.status === "draft" && (
                        <button
                          onClick={() =>
                            act("request_approval", { post_id: p.id })
                          }
                        >
                          Freigabe anfragen
                        </button>
                      )}
                      {p.status === "approved" && (
                        <>
                          <a
                            className="button primary"
                            href={"/api/exports/post/" + p.id}
                          >
                            <Download size={15} />
                            TikTok-Paket
                          </a>
                          <button onClick={() => setConfirm(p)}>
                            Veröffentlichung bestätigen
                          </button>
                        </>
                      )}
                      {p.status === "published" && (
                        <>
                          <a
                            className="button"
                            href={p.published_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Beitrag ansehen ↗
                          </a>
                          <Badge label="Manuell bestätigt · nicht verifiziert" />
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title="Dein nächster Release wartet"
            body="Wähle ein fertiges Video, ein Zielkonto und deine Caption. Jede Freigabe gilt genau für diesen Inhalt."
            action="Beitrag vorbereiten"
            onClick={() => setEdit({})}
          />
        )}
      </ArtistRequired>
      {edit && <PostEditor post={edit} onClose={() => setEdit(null)} />}
      {review && (
        <Modal
          title="Beitrag prüfen & freigeben"
          description="Du bestätigst das konkrete Video, Konto, Caption, Kennzeichnungen, Rechte und die geplante Exportaktion. Änderungen machen diese Freigabe ungültig."
          onClose={() => setReview(null)}
          wide
        >
          <div className="detail-grid">
            <Preview
              asset={data.assets.find((a: Row) => a.id === review.asset_id)}
            />
            <div>
              <h2>{review.title}</h2>
              <p>{review.caption}</p>
              <p>{review.hashtags}</p>
              <dl>
                <dt>Zielkonto</dt>
                <dd>
                  {
                    data.social_accounts.find(
                      (a: Row) => a.id === review.account_id,
                    )?.label
                  }
                </dd>
                <dt>Privatsphäre</dt>
                <dd>{review.privacy}</dd>
                <dt>KI-Kennzeichnung</dt>
                <dd>{review.is_aigc ? "Ja" : "Prüfung erforderlich"}</dd>
                <dt>Kommerzieller Inhalt</dt>
                <dd>{review.commercial ? "Ja" : "Nein"}</dd>
                <dt>Rechteprüfung</dt>
                <dd>{review.rights_note || "Noch nicht dokumentiert"}</dd>
                <dt>Dateistatus</dt>
                <dd>
                  <Badge
                    status={
                      data.assets.find((a: Row) => a.id === review.asset_id)
                        ?.rights_status
                    }
                  />
                </dd>
              </dl>
              <Form
                onSubmit={async () => {
                  if (await act("approve_post", { post_id: review.id }))
                    setReview(null);
                }}
              >
                <label className="check">
                  <input type="checkbox" required />
                  Video und Ton, Rechte, Kennzeichnung und Zielkonto wurden von
                  mir geprüft.
                </label>
                <Submit>Snapshot für Export freigeben</Submit>
              </Form>
              <button
                className="text-link"
                onClick={() => {
                  setReview(null);
                  nav("library");
                }}
              >
                Rechte in Medienbibliothek bearbeiten
              </button>
            </div>
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal
          title="Manuelle Veröffentlichung dokumentieren"
          description="Das Studio sendet nichts an TikTok. Dieser Eintrag dokumentiert deine externe Veröffentlichung und ist nicht extern verifiziert."
          onClose={() => setConfirm(null)}
        >
          <Form
            onSubmit={async (v) => {
              if (
                await act("confirm_publication", {
                  post_id: confirm.id,
                  url: v.url,
                  published_at: new Date(v.published_at).toISOString(),
                })
              )
                setConfirm(null);
            }}
          >
            <Input
              name="url"
              label="TikTok-Beitragslink"
              type="url"
              required
              placeholder="https://www.tiktok.com/@…/video/…"
            />
            <Input
              name="published_at"
              label="Tatsächlicher Veröffentlichungszeitpunkt (Browser-Zeitzone)"
              type="datetime-local"
              required
            />
            <Submit>Nachweis speichern</Submit>
          </Form>
        </Modal>
      )}
    </>
  );
}
function PostEditor({ post, onClose }: { post: Row; onClose: () => void }) {
  const { data, artistId, act, nav } = useStudio();
  const assets = data.assets.filter(
      (a: Row) => a.artist_id === artistId && a.kind === "video",
    ),
    accounts = data.social_accounts.filter(
      (a: Row) => a.artist_id === artistId,
    );
  return (
    <Modal
      title={post.id ? "Beitrag bearbeiten" : "Beitrag vorbereiten"}
      onClose={onClose}
      wide
    >
      {!assets.length || !accounts.length ? (
        <Empty
          title={
            !assets.length
              ? "Ein fertiges Video fehlt noch"
              : "Lege zuerst dein Zielkonto an"
          }
          body={
            !assets.length
              ? "Erstelle ein Video im Video-Studio oder importiere eine fertige MP4."
              : "Ein manueller Kontoeintrag genügt. Eine OAuth-Verbindung ist für Exporte nicht nötig."
          }
          action={!assets.length ? "Zum Video-Studio" : "Konten verwalten"}
          onClick={() => {
            onClose();
            nav(!assets.length ? "video" : "settings");
          }}
        />
      ) : (
        <Form
          onSubmit={async (v) => {
            const r = await act("save_post", {
              ...post,
              artist_id: artistId,
              title: v.title,
              account_id: v.account_id,
              asset_id: v.asset_id,
              cover_id: v.cover_id || null,
              campaign_id: v.campaign_id || null,
              caption: v.caption,
              hashtags: v.hashtags,
              is_aigc: v.is_aigc === "on",
              commercial: v.commercial === "on",
              privacy: v.privacy,
              rights_note: v.rights_note,
              timezone: v.timezone,
              local_time: v.local_time,
              disambiguation: v.disambiguation,
              interactions: {
                comment: v.comment === "on",
                duet: v.duet === "on",
                stitch: v.stitch === "on",
              },
            });
            if (r) onClose();
          }}
        >
          <div className="form-grid">
            <Input
              label="Interner Beitragstitel"
              name="title"
              defaultValue={post.title}
              required
            />
            <Select
              label="Zielkonto"
              name="account_id"
              defaultValue={post.account_id ?? accounts[0]?.id}
            >
              {accounts.map((a: Row) => (
                <option value={a.id} key={a.id}>
                  {a.label} · {a.status === "manual" ? "manuell" : "verbunden"}
                </option>
              ))}
            </Select>
            <Select
              label="Fertiges Video"
              name="asset_id"
              defaultValue={post.asset_id ?? assets[0]?.id}
            >
              {assets.map((a: Row) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Select
              label="Cover (optional)"
              name="cover_id"
              defaultValue={post.cover_id ?? ""}
            >
              <option value="">Kein separates Cover</option>
              {data.assets
                .filter(
                  (a: Row) => a.artist_id === artistId && a.kind === "image",
                )
                .map((a: Row) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </div>
          <Textarea
            label="Caption"
            name="caption"
            defaultValue={post.caption ?? ""}
            maxLength={2200}
          />
          <Input
            label="Hashtags"
            name="hashtags"
            defaultValue={post.hashtags ?? ""}
            placeholder="#musik #virtualartist"
          />
          <div className="form-grid">
            <Select
              label="Geplante Privatsphäre"
              name="privacy"
              defaultValue={post.privacy ?? ""}
              required
            >
              <option value="" disabled>
                Bewusst auswählen
              </option>
              <option value="SELF_ONLY">Nur ich</option>
              <option value="PUBLIC_TO_EVERYONE">Öffentlich</option>
              <option value="MUTUAL_FOLLOW_FRIENDS">Freunde</option>
              <option value="FOLLOWER_OF_CREATOR">Follower</option>
            </Select>
            <Select
              label="Kampagne"
              name="campaign_id"
              defaultValue={post.campaign_id ?? ""}
            >
              <option value="">Ohne Kampagne</option>
              {data.campaigns
                .filter((c: Row) => c.artist_id === artistId)
                .map((c: Row) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </div>
          <div className="checks">
            <label className="check">
              <input
                type="checkbox"
                name="is_aigc"
                defaultChecked={post.is_aigc ?? true}
              />
              KI-generierter Inhalt
            </label>
            <label className="check">
              <input
                type="checkbox"
                name="commercial"
                defaultChecked={post.commercial ?? false}
              />
              Kommerzieller Inhalt
            </label>
            {[
              ["comment", "Kommentare"],
              ["duet", "Duett"],
              ["stitch", "Stitch"],
            ].map(([key, label]) => (
              <label className="check" key={key}>
                <input
                  name={key}
                  type="checkbox"
                  defaultChecked={post.interactions?.[key] ?? false}
                />
                {label} erlauben
              </label>
            ))}
          </div>
          <Textarea
            label="Dokumentierte Rechte- und Kennzeichnungsprüfung"
            name="rights_note"
            defaultValue={post.rights_note ?? ""}
            placeholder="Welche Nachweise liegen vor? Welche Kennzeichnungen sind erforderlich?"
          />
          <div className="form-grid">
            <Input
              label="Geplanter lokaler Termin"
              name="local_time"
              type="datetime-local"
              defaultValue={
                post.scheduled_at
                  ? localTime(post.scheduled_at, post.timezone)
                  : ""
              }
            />
            <Input
              label="Zeitzone"
              name="timezone"
              defaultValue={post.timezone ?? "Europe/Berlin"}
            />
            <Select
              label="Bei Sommerzeit-Mehrdeutigkeit"
              name="disambiguation"
              defaultValue="reject"
            >
              <option value="reject">Nicht automatisch auflösen</option>
              <option value="earlier">Früheren Zeitpunkt wählen</option>
              <option value="later">Späteren Zeitpunkt wählen</option>
            </Select>
          </div>
          <p className="muted">
            Ein Termin ist keine Freigabe. Bei Änderungen muss erneut
            freigegeben werden.
          </p>
          <Submit>Beitrag speichern</Submit>
        </Form>
      )}
    </Modal>
  );
}
export function Campaigns() {
  const { data, artistId, act } = useStudio();
  const [create, setCreate] = useState(false),
    [edit, setEdit] = useState<Row | null>(null),
    [campaignEdit, setCampaignEdit] = useState<Row | null>(null),
    [calendarFilter, setCalendarFilter] = useState("all"),
    [month, setMonth] = useState(() =>
      Temporal.Now.plainDateISO("Europe/Berlin").with({ day: 1 }),
    );
  const campaigns = data.campaigns.filter((c: Row) => c.artist_id === artistId),
    posts = data.posts.filter(
      (p: Row) =>
        p.artist_id === artistId &&
        p.scheduled_at &&
        (calendarFilter === "all" || p.status === calendarFilter),
    );
  const first = month.subtract({ days: month.dayOfWeek - 1 });
  return (
    <>
      <SectionHead
        eyebrow="MIT ABSICHT VERÖFFENTLICHEN"
        title="Der Plan für deinen Sound."
        description="Unterschiedliche Einstiege, ein gemeinsames Ziel. Termine sind Aufgaben, keine automatische Veröffentlichung."
      >
        <button className="primary" onClick={() => setCreate(true)}>
          <Plus size={16} />
          Kampagne anlegen
        </button>
      </SectionHead>
      <ArtistRequired>
        <div className="grid-two">
          {campaigns.map((c: Row) => (
            <article className="panel" key={c.id}>
              <div className="card-top">
                <h3>{c.name}</h3>
                <Badge status={c.status} />
                <button onClick={() => setCampaignEdit(c)}>Bearbeiten</button>
              </div>
              <p>{c.goal}</p>
              <small>
                Planbudget: {Number(c.budget).toFixed(2)} € · keine automatische
                Kostenfreigabe
              </small>
              {c.concepts.map((idea: Row, i: number) => (
                <div className="campaign-concept" key={i}>
                  <span>Tag {idea.day}</span>
                  <div>
                    <strong>{idea.title}</strong>
                    <p>{idea.hook}</p>
                    <small>
                      {idea.format} · {idea.rationale}
                    </small>
                  </div>
                </div>
              ))}
            </article>
          ))}
        </div>
        <div className="panel calendar-panel">
          <Select
            label="Kalenderstatus filtern"
            value={calendarFilter}
            onChange={(e) => setCalendarFilter(e.target.value)}
          >
            <option value="all">Alle Beiträge</option>
            <option value="draft">Entwürfe</option>
            <option value="waiting_for_approval">Freigabe offen</option>
            <option value="approved">Freigegeben</option>
            <option value="published">Veröffentlicht</option>
          </Select>
          <div className="panel-heading">
            <h2>
              {new Intl.DateTimeFormat("de-DE", {
                month: "long",
                year: "numeric",
              }).format(new Date(month.toString() + "T12:00:00Z"))}
            </h2>
            <div className="actions">
              <button
                aria-label="Vorheriger Monat"
                onClick={() => setMonth(month.subtract({ months: 1 }))}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                aria-label="Nächster Monat"
                onClick={() => setMonth(month.add({ months: 1 }))}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
          <div className="calendar-grid">
            {["MO", "DI", "MI", "DO", "FR", "SA", "SO"].map((d) => (
              <div className="calendar-weekday" key={d}>
                {d}
              </div>
            ))}
            {Array.from({ length: 42 }, (_, i) => {
              const day = first.add({ days: i });
              const scheduled = posts.filter((p: Row) =>
                localTime(p.scheduled_at, p.timezone).startsWith(
                  day.toString(),
                ),
              );
              return (
                <div
                  className={
                    "calendar-day " +
                    (day.month !== month.month ? "outside" : "")
                  }
                  key={i}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const p = posts.find(
                      (p: Row) => p.id === e.dataTransfer.getData("text/plain"),
                    );
                    if (p && p.status !== "published")
                      await act("save_post", {
                        ...p,
                        local_time:
                          day.toString() +
                          "T" +
                          localTime(p.scheduled_at, p.timezone).slice(11),
                        disambiguation: "reject",
                      });
                  }}
                >
                  <span>{day.day}</span>
                  {scheduled.map((p: Row) => (
                    <button
                      key={p.id}
                      draggable={p.status !== "published"}
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/plain", p.id)
                      }
                      onClick={() => setEdit(p)}
                    >
                      <small>
                        {localTime(p.scheduled_at, p.timezone).slice(11)}
                      </small>
                      {p.title}
                      <i>
                        {p.status === "approved"
                          ? "Export bereit"
                          : "Freigabe prüfen"}
                      </i>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
          <p className="muted">
            Beiträge auf einen anderen Tag ziehen oder antippen, um den Termin
            zu bearbeiten. Terminänderungen erfordern eine neue Freigabe.
          </p>
        </div>
        {!campaigns.length && (
          <Empty
            title="Mehr als ein einzelner Clip"
            body="Plane eine bewusste Auswahl verschiedener Formate: Teaser, Lyrics, visuelle Geschichte oder Community-Antwort."
            action="Kampagne anlegen"
            onClick={() => setCreate(true)}
          />
        )}
      </ArtistRequired>
      {create && (
        <Modal title="Kampagne anlegen" onClose={() => setCreate(false)}>
          <Form
            onSubmit={async (v) => {
              if (v.method === "ai") {
                if (
                  await act("queue_ai", {
                    artist_id: artistId,
                    kind: "prepare_campaign",
                    input: { song_id: v.song_id, prompt: v.goal },
                  })
                )
                  setCreate(false);
              } else if (
                await act("create_campaign", {
                  artist_id: artistId,
                  song_id: v.song_id || null,
                  name: v.name,
                  goal: v.goal,
                  budget: Number(v.budget),
                })
              )
                setCreate(false);
            }}
          >
            <Input label="Kampagnenname" name="name" required />
            <Select label="Song" name="song_id">
              <option value="">Ohne Song</option>
              {data.songs
                .filter((s: Row) => s.artist_id === artistId)
                .map((s: Row) => (
                  <option value={s.id} key={s.id}>
                    {s.title}
                  </option>
                ))}
            </Select>
            <Textarea label="Ziel und Rahmen" name="goal" />
            <Input
              label="Planbudget (€)"
              name="budget"
              type="number"
              min="0"
              defaultValue="0"
            />
            <Select label="Planung" name="method">
              <option value="manual">Manuell anlegen</option>
              <option value="ai">
                KI plant verschiedene Beitragskonzepte (Song erforderlich)
              </option>
            </Select>
            <Submit>Kampagne erstellen</Submit>
          </Form>
        </Modal>
      )}
      {campaignEdit && (
        <Modal
          title="Kampagne bearbeiten"
          onClose={() => setCampaignEdit(null)}
        >
          <Form
            onSubmit={async (v) => {
              if (
                await act("update_campaign", {
                  ...v,
                  id: campaignEdit.id,
                  version: campaignEdit.version,
                  budget: Number(v.budget),
                })
              )
                setCampaignEdit(null);
            }}
          >
            <Input
              label="Name"
              name="name"
              defaultValue={campaignEdit.name}
              required
            />
            <Textarea
              label="Ziel"
              name="goal"
              defaultValue={campaignEdit.goal}
            />
            <Input
              label="Planbudget (€)"
              name="budget"
              type="number"
              min="0"
              defaultValue={campaignEdit.budget}
            />
            <Select
              label="Status"
              name="status"
              defaultValue={campaignEdit.status}
            >
              <option value="draft">Entwurf</option>
              <option value="producing">In Produktion</option>
              <option value="ready">Bereit</option>
              <option value="completed">Abgeschlossen</option>
              <option value="archived">Archiviert</option>
            </Select>
            <Submit />
          </Form>
        </Modal>
      )}
      {edit && <PostEditor post={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
