"use client";
import { ImageConnectionCard } from "./images";
import { VeoConnectionCard } from "./veo";
import { useState } from "react";
import { CliConnect } from "./cli-connect";
import { SunoConnectionCard } from "./suno";
import {
  Sparkles,
  Plug,
  CheckCircle2,
  OctagonPause,
  RotateCcw,
  X,
  Plus,
  Download,
  ShieldCheck,
  HardDrive,
  Activity,
  ArrowRight,
} from "lucide-react";
import {
  useStudio,
  SectionHead,
  Modal,
  Form,
  Input,
  Textarea,
  Select,
  Submit,
  Badge,
  Empty,
  type Row,
  formatDate,
} from "./ui";
const kindNames: Record<string, string> = {
  auto_style_research: "Musikstil im Internet recherchieren",
  auto_style_audio: "Musikreferenz anhören und analysieren",
  auto_identity: "Artist autonom entwickeln",
  auto_song: "Tägliche Songproduktion planen",
  music_video_storyboard: "Musikvideo-Storyboard entwickeln",
  health_check: "Verbindungstest",
  artist_concepts: "Künstlerkonzepte",
  create_song_ideas: "Songideen",
  write_lyrics: "Songtext schreiben",
  revise_lyrics: "Lyrics überarbeiten",
  create_storyboard: "Storyboard",
  prepare_campaign: "Kampagne planen",
  analyze_metrics: "Kennzahlen analysieren",
  draft_reply: "Antwortentwurf",
  render_video: "Video rendern",
  image_generate: "KI-Bild erzeugen",
  veo_generate: "Veo-Szene erzeugen",
  veo_sync: "Veo-Ergebnis abrufen",
  analyze_asset: "Audioanalyse",
  sync_metrics: "TikTok-Lesedaten",
  prepare_music_package: "Suno-Paket erstellen",
  suno_generate: "Musikauftrag an SunoAPI senden",
  suno_sync: "Suno-Ergebnis abrufen und importieren",
};
export function Settings() {
  const { data, artistId, act, nav, toast } = useStudio();
  const [tab, setTab] = useState(
      data.settings.setup_step < 9 ? "setup" : "jobs",
    ),
    [detected, setDetected] = useState<any>(null),
    [detail, setDetail] = useState<Row | null>(null),
    [account, setAccount] = useState(false),
    [deleting, setDeleting] = useState(false);
  const s = data.settings;
  const detect = async () => {
    try {
      const r = await fetch("/api/providers");
      const v = await r.json();
      setDetected(v);
    } catch {
      setDetected({ error: "Runner nicht erreichbar." });
    }
  };
  return (
    <>
      <SectionHead
        eyebrow="DEIN STUDIO UNTER KONTROLLE"
        title="Jobs & Einstellungen."
        description="Verbindungen, Produktionsgrenzen und ein nachvollziehbarer Blick hinter die Kulissen."
      />
      <div className="tabs">
        {[
          ["setup", "Einrichtung"],
          ["jobs", "Aufträge"],
          ["providers", "Provider & Konten"],
          ["settings", "Studio & Budgets"],
          ["data", "Daten & Betrieb"],
        ].map(([v, l]) => (
          <button
            key={v}
            className={tab === v ? "selected" : ""}
            onClick={() => setTab(v)}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "setup" && (
        <div className="setup-layout">
          <div className="panel">
            <h2>Dein Studio startklar machen</h2>
            <p>
              Externe Zugänge sind optional. Du kannst jederzeit mit deinen
              eigenen Dateien und Texten arbeiten.
            </p>
            {[
              [
                "Betreiberkonto",
                true,
                "Deine Anmeldung schützt das Studio.",
                () => {},
              ],
              [
                "Speicher & Zeitzone",
                true,
                `${(data.storage_bytes / 1024 / 1024).toFixed(1)} MB belegt · ${s.timezone}`,
                () => setTab("settings"),
              ],
              [
                "KI erkennen & testen",
                data.providers.some((p: Row) => p.state === "connected"),
                "Installierte CLIs erkennen und echten Textauftrag testen.",
                () => setTab("providers"),
              ],
              [
                "Produktionsgrenzen",
                s.setup_step >= 9,
                "Tages- und Monatslimits für KI und lokale Renderkapazität.",
                () => setTab("settings"),
              ],
              [
                "Suno-Produktionsweg",
                true,
                "SunoAPI.org verbinden oder Produktionspakete manuell nutzen.",
                () => nav("music"),
              ],
              [
                "Erster Künstler",
                data.artists.length > 0,
                "Persönlichkeit, Musikprofil und visuelle Identität anlegen.",
                () => nav("artists"),
              ],
              [
                "TikTok-Konto (optional)",
                data.social_accounts.length > 0,
                "Ein manueller Eintrag genügt für die Exportstrecke.",
                () => setTab("providers"),
              ],
              [
                "Erster Produktionsdurchlauf",
                data.renders.some((r: Row) => r.state === "succeeded"),
                "Songidee → Lyrics → Suno → Audio → Video → Export.",
                () => nav("overview"),
              ],
            ].map(([title, done, desc, go]: any, i) => (
              <button
                className="setup-step"
                key={title}
                onClick={go}
                disabled={i === 0}
              >
                <span className={done ? "step-complete" : "step-number"}>
                  {done ? <CheckCircle2 size={21} /> : i + 1}
                </span>
                <div>
                  <strong>{title}</strong>
                  <p>{desc}</p>
                </div>
                {i > 0 && <ArrowRight size={16} />}
              </button>
            ))}
          </div>
          <div className="panel">
            <h3>Du behältst die Kontrolle</h3>
            <p>
              Die KI bereitet Inhalte vor. Rechte, Budgets und öffentliche
              Schritte bleiben überprüfbar.
            </p>
            <div className="info-bar">
              Kein kostenpflichtiger API-Key ist für Codex erforderlich. Die
              offizielle CLI-Anmeldung wird ausschließlich im Runner verwendet.
            </div>
            <button className="primary" onClick={() => nav("artists")}>
              Mit Künstler starten
            </button>
          </div>
        </div>
      )}
      {tab === "jobs" && (
        <>
          <div className="toolbar">
            <span className="muted">
              Dauerhafte Aufträge · Versuchshistorie · lokaler Worker
            </span>
            <button
              className={s.emergency_stop ? "primary" : "danger"}
              onClick={() =>
                act("emergency_stop", { enabled: !s.emergency_stop })
              }
            >
              <OctagonPause size={16} />
              {s.emergency_stop
                ? "Neue Produktionen wieder zulassen"
                : "Not-Aus aktivieren"}
            </button>
          </div>
          <p className="muted">
            Not-Aus sperrt neue Starts. Laufende lokale Jobs können einzeln
            abgebrochen werden; bereits gesendete externe Vorgänge wären
            gesondert zu prüfen.
          </p>
          {data.jobs.length ? (
            <div className="panel table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Auftrag</th>
                    <th>Status</th>
                    <th>Fortschritt</th>
                    <th>Erstellt</th>
                    <th>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobs.map((j: Row) => (
                    <tr key={j.id}>
                      <td>
                        <button
                          className="title-button"
                          onClick={() => setDetail(j)}
                        >
                          {kindNames[j.kind] ?? j.kind}
                        </button>
                        <small>
                          {j.id.slice(0, 8)} · Versuch {j.attempt_count}
                        </small>
                      </td>
                      <td>
                        <Badge status={j.state} />
                      </td>
                      <td>
                        <progress value={j.progress} max="100" />
                      </td>
                      <td>{formatDate(j.created_at)}</td>
                      <td>
                        {[
                          "queued",
                          "running",
                          "waiting_for_input",
                          "waiting_for_provider",
                        ].includes(j.state) ? (
                          <button
                            onClick={() => act("cancel_job", { id: j.id })}
                          >
                            Abbrechen
                          </button>
                        ) : (
                          ["failed", "cancelled"].includes(j.state) &&
                          j.side_effect !== "external" && (
                            <button
                              onClick={() => act("retry_job", { id: j.id })}
                            >
                              <RotateCcw size={14} />
                              Neu starten
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Alle Regler stehen bereit"
              body="KI-Aufträge, Audioanalysen und Renderings erscheinen hier mit Zustand und Versuchshistorie."
            />
          )}
        </>
      )}
      {tab === "providers" && (
        <>
          <div className="grid-two">
            {["codex", "gemini"].map((provider) => {
              const connection = data.providers.find(
                (p: Row) => p.provider === provider,
              );
              const detection = detected?.providers?.find(
                (p: Row) => p.provider === provider,
              );
              return (
                <div className="panel provider-card" key={provider}>
                  <div className="panel-heading">
                    <span className="provider-symbol">
                      <Sparkles size={24} />
                    </span>
                    <Badge
                      label={
                        connection?.state === "connected"
                          ? "Live getestet"
                          : detection?.installed
                            ? "Installiert"
                            : "Noch nicht im Studio geprüft"
                      }
                    />
                  </div>
                  <h2>{provider === "codex" ? "Codex CLI" : "Gemini CLI"}</h2>
                  <p>
                    {provider === "codex"
                      ? "Offizieller ChatGPT-Account-Login. Keine OpenAI-API-Key-Pflicht."
                      : "Offizielle vorhandene CLI-Anmeldung. Headless-JSON wird separat geprüft."}
                  </p>
                  <p className="muted">
                    Fähigkeit: strukturierte Texte. Bilder separat unter
                    „Bild-KI auswählen“ einrichten.
                  </p>
                  {detection && (
                    <small>
                      Version: {detection.version ?? "Nicht installiert"} ·{" "}
                      {detection.authenticated
                        ? "Konto angemeldet"
                        : "Konto nicht angemeldet"}
                    </small>
                  )}
                  {connection && (
                    <small>
                      Letzter Live-Test: {formatDate(connection.checked_at)}
                    </small>
                  )}
                  <div className="actions">
                    <CliConnect
                      provider={provider as "codex" | "gemini"}
                      onChange={detect}
                    />
                    <button onClick={detect}>
                      <Plug size={16} />
                      CLI erkennen
                    </button>
                    <button
                      className="primary"
                      onClick={() =>
                        act("queue_ai", {
                          kind: "health_check",
                          input: { provider },
                        })
                      }
                    >
                      Verbindung testen
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {detected?.error && <p className="error">{detected.error}</p>}
          <SunoConnectionCard />
          <ImageConnectionCard />
          <VeoConnectionCard />
          <div className="panel">
            <h3>Weitere Produktionsprovider</h3>
            <div className="provider-row">
              <strong>TikTok Direct Post</strong>
              <Badge label="Für privates Werkzeug nicht aktiviert" />
              <span>
                Gesonderte Zulässigkeit, App-Review und Scopes erforderlich.
              </span>
            </div>
          </div>
          <div className="panel">
            <div className="panel-heading">
              <h3>Social-Konten</h3>
              <button disabled={!artistId} onClick={() => setAccount(true)}>
                <Plus size={15} />
                Manuelles Konto
              </button>
            </div>
            {!artistId && <p>Wähle zuerst einen Künstler.</p>}
            {data.social_accounts
              .filter((a: Row) => a.artist_id === artistId)
              .map((a: Row) => (
                <div className="provider-row" key={a.id}>
                  <strong>{a.label}</strong>
                  <Badge status={a.status} />
                  <span>
                    {a.scopes.length
                      ? a.scopes.join(", ")
                      : "Export · manuelle Veröffentlichung"}
                    <small>
                      Letzte Synchronisation: {formatDate(a.last_sync_at)}
                    </small>
                  </span>
                  {a.status === "connected" && (
                    <button
                      onClick={async () => {
                        const r = await fetch("/api/tiktok/sync", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ account_id: a.id }),
                        });
                        const v = await r.json();
                        toast(
                          r.ok ? "Synchronisation abgeschlossen." : v.error,
                        );
                      }}
                    >
                      Lesedaten synchronisieren
                    </button>
                  )}
                </div>
              ))}
            {data.integration.tiktok && artistId ? (
              <a
                className="button"
                href={"/api/tiktok/connect?artist_id=" + artistId}
              >
                TikTok über OAuth verbinden
              </a>
            ) : (
              <p className="muted">
                OAuth nicht eingerichtet: Developer-App, Client Key/Secret,
                Redirect-URI und genehmigte Scopes fehlen. Kommentare und
                Watchtime sind dadurch nicht automatisch verfügbar.
              </p>
            )}
          </div>
        </>
      )}
      {tab === "settings" && (
        <div className="settings-grid">
          <div className="panel">
            <h3>Studio & Produktionsgrenzen</h3>
            <Form
              onSubmit={async (v) => {
                await act("save_settings", {
                  studio_name: v.studio_name,
                  timezone: v.timezone,
                  provider: v.provider,
                  mode: v.mode,
                  daily_ai_limit: Number(v.daily_ai_limit),
                  monthly_ai_limit: Number(v.monthly_ai_limit),
                  daily_render_limit: Number(v.daily_render_limit),
                  storage_limit_mb: Number(v.storage_limit_mb),
                  retention_days: Number(v.retention_days),
                  setup_step: 9,
                });
              }}
            >
              <Input
                name="studio_name"
                label="Studioname"
                defaultValue={s.studio_name}
                required
              />
              <Input
                name="timezone"
                label="Standardzeitzone"
                defaultValue={s.timezone}
              />
              <Select
                name="provider"
                label="Text-KI (kein automatischer Fallback)"
                defaultValue={s.provider}
              >
                <option value="codex">Codex CLI</option>
                <option value="gemini">Gemini CLI</option>
              </Select>
              <Select name="mode" label="Betriebsart" defaultValue={s.mode}>
                <option value="assisted">
                  Assistiert – nächste Schritte selbst starten
                </option>
                <option value="production">
                  Produktionsautomatik – interne Jobs innerhalb Grenzen
                </option>
                <option value="publication">
                  Veröffentlichungsfähiger Betrieb – alle Prüfungen gelten
                </option>
              </Select>
              <div className="form-grid">
                <Input
                  name="daily_ai_limit"
                  label="KI-Aufträge pro Tag"
                  type="number"
                  min="0"
                  defaultValue={s.daily_ai_limit}
                />
                <Input
                  name="monthly_ai_limit"
                  label="KI-Aufträge pro Monat"
                  type="number"
                  min="0"
                  defaultValue={s.monthly_ai_limit}
                />
                <Input
                  name="daily_render_limit"
                  label="Renderings pro Tag"
                  type="number"
                  min="0"
                  defaultValue={s.daily_render_limit}
                />
                <Input
                  name="storage_limit_mb"
                  label="Speicherlimit (MB)"
                  type="number"
                  min="100"
                  defaultValue={s.storage_limit_mb}
                />
              </div>
              <Input
                name="retention_days"
                label="Kommentar-Aufbewahrung (Tage)"
                type="number"
                min="1"
                defaultValue={s.retention_days}
              />
              <p className="muted">
                Suno-Creditgrenzen werden separat unter Provider & Konten
                verwaltet. Unbekannte CLI-Kosten werden nicht als kostenlos
                ausgewiesen.
              </p>
              <Submit>Einstellungen speichern</Submit>
            </Form>
          </div>
          <div className="panel">
            <h3>
              <HardDrive size={18} /> Ressourcen
            </h3>
            <strong className="storage-total">
              {(data.storage_bytes / 1024 / 1024).toFixed(1)} MB
            </strong>
            <progress
              value={data.storage_bytes / 1024 / 1024}
              max={s.storage_limit_mb}
            />
            <p>von {s.storage_limit_mb} MB im Medienverzeichnis</p>
            <h4>Reservierungen & Verbrauch heute</h4>
            {data.budget.map((b: Row, i: number) => (
              <div className="provider-row" key={i}>
                <span>
                  {b.kind} · {b.state}
                </span>
                <strong>{b.count}</strong>
              </div>
            ))}
            <p className="muted">
              Ein CLI-Auftrag wird vor dem Start atomar reserviert.
              Fehlgeschlagene Aufrufe können trotzdem Anbieter-Kontingent
              verbrauchen.
            </p>
          </div>
        </div>
      )}
      {tab === "data" && (
        <>
          <div className="grid-two">
            <div className="panel">
              <h3>Daten exportieren & Aufbewahrung</h3>
              <p>
                Künstlerdaten exportieren und alte importierte Kommentare
                kontrolliert entfernen.
              </p>
              {artistId && (
                <a className="button" href={"/api/exports/artist/" + artistId}>
                  <Download size={15} />
                  Aktive Künstlerdaten
                </a>
              )}
              <button onClick={() => act("prune_comments", {})}>
                Kommentare außerhalb Aufbewahrungszeit löschen
              </button>
              <button
                className="danger"
                disabled={!artistId}
                onClick={() => setDeleting(true)}
              >
                Aktiven Künstler endgültig löschen
              </button>
              <p className="muted">
                Einzelne Kommentare können in der Inbox gelöscht werden.
                Künstler lassen sich in ihrer Character Bible archivieren.
              </p>
            </div>
            <div className="panel">
              <h3>Betrieb & Sicherung</h3>
              <p>
                Backups umfassen Datenbank und privaten Medienspeicher.
                CLI-Authentifizierung und Verschlüsselungsschlüssel werden
                separat verwahrt.
              </p>
              <p>
                Start, Diagnose, Backup und Restore sind in{" "}
                <code>docs/OPERATIONS.md</code> beschrieben.
              </p>
              <code>
                npm run diagnose
                <br />
                npm run backup
              </code>
            </div>
          </div>
          <div className="panel table-wrap">
            <h3>Letzte Audit-Ereignisse</h3>
            <table>
              <thead>
                <tr>
                  <th>Zeitpunkt</th>
                  <th>Aktion</th>
                  <th>Objekt</th>
                </tr>
              </thead>
              <tbody>
                {data.audit.map((a: Row) => (
                  <tr key={a.id}>
                    <td>{formatDate(a.created_at)}</td>
                    <td>{a.action}</td>
                    <td>{a.object_id?.slice(0, 8) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {detail && (
        <Modal
          title={kindNames[detail.kind] ?? detail.kind}
          description={"Auftrag " + detail.id}
          onClose={() => setDetail(null)}
          wide
        >
          <Badge status={detail.state} />
          {detail.error && <p className="error">{detail.error}</p>}
          <h3>Versuchshistorie</h3>
          {data.job_attempts
            .filter((a: Row) => a.job_id === detail.id)
            .map((a: Row) => (
              <div className="provider-row" key={a.id}>
                <span>Versuch {a.attempt}</span>
                <Badge status={a.state} />
                <small>{formatDate(a.started_at)}</small>
                {a.error && <p>{a.error}</p>}
              </div>
            ))}
          {detail.output && (
            <>
              <h3>Gespeichertes Ergebnis</h3>
              <pre className="json-result">
                {JSON.stringify(detail.output, null, 2)}
              </pre>
            </>
          )}
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Künstler endgültig löschen"
          description="Alle zugehörigen Produktionen, lokalen Medien und Daten werden entfernt. Externe Beiträge werden dadurch nicht gelöscht. Exportiere benötigte Daten vorher."
          onClose={() => setDeleting(false)}
        >
          <Form
            onSubmit={async (v) => {
              if (
                await act("delete_artist", {
                  id: artistId,
                  confirmation: v.confirmation,
                })
              )
                setDeleting(false);
            }}
          >
            <Input
              label={
                "Zur Bestätigung eingeben: " +
                data.artists.find((a: Row) => a.id === artistId)?.name
              }
              name="confirmation"
              required
            />
            <button className="danger" type="submit">
              Endgültig lokal löschen
            </button>
          </Form>
        </Modal>
      )}
      {account && (
        <Modal
          title="Manuelles TikTok-Konto"
          description="Die tatsächliche Kontoanlage erfolgt bei TikTok. Dieser lokale Eintrag ordnet Exporte und Nachweise zu."
          onClose={() => setAccount(false)}
        >
          <Form
            onSubmit={async (v) => {
              if (
                await act("create_account", {
                  artist_id: artistId,
                  label: v.label,
                })
              )
                setAccount(false);
            }}
          >
            <Input label="Profilname oder @Handle" name="label" required />
            <Submit>Konto hinterlegen</Submit>
          </Form>
        </Modal>
      )}
    </>
  );
}
