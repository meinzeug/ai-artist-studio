"use client";
import { useRef, useState } from "react";
import { BookOpen, Clapperboard, Plug, Sparkles } from "lucide-react";
import {
  useStudio,
  Modal,
  Form,
  Input,
  Textarea,
  Select,
  Badge,
  Preview,
  formatDate,
  type Row,
} from "./ui";
import { veoModels, videoCost } from "@/lib/video-generation";

function useVeoAction() {
  const { reload, toast } = useStudio();
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const locked = useRef(false);
  async function run(action: string, data: Row = {}, key?: string) {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
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
        action === "veo_generate"
          ? "KI-Szene eingereiht. Das Ergebnis erscheint hier und in deiner Medienbibliothek."
          : "Veo-Einstellungen aktualisiert.",
      );
      return v;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return { run, pending, error };
}
export function VeoConnectionCard() {
  const { data } = useStudio(),
    connection = data.video_connection;
  const [edit, setEdit] = useState(false),
    [help, setHelp] = useState(false);
  const { run, pending, error } = useVeoAction();
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <small>OPTIONALE KI-VIDEOSZENEN</small>
            <h3>Google Veo verbinden</h3>
          </div>
          <Badge
            label={
              connection
                ? "Modellzugriff geprüft"
                : "Optional · nicht verbunden"
            }
          />
        </div>
        <p>
          Ein Künstlerbild in eine kurze bewegte Szene verwandeln. Danach mit
          deinem Suno-Song im Video-Studio kombinieren.
        </p>
        <p className="muted">
          Bilder + Musik lassen sich jederzeit lokal mit FFmpeg rendern. Veo
          benötigt einen separaten Google-AI-Studio-API-Key und ein bezahltes
          API-Projekt. Der Gemini-CLI-Login deckt diese Kosten nicht ab.
        </p>
        {connection && (
          <p>
            {connection.model}
            <br />
            {Number(connection.rate_usd_second).toFixed(4)} USD/s · Tageslimit{" "}
            {Number(connection.daily_limit_usd).toFixed(2)} USD · Monatslimit{" "}
            {Number(connection.monthly_limit_usd).toFixed(2)} USD
            <br />
            <small>
              {connection.live_tested_at
                ? "Letzter Ergebnisimport: " +
                  formatDate(connection.live_tested_at)
                : "Noch keine erfolgreiche Livegeneration nachgewiesen."}
            </small>
          </p>
        )}
        <div className="actions">
          <button className="primary" onClick={() => setEdit(true)}>
            <Plug size={16} />
            {connection ? "Veo-Verbindung bearbeiten" : "Veo verbinden"}
          </button>
          <button onClick={() => setHelp(true)}>
            <BookOpen size={16} />
            Veo-Anleitung
          </button>
          {connection && (
            <button disabled={pending} onClick={() => run("veo_disconnect")}>
              Veo trennen
            </button>
          )}
        </div>
        {error && !edit && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
      {help && (
        <Modal
          title="Optionale KI-Szenen mit Veo"
          description="Die normale Musikvideo-Produktion benötigt diese Verbindung nicht."
          onClose={() => setHelp(false)}
        >
          <ol className="setup-steps">
            <li>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
              >
                Google AI Studio öffnen
              </a>
              , eigenes Projekt wählen und einen API-Key erstellen. Für Veo
              müssen Abrechnung und Modellzugang verfügbar sein.
            </li>
            <li>
              Unter „Veo verbinden“ den Key und das Modell eintragen. Der
              Verbindungstest liest nur Modelldaten; er produziert kein Video
              und bestätigt keine Generierungsquote.
            </li>
            <li>
              Den aktuellen{" "}
              <a
                href="https://ai.google.dev/gemini-api/docs/pricing"
                target="_blank"
                rel="noreferrer"
              >
                Preis für das gewählte Modell bei 720p
              </a>{" "}
              prüfen. Einen konservativen Kostenansatz in USD pro Sekunde sowie
              Tages- und Monatsgrenzen eintragen. Preise werden nicht
              automatisch als null angenommen.
            </li>
            <li>
              Im Video-Studio „Optionale KI-Szenen“ öffnen, ein eigenes
              freigegebenes Künstlerbild und einen Szenenprompt wählen. Pro
              Auftrag Kosten und Bildübermittlung an Google bestätigen.
            </li>
            <li>
              Die fertige Szene erscheint in der Medienbibliothek. Über „Im
              Musikvideo verwenden“ mit der Suno-Aufnahme kombinieren. Der
              Szenenton wird beim lokalen Rendering ersetzt.
            </li>
          </ol>
          <p className="muted">
            Veo 3.1 ist hier als Preview angebunden. Startbilder werden mittig
            auf 9:16 zugeschnitten; bitte den Bildausschnitt vorher prüfen.
            Personen müssen erwachsen sein. Anbieterkennzeichnungen bleiben
            erhalten. Keine garantierte Gesichtskonsistenz oder
            Lippensynchronität.
          </p>
          <p>
            Das Studio reserviert den eingetragenen Kostenansatz. Die
            tatsächliche Google-Rechnung kann davon abweichen; zusätzlich das
            Cloud-Abrechnungsbudget kontrollieren. Unklare Aufträge werden nicht
            erneut kostenpflichtig erzeugt.
          </p>
          <a
            href="https://ai.google.dev/gemini-api/docs/veo?hl=en"
            target="_blank"
            rel="noreferrer"
          >
            Offizielle Veo-Dokumentation
          </a>
        </Modal>
      )}
      {edit && (
        <Modal
          title="Veo-Verbindung einrichten"
          description="Separater optionaler Videodienst. Der API-Key wird verschlüsselt gespeichert."
          onClose={() => !pending && setEdit(false)}
        >
          <Form
            onSubmit={async (v) => {
              if (
                await run("veo_connect", {
                  api_key: v.api_key || undefined,
                  version: connection?.version ?? 0,
                  model: v.model,
                  rate_usd_second: Number(v.rate),
                  daily_limit_usd: Number(v.daily),
                  monthly_limit_usd: Number(v.monthly),
                })
              )
                setEdit(false);
            }}
          >
            <Input
              label="Veo API-Key"
              name="api_key"
              type="password"
              autoComplete="off"
              required={!connection}
              placeholder={
                connection
                  ? "Leer lassen, um gespeicherten Key zu behalten"
                  : "API-Key aus Google AI Studio"
              }
            />
            <Select
              label="Veo-Modell (Preview)"
              name="model"
              defaultValue={connection?.model ?? veoModels[0]}
            >
              {veoModels.map((m) => (
                <option key={m} value={m}>
                  {m.includes("fast") ? "Veo 3.1 Fast" : "Veo 3.1"} · Preview
                </option>
              ))}
            </Select>
            <Input
              label="Bestätigter Kostenansatz (USD pro Sekunde, 720p)"
              name="rate"
              type="number"
              min="0.0001"
              max="100"
              step="0.0001"
              required
              defaultValue={connection?.rate_usd_second ?? ""}
            />
            <div className="form-grid">
              <Input
                label="Veo-Tageslimit (USD)"
                name="daily"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={connection?.daily_limit_usd ?? 0}
              />
              <Input
                label="Veo-Monatslimit (USD)"
                name="monthly"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={connection?.monthly_limit_usd ?? 0}
              />
            </div>
            <p className="muted">
              0 USD sperrt neue Generierungen. Tarif bei Google prüfen; alle
              Angaben sind Kostenansätze, keine bestätigte Rechnung.
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" disabled={pending}>
              {pending
                ? "Modellzugriff wird geprüft …"
                : "Veo speichern & prüfen"}
            </button>
          </Form>
        </Modal>
      )}
    </>
  );
}
export function VideoScenes({ onUse }: { onUse: (assetId: string) => void }) {
  const { data, artistId, nav } = useStudio();
  const [open, setOpen] = useState(false),
    [creating, setCreating] = useState(false),
    [reconcile, setReconcile] = useState<Row | null>(null);
  const { run, pending, error } = useVeoAction();
  const orders = (data.video_generations ?? []).filter(
    (v: Row) => v.artist_id === artistId,
  );
  return (
    <section className="panel optional-video">
      <div className="panel-heading">
        <div>
          <small>OPTIONALER ZUSATZ</small>
          <h2>KI-Szenen für deinen Musikclip</h2>
        </div>
        <button aria-expanded={open} onClick={() => setOpen(!open)}>
          <Sparkles size={16} />
          Optionale KI-Szenen {open ? "schließen" : "öffnen"}
        </button>
      </div>
      <p>
        Aus einem Künstlerbild kurze Videoszenen erzeugen und mit deinem Song
        kombinieren. Separater Anbieter und Kostenfreigabe erforderlich.
      </p>
      {open && (
        <>
          {data.video_connection ? (
            <button className="primary" onClick={() => setCreating(true)}>
              <Clapperboard size={16} />
              KI-Szene vorbereiten
            </button>
          ) : (
            <div className="notice">
              <p>
                Veo ist noch nicht verbunden. Deine drei lokalen Videovorlagen
                sind sofort mit importierten Bildern und Audio nutzbar.
              </p>
              <button onClick={() => nav("settings")}>
                Video-Provider einrichten
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="grid-two">
            {orders.map((o: Row) => {
              const asset = data.assets.find((a: Row) => a.id === o.asset_id);
              return (
                <article className="panel" key={o.id}>
                  <div className="panel-heading">
                    <h3>{o.name}</h3>
                    <Badge status={o.state} />
                  </div>
                  {asset && <Preview asset={asset} />}
                  <p>
                    {o.duration} Sekunden · 9:16 · Kostenansatz{" "}
                    {Number(o.estimated_cost_usd).toFixed(4)} USD
                  </p>
                  <small>
                    {o.model} · {formatDate(o.created_at)}
                  </small>
                  <details>
                    <summary>Gespeicherter Szenenauftrag</summary>
                    <p>{o.prompt}</p>
                    {o.negative_prompt && (
                      <p>Ausschlüsse: {o.negative_prompt}</p>
                    )}
                    <small>
                      Auftrag: {o.id}
                      <br />
                      Google: {o.operation_name ?? "Noch keine externe Kennung"}
                    </small>
                  </details>
                  {o.error && <p className="error">{o.error}</p>}
                  <div className="actions">
                    {asset && (
                      <button
                        className="primary"
                        onClick={() => onUse(asset.id)}
                      >
                        Im Musikvideo verwenden
                      </button>
                    )}
                    {o.operation_name &&
                      !["succeeded", "failed"].includes(o.state) && (
                        <button
                          disabled={pending}
                          onClick={() => run("veo_sync", { id: o.id })}
                        >
                          Vorhandenen Auftrag abfragen
                        </button>
                      )}
                    {o.state === "unknown_external_state" &&
                      !o.operation_name && (
                        <button onClick={() => setReconcile(o)}>
                          Externe Kennung zuordnen
                        </button>
                      )}
                  </div>
                  {o.submitted_at &&
                    !["succeeded", "failed"].includes(o.state) && (
                      <small>
                        Der bereits an Google gesendete Auftrag lässt sich hier
                        nicht zurücknehmen.
                      </small>
                    )}
                </article>
              );
            })}
          </div>
        </>
      )}
      {creating && <VideoSceneForm onClose={() => setCreating(false)} />}
      {reconcile && (
        <Modal
          title="Vorhandenen Google-Auftrag zuordnen"
          description="Nur die von Google bestätigte Auftragskennung dieses Szenenauftrags eintragen. Es wird keine neue Generation gestartet."
          onClose={() => setReconcile(null)}
        >
          <Form
            onSubmit={async (v) => {
              if (
                await run("veo_reconcile", {
                  id: reconcile.id,
                  operation_name: v.operation_name,
                })
              )
                setReconcile(null);
            }}
          >
            <Input
              label="Google operation.name"
              name="operation_name"
              required
              placeholder={"models/" + reconcile.model + "/operations/…"}
            />
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button disabled={pending}>Zuordnen & Status prüfen</button>
          </Form>
        </Modal>
      )}
    </section>
  );
}
function VideoSceneForm({ onClose }: { onClose: () => void }) {
  const { data, artistId } = useStudio();
  const [connection] = useState(() => data.video_connection);
  const images = data.assets.filter(
    (a: Row) =>
      a.artist_id === artistId &&
      a.kind === "image" &&
      a.rights_status !== "disputed",
  );
  const [imageId, setImageId] = useState(images[0]?.id ?? ""),
    [duration, setDuration] = useState(8);
  const [approved, setApproved] = useState(false),
    [rights, setRights] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const { run, pending, error } = useVeoAction();
  const cost = videoCost(duration, Number(connection.rate_usd_second));
  return (
    <Modal
      title="KI-Szene vorbereiten"
      description="Ein Bild wird an Google Veo übermittelt. Danach entsteht eine zusätzliche Videoszene für deine Timeline."
      onClose={() => !pending && onClose()}
      wide
    >
      {!images.length ? (
        <p>Importiere zuerst ein Künstlerbild in der Medienbibliothek.</p>
      ) : (
        <Form
          onSubmit={async (v) => {
            if (
              await run(
                "veo_generate",
                {
                  artist_id: artistId,
                  song_id: v.song_id || null,
                  name: v.name,
                  prompt: v.prompt,
                  negative_prompt: v.negative_prompt,
                  reference_asset_id: imageId,
                  duration,
                  connection_version: connection.version,
                  approved,
                  rights_confirmed: rights,
                  approved_cost_usd: cost,
                },
                key,
              )
            )
              onClose();
          }}
        >
          <div className="grid-two">
            <div>
              <Input
                label="Name der KI-Szene"
                name="name"
                required
                maxLength={120}
                placeholder="Nächtlicher Refrain · Kamerafahrt"
              />
              <Select
                label="Startbild"
                value={imageId}
                onChange={(e) => {
                  setImageId(e.target.value);
                  setApproved(false);
                  setRights(false);
                }}
              >
                {images.map((a: Row) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
              <Select label="Songzuordnung (optional)" name="song_id">
                <option value="">Noch keinem Song zuordnen</option>
                {data.songs
                  .filter((s: Row) => s.artist_id === artistId)
                  .map((s: Row) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
              </Select>
              <Textarea
                label="Szenenbeschreibung"
                name="prompt"
                required
                minLength={5}
                maxLength={3000}
                placeholder="Beschreibe Handlung, Kamera und Licht. Englische Prompts werden vom Anbieter am besten unterstützt."
                onChange={() => setApproved(false)}
              />
              <Textarea
                label="Unerwünschte Elemente"
                name="negative_prompt"
                maxLength={1000}
                onChange={() => setApproved(false)}
              />
              <Select
                label="Szenenlänge"
                value={duration}
                onChange={(e) => {
                  setDuration(Number(e.target.value));
                  setApproved(false);
                }}
              >
                {[4, 6, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} Sekunden
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <img
                className="veo-reference"
                src={"/api/assets/" + imageId}
                alt="Startbild mit mittigem 9:16-Zuschnitt"
              />
              <p className="muted">
                Startbild: mittiger 9:16-Zuschnitt. Veo-Ausgabe: 720p. Dein
                fertiges Musikvideo wird lokal in 1080 × 1920 mit der
                Suno-Tonspur gerendert.
              </p>
            </div>
          </div>
          <div className="notice">
            <strong>
              1 Szene · {duration} Sekunden · {cost.toFixed(4)} USD Kostenansatz
            </strong>
            <p>
              {connection.model}. Keine automatische Wiederholung einer unklaren
              Übermittlung.
            </p>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={rights}
              onChange={(e) => setRights(e.target.checked)}
              required
            />
            Ich darf dieses Bild an Google übermitteln und für die Szene
            verwenden. Abgebildete Personen sind erwachsen.
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
              required
            />
            Diesen Szenenauftrag mit {cost.toFixed(4)} USD Kostenansatz
            freigeben. Die tatsächliche Abrechnung erfolgt durch Google.
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button
            className="primary"
            disabled={pending || !approved || !rights}
          >
            {pending
              ? "Auftrag wird gespeichert …"
              : "Kostenpflichtige KI-Szene starten"}
          </button>
        </Form>
      )}
    </Modal>
  );
}
