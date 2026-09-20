"use client";
import { useRef, useState } from "react";
import {
  Sparkles,
  CheckCircle2,
  Pause,
  Play,
  Download,
  Upload,
  Copy,
  Settings2,
  ArrowRight,
  ListTodo,
} from "lucide-react";
import {
  useStudio,
  Modal,
  Form,
  Input,
  Textarea,
  Select,
  Badge,
  Preview,
  SectionHead,
  Empty,
  formatDate,
  type Row,
} from "./ui";
import { automationStageNames } from "@/lib/automation";
import { imageProviders } from "@/lib/image-generation";
import { resolveLocalTime } from "@/lib/domain";
function useAutomaticAction() {
  const { reload, toast } = useStudio(),
    lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(action: string, data: Row, key?: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data, key }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await reload();
      toast(
        action === "auto_create"
          ? "Dein Artist entsteht. Die KI übernimmt die Produktion."
          : "Automatik aktualisiert.",
      );
      return v;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { run, busy, error };
}
function BudgetPreview({
  image,
  music,
}: {
  image: Row | null;
  music: Row | null;
}) {
  return (
    <div className="automation-budget">
      <strong>Was die Automatik übernimmt</strong>
      <p>
        Einmal: Charakter, Bio und Hauptporträt. Danach täglich: eine
        Songproduktion, ein Bild mit Porträtreferenz und drei fertige MP4 mit
        Beschreibung.
      </p>
      <small>
        Bild-KI:{" "}
        {image
          ? imageProviders[image.provider as keyof typeof imageProviders]
          : "Codex mit vorhandener ChatGPT-Anmeldung"}
        {image?.provider === "gemini_api"
          ? ` · ${Number(image.estimated_cost_usd).toFixed(4)} USD Kostenansatz/Bild`
          : ""}
        .{" "}
        {(!image || image.provider === "codex") &&
          "Account-Kontingent wird genutzt."}
      </small>
      {image && image.provider !== "manual" && (
        <small>
          Bildlimit: {image.daily_limit}/Tag · {image.monthly_limit}/Monat
          {image.provider === "gemini_api"
            ? ` · ${image.daily_limit_usd} USD/Tag · ${image.monthly_limit_usd} USD/Monat`
            : ""}
          .
        </small>
      )}
      <small>
        {music?.state === "connected"
          ? `SunoAPI: ${music.credits_per_generation ?? "unbekannte"} Credits/Auftrag · Tageslimit ${music.daily_credit_limit}, Monatslimit ${music.monthly_credit_limit}.`
          : "Suno ohne API: Du bekommst eine fertige Produktionsaufgabe. Nach deinem Audioimport geht es automatisch weiter."}
      </small>
      <small>
        Alle Studio- und Providerbudgets gelten weiter. Keine automatische
        Veröffentlichung und keine neuen kostenpflichtigen Dienste. Bei
        fehlendem Zugang erscheint eine Aufgabe.
      </small>
    </div>
  );
}
export function CreateAutomaticArtist({ onClose }: { onClose: () => void }) {
  const { data, setArtistId, nav } = useStudio(),
    { run, busy, error } = useAutomaticAction();
  const [key] = useState(() => crypto.randomUUID()),
    [providers] = useState({
      image: data.image_connection ?? null,
      music: data.music_connection ?? null,
    });
  return (
    <Modal
      title="Artist erstellen"
      description="Du gibst die Richtung vor – oder überlässt alles der KI."
      onClose={() => !busy && onClose()}
      wide
    >
      <div className="automation-steps">
        <span>Charakter</span>
        <ArrowRight size={14} />
        <span>Porträt</span>
        <ArrowRight size={14} />
        <span>Song</span>
        <ArrowRight size={14} />
        <span>MP4</span>
      </div>
      <Form
        onSubmit={async (v) => {
          const result = await run(
            "auto_create",
            {
              brief: {
                name: v.name ?? "",
                genre: v.genre ?? "",
                appearance: v.appearance ?? "",
                wishes: v.wishes ?? "",
                language: v.language || "Deutsch",
              },
              approved: true,
              image_version: providers.image?.version ?? null,
              music_version: providers.music?.version ?? null,
            },
            key,
          );
          if (result) {
            setArtistId(result.id);
            onClose();
            nav("tasks");
          }
        }}
      >
        <details>
          <summary>Eigene Wünsche (optional)</summary>
          <div className="form-grid">
            <Input
              name="name"
              label="Name (optional)"
              placeholder="Die KI findet einen passenden Namen"
            />
            <Input
              name="genre"
              label="Musikstil (optional)"
              placeholder="z. B. melancholischer Deutschpop"
            />
            <Input name="language" label="Sprache" defaultValue="Deutsch" />
            <Textarea
              name="appearance"
              label="Aussehen (optional)"
              placeholder="z. B. erwachsene Figur, kupferrote Haare, analoger Fotostil"
            />
            <Textarea
              name="wishes"
              label="Charakter, Themen & weitere Wünsche (optional)"
              placeholder="Was soll den Artist besonders machen?"
            />
          </div>
        </details>
        <BudgetPreview image={providers.image} music={providers.music} />
        <p className="muted">
          Mit „Artist erstellen & Automatik starten“ gibst du diese internen
          Produktionen innerhalb der eingerichteten Grenzen frei. Die tägliche
          Produktion lässt sich jederzeit pausieren. Das Hauptporträt bleibt die
          feste Referenz; perfekte Gesichtsgleichheit ist nicht garantiert.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          <Sparkles size={17} />
          {busy ? "Wird gestartet …" : "Artist erstellen & Automatik starten"}
        </button>
      </Form>
    </Modal>
  );
}
export function AutomationSettings({
  artist,
  onClose,
}: {
  artist: Row;
  onClose: () => void;
}) {
  const { data } = useStudio(),
    { run, busy, error } = useAutomaticAction();
  const [snapshot] = useState({
    policy: data.artist_automations.find((p: Row) => p.artist_id === artist.id),
    image: data.image_connection ?? null,
    music: data.music_connection ?? null,
  });
  const p = snapshot.policy;
  return (
    <Modal
      title={"Automatik · " + artist.name}
      description="Ein Produktionslauf pro Tag. Bei einer offenen manuellen Übergabe wartet der nächste Lauf."
      onClose={() => !busy && onClose()}
    >
      <Form
        onSubmit={async (v) => {
          if (
            await run("auto_settings", {
              artist_id: artist.id,
              version: p?.version ?? 0,
              enabled: v.enabled === "on",
              daily_time: v.time,
              music_mode: v.music,
              approved: true,
              image_version: snapshot.image?.version ?? null,
              music_version: snapshot.music?.version ?? null,
            })
          )
            onClose();
        }}
      >
        <label className="checkbox">
          <input
            name="enabled"
            type="checkbox"
            defaultChecked={p?.enabled ?? true}
          />
          Tägliche Automatik aktiv
        </label>
        <Input
          name="time"
          label={"Täglicher Produktionsstart · " + data.settings.timezone}
          type="time"
          defaultValue={p?.daily_time ?? "09:00"}
          required
        />
        <Select
          name="music"
          label="Musikproduktion"
          defaultValue={p?.music_mode ?? "auto"}
        >
          <option value="auto">
            SunoAPI nutzen, wenn verbunden und Budget freigegeben
          </option>
          <option value="manual">
            Suno immer als manuelle Aufgabe vorbereiten
          </option>
        </Select>
        <BudgetPreview image={snapshot.image} music={snapshot.music} />
        <p className="muted">
          Speichern bestätigt die hier angezeigten aktuellen Provider und
          Budgets für wartende, noch nicht versendete und kommende Produktionen.
          Preis- oder Verbindungsänderungen benötigen eine neue Bestätigung.
          Begonnene Jobs können noch fertiglaufen; einzelne Aufträge unter Jobs
          abbrechen.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          Automatik & Budgets speichern
        </button>
      </Form>
    </Modal>
  );
}
export function AutomationOverview() {
  const { data, nav } = useStudio();
  const policies = data.artist_automations ?? [],
    open = (data.manual_tasks ?? []).filter(
      (t: Row) => t.state === "open",
    ).length;
  if (!policies.length) return null;
  return (
    <div className="panel automation-overview">
      <div>
        <small>DEINE KI PRODUZIERT</small>
        <h3>
          {policies.filter((p: Row) => p.enabled).length} Artists in täglicher
          Automatik
        </h3>
        <p>
          {open
            ? `${open} manuelle Aufgaben warten auf dich.`
            : "Aktuell keine manuelle Übergabe erforderlich."}
        </p>
      </div>
      <button className="primary" onClick={() => nav("tasks")}>
        <ListTodo size={17} />
        Produktionen & Aufgaben
      </button>
    </div>
  );
}
export function ManualTasks() {
  const { data, artistId, act, nav, toast } = useStudio();
  const [all, setAll] = useState(false),
    [completed, setCompleted] = useState(false),
    [settings, setSettings] = useState<Row | null>(null);
  const policies = (data.artist_automations ?? []).filter(
    (p: Row) => all || p.artist_id === artistId,
  );
  const runs = (data.automation_runs ?? []).filter(
    (r: Row) => all || r.artist_id === artistId,
  );
  const tasks = (data.manual_tasks ?? []).filter(
    (t: Row) =>
      (all || t.artist_id === artistId) && (completed || t.state === "open"),
  );
  return (
    <>
      <SectionHead
        eyebrow="DIE KI ARBEITET. DU ÜBERNIMMST NUR DIE ÜBERGABEN."
        title="Manuelle Aufgaben."
        description="Verfolge deine tägliche Produktion, übernimm Suno-Audio und lade fertige TikTok-Videos mit Beschreibung herunter."
      />
      <div className="toolbar">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />
          Alle Artists
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={completed}
            onChange={(e) => setCompleted(e.target.checked)}
          />
          Erledigte Aufgaben anzeigen
        </label>
      </div>
      {policies.map((p: Row) => {
        const artist = data.artists.find((a: Row) => a.id === p.artist_id),
          current = runs.find((r: Row) => r.artist_id === p.artist_id);
        const clips = data.automation_clips.filter(
          (clip: Row) => clip.run_id === current?.id,
        );
        const renderJobs = clips
          .map((clip: Row) => data.jobs.find((j: Row) => j.id === clip.job_id))
          .filter(Boolean);
        const rendering = renderJobs.find((j: Row) => j.state === "running");
        return (
          <div className="panel automatic-artist" key={p.artist_id}>
            <div className="automatic-artist-heading">
              {p.reference_asset_id && (
                <img
                  className="automatic-avatar"
                  src={"/api/assets/" + p.reference_asset_id}
                  alt={artist.name}
                />
              )}
              <div>
                <small>
                  TÄGLICHE PRODUKTION · {p.daily_time} · {p.timezone}
                </small>
                <h2>{artist.name}</h2>
                <p>
                  {p.enabled
                    ? "Nächster täglicher Termin: " +
                      formatDate(p.next_run_at, p.timezone)
                    : "Automatik pausiert. Bereits begonnene Jobs können noch fertiglaufen."}
                </p>
                {current?.stage === "video" && (
                  <p className="muted">
                    {
                      renderJobs.filter((j: Row) => j.state === "succeeded")
                        .length
                    }{" "}
                    von 3 Videos fertig
                    {rendering
                      ? ` · Aktuelles Rendering ${Math.round(rendering.progress)} %`
                      : " · Nächster Renderauftrag wird vorbereitet"}
                  </p>
                )}
              </div>
              <div className="actions">
                <button
                  onClick={() =>
                    act("auto_pause", {
                      artist_id: p.artist_id,
                      version: p.version,
                      enabled: !p.enabled,
                    })
                  }
                >
                  {p.enabled ? <Pause size={15} /> : <Play size={15} />}{" "}
                  {p.enabled ? "Pausieren" : "Fortsetzen"}
                </button>
                <button onClick={() => setSettings(artist)}>
                  <Settings2 size={15} />
                  Automatik einstellen
                </button>
              </div>
            </div>
            {current && (
              <>
                <div className="automation-steps">
                  {Object.entries(automationStageNames).map(([key, label]) => (
                    <span
                      key={key}
                      className={current.stage === key ? "current" : ""}
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <p>
                  <Badge
                    status={
                      current.state === "ready" ? "succeeded" : current.state
                    }
                  />
                  {current.error && (
                    <span className="muted"> {current.error}</span>
                  )}
                </p>
              </>
            )}
          </div>
        );
      })}
      {!policies.length && (
        <Empty
          title="Dein Artist kann selbständig produzieren"
          body="Erstelle einen neuen Artist mit der KI oder aktiviere die Automatik für einen bestehenden Künstler."
          action="Zu den Künstlern"
          onClick={() => nav("artists")}
        />
      )}
      {tasks.length ? (
        <div className="manual-task-grid">
          {tasks.map((t: Row) => {
            const run =
              runs.find((r: Row) => r.id === t.run_id) ??
              data.automation_runs.find((r: Row) => r.id === t.run_id);
            return (
              <section className="panel manual-task" key={t.id}>
                <div className="panel-heading">
                  <div>
                    <small>
                      {
                        data.artists.find((a: Row) => a.id === t.artist_id)
                          ?.name
                      }{" "}
                      · {formatDate(t.created_at)}
                    </small>
                    <h3>{t.title}</h3>
                  </div>
                  <Badge
                    status={
                      t.state === "done" ? "succeeded" : "waiting_for_input"
                    }
                    label={
                      t.state === "done"
                        ? "Erledigt"
                        : t.kind === "publish_video"
                          ? "Bereit zum Veröffentlichen"
                          : t.kind === "produce_music"
                            ? "Audio übernehmen"
                            : "Aktion nötig"
                    }
                  />
                </div>
                <p>{t.body}</p>
                {t.kind === "publish_video" ? (
                  <PublishTask task={t} />
                ) : t.kind === "produce_music" && run?.music_order_id ? (
                  <MusicTask task={t} run={run} />
                ) : (
                  <HelpTask
                    task={t}
                    run={run}
                    onSettings={() =>
                      setSettings(
                        data.artists.find((a: Row) => a.id === t.artist_id),
                      )
                    }
                  />
                )}
              </section>
            );
          })}
        </div>
      ) : (
        policies.length > 0 && (
          <Empty
            title="Hier musst du gerade nichts tun"
            body="Die KI führt ihre Produktionsschritte aus. Wenn ein Song in Suno erzeugt werden muss oder Videos bereit sind, erscheinen die Aufgaben hier."
          />
        )
      )}
      {settings && (
        <AutomationSettings
          artist={settings}
          onClose={() => setSettings(null)}
        />
      )}
    </>
  );
}
function MusicTask({ task, run }: { task: Row; run: Row }) {
  const { data, toast, nav } = useStudio();
  const order = data.music_orders.find((m: Row) => m.id === run.music_order_id);
  if (!order) return null;
  return (
    <>
      <div className="music-package-fields">
        {[
          ["Titel", order.package.title],
          ["Musikstil", order.package.style_prompt],
          ["Lyrics", order.package.lyrics],
        ].map(([label, value]) => (
          <details key={label} open={label !== "Lyrics"}>
            <summary>{label}</summary>
            <p className="preserve-lines">{value}</p>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(value);
                toast(label + " kopiert.");
              }}
            >
              <Copy size={14} />
              {label} kopieren
            </button>
          </details>
        ))}
      </div>
      <div className="actions">
        <a
          className="button"
          href="https://suno.com/"
          target="_blank"
          rel="noreferrer"
        >
          Suno öffnen
        </a>
        <a className="button" href={"/api/exports/suno/" + order.id}>
          <Download size={15} />
          Suno-Paket
        </a>
        {order.provider === "sunoapi_org" && (
          <button onClick={() => nav("music")}>
            Vorhandenen API-Auftrag prüfen
          </button>
        )}
      </div>
      {task.state !== "done" && <TaskUpload task={task} run={run} audio />}
    </>
  );
}
function TaskUpload({
  task,
  run,
  audio = false,
}: {
  task: Row;
  run: Row;
  audio?: boolean;
}) {
  const { reload, toast, act } = useStudio();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="form task-upload"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          const f = new FormData(e.currentTarget);
          f.set("artist_id", task.artist_id);
          f.set(
            "origin",
            audio
              ? "Suno · manuelle Automatikaufgabe"
              : "Manuelles Hauptporträt für Künstlerautomatik",
          );
          if (audio) {
            f.set("song_id", run.song_id);
            f.set("order_id", run.music_order_id);
            f.set("manual_task_id", task.id);
          }
          const response = await fetch("/api/upload", {
            method: "POST",
            body: f,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          if (!audio) {
            const r = await act("auto_use_portrait", {
              run_id: run.id,
              asset_id: result.id,
            });
            if (!r)
              throw new Error(
                "Bild importiert. Referenzzuordnung bitte prüfen.",
              );
          }
          await reload();
          toast("Datei übernommen. Die Produktion läuft automatisch weiter.");
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="upload-zone">
        <Upload size={23} />
        <strong>
          {audio ? "Suno-Aufnahme hochladen" : "Hauptporträt hochladen"}
        </strong>
        <input
          name="file"
          type="file"
          accept={
            audio
              ? "audio/mpeg,audio/wav,audio/flac,audio/ogg"
              : "image/png,image/jpeg,image/webp"
          }
          required
        />
      </label>
      <p className="muted">
        {audio
          ? "Wird automatisch diesem Song und dieser Lyrics-Version zugeordnet. Anschließend erstellt das Studio die Videos."
          : "Dieses Bild wird zur festen Referenz. Verwende nur Material, das du hierfür nutzen und an die eingerichtete KI übermitteln darfst."}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {busy
          ? "Wird übernommen …"
          : audio
            ? "Audio übernehmen & automatisch fortsetzen"
            : "Porträt übernehmen & fortsetzen"}
      </button>
    </form>
  );
}
function HelpTask({
  task,
  run,
  onSettings,
}: {
  task: Row;
  run: Row;
  onSettings: () => void;
}) {
  const { nav } = useStudio(),
    { run: action, busy, error } = useAutomaticAction();
  if (task.state === "done") return null;
  return (
    <>
      <div className="actions">
        <button onClick={() => nav("settings")}>Provider & Jobs öffnen</button>
        <button onClick={onSettings}>Verbindungen & Budgets freigeben</button>
        {run?.image_generation_id && (
          <button onClick={() => nav("library")}>Bildauftrag klären</button>
        )}
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            action("auto_retry", { run_id: run.id, approved: true })
          }
        >
          Schritt erneut freigeben
        </button>
      </div>
      <p className="muted">
        Erneut freigeben startet nur einen bekannten fehlgeschlagenen Schritt
        neu und kann Kontingent verbrauchen. Unklare externe Aufträge zuerst
        klären.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {run?.stage === "portrait" && <TaskUpload task={task} run={run} />}
    </>
  );
}
function PublishTask({ task }: { task: Row }) {
  const { data, toast } = useStudio(),
    { run, busy, error } = useAutomaticAction();
  const post = data.posts.find((p: Row) => p.id === task.post_id),
    asset = data.assets.find((a: Row) => a.id === post?.asset_id);
  const [confirm, setConfirm] = useState(false),
    [version] = useState(post?.version);
  if (!post || !asset)
    return <p>Der zugeordnete Beitrag ist nicht mehr verfügbar.</p>;
  return (
    <>
      <div className="delivery-preview">
        <Preview asset={asset} />
      </div>
      <label className="field">
        <span>Beschreibung für TikTok</span>
        <textarea
          readOnly
          rows={4}
          value={post.caption + "\n\n" + post.hashtags}
        />
      </label>
      <div className="actions">
        <a
          className="button primary"
          href={"/api/assets/" + asset.id + "?download"}
        >
          <Download size={15} />
          MP4 herunterladen
        </a>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(
              post.caption + "\n\n" + post.hashtags,
            );
            toast("Beschreibung kopiert.");
          }}
        >
          <Copy size={15} />
          Beschreibung kopieren
        </button>
        <a className="button" href={"/api/exports/delivery/" + post.id}>
          MP4 + Beschreibung als ZIP
        </a>
      </div>
      <p className="muted">
        Virtueller KI-Künstler: KI-Kennzeichnung in TikTok prüfen/aktivieren.
        Bild- und Musikrechte, Kennzeichnung kommerzieller Inhalte und
        Privatsphäre vor dem Hochladen selbst prüfen. Das Studio veröffentlicht
        nichts automatisch.
      </p>
      {task.state === "done" ? (
        <p>
          <CheckCircle2 size={15} /> Manuell dokumentiert:{" "}
          <a href={post.published_url} target="_blank" rel="noreferrer">
            TikTok-Beitrag öffnen
          </a>
        </p>
      ) : (
        <>
          <button onClick={() => setConfirm(!confirm)}>
            {confirm
              ? "Nachweis schließen"
              : "Ich habe auf TikTok veröffentlicht"}
          </button>
          {confirm && (
            <Form
              onSubmit={async (v) => {
                try {
                  const instant = resolveLocalTime(
                    v.time,
                    data.settings.timezone,
                    v.disambiguation,
                  );
                  await run("auto_publish", {
                    task_id: task.id,
                    post_version: version,
                    url: v.url,
                    published_at: instant,
                    rights_note: v.notes,
                    confirmed: v.confirmed === "on",
                  });
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            >
              <Input label="TikTok-Link" name="url" type="url" required />
              <Input
                label={
                  "Tatsächlicher Veröffentlichungszeitpunkt · " +
                  data.settings.timezone
                }
                name="time"
                type="datetime-local"
                required
              />
              <Select
                name="disambiguation"
                label="Bei doppelter Uhrzeit im Herbst"
                defaultValue="reject"
              >
                <option value="reject">Bei Mehrdeutigkeit nachfragen</option>
                <option value="earlier">Erstes Vorkommen</option>
                <option value="later">Zweites Vorkommen</option>
              </Select>
              <Textarea
                name="notes"
                label="Geprüfte Bild-/Musikrechte und Kennzeichnungen"
                minLength={10}
                required
              />
              <label className="checkbox">
                <input name="confirmed" type="checkbox" required />
                Ich habe Rechte, KI-/Werbekennzeichnung und diesen Beitrag
                geprüft und selbst veröffentlicht.
              </label>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy}>
                Veröffentlichung dokumentieren
              </button>
            </Form>
          )}
        </>
      )}
    </>
  );
}
