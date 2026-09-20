"use client";
import { useRef, useState } from "react";
import {
  BookOpen,
  ImagePlus,
  Settings2,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import {
  useStudio,
  Modal,
  Form,
  Input,
  Textarea,
  Select,
  Badge,
  formatDate,
  type Row,
} from "./ui";
import { CliConnect } from "./cli-connect";
import { imageModels, imageProviders } from "@/lib/image-generation";

function useImageAction() {
  const { reload, toast } = useStudio();
  const locked = useRef(false);
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function run(action: string, data: Row, key?: string) {
    if (locked.current) return null;
    locked.current = true;
    setPending(true);
    setError("");
    try {
      const r = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data, key }),
      });
      const value = await r.json();
      if (!r.ok) throw new Error(value.error);
      await reload();
      toast(
        action === "image_generate"
          ? "Bildauftrag eingereiht. Das Ergebnis erscheint in deiner Medienbibliothek."
          : "Bildeinstellungen aktualisiert.",
      );
      return value;
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
const providerName = (provider?: string) =>
  imageProviders[provider as keyof typeof imageProviders] ??
  "Noch nicht ausgewählt";
export function ImageConnectionCard() {
  const { data, nav } = useStudio();
  const connection = data.image_connection;
  const [edit, setEdit] = useState(false),
    [help, setHelp] = useState(false);
  return (
    <section
      className="panel image-provider-panel"
      aria-label="Bildgenerierung einstellen"
    >
      <div className="panel-heading">
        <div>
          <small>DEINE BILD-KI</small>
          <h3>Bilder & Charakterdesign</h3>
        </div>
        <span className="provider-symbol">
          <ImagePlus size={25} />
        </span>
      </div>
      <p>
        Wähle, womit Künstlerporträts, Cover und Bilder für deine Musikvideos
        entstehen.
      </p>
      <div className="image-provider-summary">
        <div>
          <strong>{providerName(connection?.provider)}</strong>
          <small>
            {connection?.model ??
              "Eigene Bilder in der Medienbibliothek importieren"}
          </small>
        </div>
        <Badge
          label={
            !connection || connection.provider === "manual"
              ? "Manueller Import"
              : connection.live_tested_at
                ? "Bild erfolgreich erzeugt"
                : "Verbindung geprüft"
          }
        />
      </div>
      {connection && connection.provider !== "manual" && (
        <p className="muted">
          Maximal {connection.daily_limit} Bildaufträge pro Tag ·{" "}
          {connection.monthly_limit} pro Monat.
          <br />
          {connection.provider === "codex"
            ? "Nutzt dein ChatGPT-Konto auf dem Studio-Runner. Kein API-Key erforderlich; verbraucht Codex-Kontingent."
            : `Separater Google-API-Zugang · Kostenansatz ${Number(connection.estimated_cost_usd).toFixed(4)} USD/Auftrag.`}
          <br />
          <small>
            {connection.live_tested_at
              ? "Letzte erfolgreiche Bildübernahme: " +
                formatDate(connection.live_tested_at)
              : "Noch kein Bild mit dieser gespeicherten Verbindung erzeugt."}
          </small>
        </p>
      )}
      <div className="actions">
        <button className="primary" onClick={() => setEdit(true)}>
          <Settings2 size={16} />
          Bild-KI auswählen
        </button>
        <button onClick={() => setHelp(true)}>
          <BookOpen size={16} />
          Bild-KI-Anleitung
        </button>
        <button onClick={() => nav("library")}>
          <ArrowRight size={16} />
          Zur Bilderstellung
        </button>
      </div>
      {edit && <ImageConnectionDialog onClose={() => setEdit(false)} />}
      {help && <ImageHelp onClose={() => setHelp(false)} />}
    </section>
  );
}
function ImageHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Deine Bild-KI einrichten"
      description="Text-KI und Bild-KI lassen sich unabhängig voneinander wählen."
      onClose={onClose}
    >
      <h3>Codex mit deinem ChatGPT-Konto</h3>
      <ol className="setup-steps">
        <li>
          Unter „Bild-KI auswählen“ <strong>Codex · ChatGPT-Konto</strong>{" "}
          wählen.
        </li>
        <li>
          Über „ChatGPT verbinden“ die offizielle Anmeldung öffnen. Auf dem
          Server wird das Konto des Studio-Runners verwendet, nicht automatisch
          das deines PCs.
        </li>
        <li>
          Tages- und Monatsgrenzen festlegen, „Auswahl speichern & prüfen“
          wählen. Dabei werden Installation und Anmeldung geprüft, noch kein
          Bild erzeugt.
        </li>
        <li>
          Unter „Charakter & Medien“ auf „Bild generieren“ klicken, Motiv und
          Format wählen und die Kontingentnutzung bestätigen. Ein erfolgreiches
          Bild ist der tatsächliche Bild-Verbindungstest.
        </li>
      </ol>
      <p>
        Native Codex-Bilder nutzen laut{" "}
        <a
          href="https://learn.chatgpt.com/docs/image-generation"
          target="_blank"
          rel="noreferrer"
        >
          OpenAI-Dokumentation
        </a>{" "}
        gpt-image-2 und das allgemeine Codex-Kontingent. Die Nutzungsgrenzen
        werden bei Bildern schneller erreicht; eine Anmeldung garantiert keine
        freie Quote. Kein stiller API-Fallback.
      </p>
      <h3>Gemini über die Bild-API</h3>
      <ol className="setup-steps">
        <li>
          In{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
          >
            Google AI Studio
          </a>{" "}
          einen eigenen API-Key für ein passendes Projekt erstellen.
          Modellzugang, Region und Abrechnung prüfen.
        </li>
        <li>
          „Gemini · Bild-API“ wählen, Key und Modell eingeben. Das Studio
          speichert den Key verschlüsselt. Der Verbindungstest liest
          ausschließlich Modellinformationen.
        </li>
        <li>
          Den{" "}
          <a
            href="https://ai.google.dev/gemini-api/docs/pricing"
            target="_blank"
            rel="noreferrer"
          >
            aktuellen API-Tarif
          </a>{" "}
          prüfen und einen konservativen USD-Kostenansatz pro Auftrag inklusive
          Eingaben und Bildausgabe eintragen. Zusätzlich API-Abrechnung beim
          Anbieter begrenzen.
        </li>
      </ol>
      <p>
        Der Google-Login der Gemini CLI ist für Textaufträge eingerichtet und
        ersetzt keinen Bild-API-Key. Der eingetragene Kostenansatz ist eine
        lokale Reservierung, keine Garantie für den Rechnungsbetrag. Ausgabe
        hier: 1K bzw. Standardauflösung bei Gemini 2.5.
      </p>
      <h3>Vom Bild zum Musikvideo</h3>
      <p>
        Bilder werden privat beim ausgewählten Künstler gespeichert. Du kannst
        sie vergleichen, als Referenz vorschlagen, Rechte dokumentieren und mit
        deiner Suno-Aufnahme im Video-Studio verwenden. Referenzen helfen bei
        der Wiedererkennbarkeit, garantieren aber kein identisches Gesicht.
        Codex erhält den Formatwunsch als Bildanweisung; den endgültigen
        9:16-Ausschnitt bestimmst du im Video-Studio.
      </p>
      <p className="muted">
        Bei unklaren Antworten wird nicht automatisch erneut erzeugt. Im
        Bildauftrag Kontingent/Abrechnung prüfen und gegebenenfalls ein manuell
        importiertes Ergebnis zuordnen. Manueller Import bleibt jederzeit
        verfügbar.
      </p>
      <a
        href="https://ai.google.dev/gemini-api/docs/generate-content/image-generation"
        target="_blank"
        rel="noreferrer"
      >
        Offizielle Gemini-Bilddokumentation
      </a>
    </Modal>
  );
}
export function ImageConnectionDialog({ onClose }: { onClose: () => void }) {
  const { data } = useStudio();
  const [original] = useState<Row | null>(data.image_connection ?? null);
  const [provider, setProvider] = useState(original?.provider ?? "codex"),
    [help, setHelp] = useState(false),
    [loginStatus, setLoginStatus] = useState<string>("");
  const { run, pending, error } = useImageAction();
  async function detect() {
    try {
      const r = await fetch("/api/providers");
      const d = await r.json();
      const p = d.providers?.find((p: Row) => p.provider === "codex");
      setLoginStatus(
        p?.authenticated
          ? "ChatGPT-Konto auf dem Runner angemeldet."
          : d.error || "ChatGPT-Konto noch nicht angemeldet.",
      );
    } catch {
      setLoginStatus("Runner nicht erreichbar.");
    }
  }
  return (
    <Modal
      title="Bild-KI auswählen"
      description="Diese Auswahl gilt für neue Bildaufträge. Deine Text-KI bleibt separat einstellbar."
      onClose={() => !pending && onClose()}
    >
      <Form
        onSubmit={async (v) => {
          if (
            await run("image_configure", {
              provider,
              version: original?.version ?? 0,
              api_key: v.api_key || undefined,
              model: provider === "gemini_api" ? v.model : undefined,
              estimated_cost_usd:
                provider === "gemini_api" ? Number(v.rate) : undefined,
              daily_limit: Number(v.daily ?? 10),
              monthly_limit: Number(v.monthly ?? 100),
              daily_limit_usd: Number(v.daily_usd ?? 0),
              monthly_limit_usd: Number(v.monthly_usd ?? 0),
            })
          )
            onClose();
        }}
      >
        <Select
          name="provider"
          label="Anbieter für KI-Bilder"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          {Object.entries(imageProviders).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
        {provider === "codex" && (
          <div className="info-bar">
            <div>
              <strong>Dein ChatGPT-Konto verwenden</strong>
              <p>
                Native Bilder mit gpt-image-2. Kein API-Key nötig; nutzt das
                Kontingent deines angemeldeten Codex-Kontos.
              </p>
              <div className="actions">
                <CliConnect provider="codex" onChange={detect} />
                <button type="button" onClick={detect}>
                  Anmeldung prüfen
                </button>
              </div>
              {loginStatus && <p role="status">{loginStatus}</p>}
            </div>
          </div>
        )}
        {provider === "gemini_api" && (
          <>
            <div className="info-bar">
              Separater Bild-API-Zugang. Der Google-Login der Text-CLI genügt
              hierfür nicht. API-Nutzung kann kostenpflichtig sein.
            </div>
            <Input
              name="api_key"
              label="Gemini Bild-API-Key"
              type="password"
              autoComplete="off"
              required={original?.provider !== "gemini_api"}
              placeholder={
                original?.provider === "gemini_api"
                  ? "Leer lassen, um gespeicherten Key zu behalten"
                  : "API-Key aus Google AI Studio"
              }
            />
            <Select
              name="model"
              label="Bildmodell"
              defaultValue={
                original?.provider === "gemini_api"
                  ? original.model
                  : imageModels[0]
              }
            >
              {imageModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Input
              name="rate"
              label="Kostenansatz pro Bildauftrag (USD)"
              type="number"
              min="0.0001"
              max="100"
              step="0.0001"
              required
              defaultValue={original?.estimated_cost_usd ?? ""}
            />
            <div className="grid-two">
              <Input
                name="daily_usd"
                label="Tagesbudget (USD)"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={original?.daily_limit_usd ?? 0}
              />
              <Input
                name="monthly_usd"
                label="Monatsbudget (USD)"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={original?.monthly_limit_usd ?? 0}
              />
            </div>
            <p className="muted">
              0 USD sperrt neue API-Bildaufträge. Preise und Eingabekosten
              selbst prüfen; die Anbieterrechnung kann vom Kostenansatz
              abweichen.
            </p>
          </>
        )}
        {provider !== "manual" ? (
          <div className="grid-two">
            <Input
              name="daily"
              label="Bildaufträge pro Tag"
              type="number"
              min="0"
              max="1000"
              step="1"
              required
              defaultValue={original?.daily_limit ?? 10}
            />
            <Input
              name="monthly"
              label="Bildaufträge pro Monat"
              type="number"
              min="0"
              max="10000"
              step="1"
              required
              defaultValue={original?.monthly_limit ?? 100}
            />
          </div>
        ) : (
          <p>
            Keine automatische Bilderzeugung. Importiere deine Bilder über
            „Datei importieren“. Ein bisher gespeicherter Bild-API-Key wird beim
            Speichern entfernt.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button className="primary" disabled={pending}>
            {pending ? "Wird geprüft …" : "Auswahl speichern & prüfen"}
          </button>
          <button type="button" onClick={() => setHelp(true)}>
            <BookOpen size={16} />
            Einrichtungsanleitung
          </button>
        </div>
      </Form>
      {help && <ImageHelp onClose={() => setHelp(false)} />}
    </Modal>
  );
}
export function ImageGenerationPanel({
  onSelect,
}: {
  onSelect: (asset: Row) => void;
}) {
  const { data, artistId, act, nav } = useStudio();
  const connection = data.image_connection;
  const [generate, setGenerate] = useState(false),
    [configure, setConfigure] = useState(false),
    [resolve, setResolve] = useState<Row | null>(null);
  const ready =
    connection &&
    connection.provider !== "manual" &&
    connection.state === "connected";
  const orders = (data.image_generations ?? []).filter(
    (r: Row) => r.artist_id === artistId,
  );
  return (
    <section
      className="panel image-generation-panel"
      aria-label="Bilder generieren"
    >
      <div className="panel-heading">
        <div>
          <small>PORTRÄT · COVER · VIDEOSZENE</small>
          <h3>Neue Bilder für deinen Künstler</h3>
          <p>
            {providerName(connection?.provider)}
            {connection?.model
              ? " · " + connection.model
              : " · Bild-KI auswählen oder eigene Bilder importieren"}
          </p>
        </div>
        <div className="actions">
          <button onClick={() => setConfigure(true)}>
            <Settings2 size={16} />
            Bild-KI ändern
          </button>
          <button
            className="primary"
            disabled={!artistId || !ready || data.settings.emergency_stop}
            onClick={() => setGenerate(true)}
          >
            <Sparkles size={16} />
            Bild generieren
          </button>
        </div>
      </div>
      {!ready && (
        <p className="muted">
          Wähle zuerst eine Bild-KI. Codex kann dein vorhandenes ChatGPT-Konto
          verwenden.
        </p>
      )}
      {data.settings.emergency_stop && (
        <p className="error">
          Not-Aus ist aktiv. Neue Bildaufträge sind angehalten.
        </p>
      )}
      {!!orders.length && (
        <details open>
          <summary>Bildaufträge ({orders.length})</summary>
          <div className="image-order-list">
            {orders.slice(0, 20).map((o: Row) => {
              const asset = data.assets.find((a: Row) => a.id === o.asset_id);
              const job = data.jobs.find((j: Row) => j.id === o.job_id);
              return (
                <article className="image-order" key={o.id}>
                  {asset && (
                    <button
                      className="image-order-thumb"
                      aria-label={o.name + " öffnen"}
                      onClick={() => onSelect(asset)}
                    >
                      <img src={"/api/assets/" + asset.id} alt={o.name} />
                    </button>
                  )}
                  <div className="image-order-content">
                    <strong>{o.name}</strong>
                    <small>
                      {providerName(o.provider)} · {o.aspect_ratio} ·{" "}
                      {formatDate(o.created_at)}
                    </small>
                    <Badge
                      status={o.state === "submitting" ? "running" : o.state}
                    />
                    {o.error && o.state !== "succeeded" && (
                      <p className="error">{o.error}</p>
                    )}
                    {o.resolution_note && (
                      <p className="muted">
                        Manuell dokumentiert: {o.resolution_note}
                      </p>
                    )}
                  </div>
                  <div className="actions">
                    {asset && (
                      <>
                        <button onClick={() => onSelect(asset)}>
                          Bild & Rechte
                        </button>
                        <button onClick={() => nav("video")}>
                          Im Video-Studio nutzen
                        </button>
                      </>
                    )}
                    {["queued", "running"].includes(job?.state) && (
                      <button
                        onClick={() => act("cancel_job", { id: o.job_id })}
                      >
                        Abbrechen
                      </button>
                    )}
                    {o.state === "unknown_external_state" && (
                      <button onClick={() => setResolve(o)}>
                        Status klären
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </details>
      )}
      {generate && <GenerateImage onClose={() => setGenerate(false)} />}
      {configure && (
        <ImageConnectionDialog onClose={() => setConfigure(false)} />
      )}
      {resolve && (
        <ResolveImage order={resolve} onClose={() => setResolve(null)} />
      )}
    </section>
  );
}
function GenerateImage({ onClose }: { onClose: () => void }) {
  const { data, artistId } = useStudio();
  const [connection] = useState<Row>(data.image_connection),
    [key] = useState(() => crypto.randomUUID());
  const artist = data.artists.find((a: Row) => a.id === artistId);
  const reference = data.artist_references.find(
    (r: Row) =>
      r.artist_id === artistId &&
      r.type === "portrait" &&
      r.state === "approved",
  );
  const { run, pending, error } = useImageAction();
  const cost =
    connection.provider === "gemini_api"
      ? Number(connection.estimated_cost_usd)
      : null;
  return (
    <Modal
      title="Bild generieren"
      description="Ein neues Bild, gespeichert mit Künstleridentität, Prompt und Herkunft."
      onClose={() => !pending && onClose()}
    >
      <div className="info-bar">
        {providerName(connection.provider)} · {connection.model}
        <br />
        {cost === null
          ? "Verbraucht Codex-Kontingent deines ChatGPT-Kontos. Kein API-Key-Aufruf."
          : `Reservierung: ${cost.toFixed(4)} USD für diesen Auftrag. Tatsächliche Abrechnung beim Anbieter prüfen.`}
      </div>
      <Form
        onSubmit={async (v) => {
          if (
            await run(
              "image_generate",
              {
                artist_id: artistId,
                name: v.name,
                prompt: v.prompt,
                aspect_ratio: v.aspect_ratio,
                reference_asset_id: v.reference || null,
                song_id: v.song || null,
                connection_version: connection.version,
                approved_cost_usd: cost,
                approved: v.approved === "on",
                rights_confirmed: v.rights === "on",
              },
              key,
            )
          )
            onClose();
        }}
      >
        <Input
          name="name"
          label="Bildname"
          defaultValue={(artist?.name ?? "Künstler") + " – Porträt"}
          maxLength={160}
          required
        />
        <Textarea
          name="prompt"
          label="Was soll auf dem Bild zu sehen sein?"
          rows={5}
          maxLength={8000}
          required
          defaultValue={
            "Eigenständiges Künstlerporträt für einen virtuellen Musikcharakter. " +
            (artist?.identity?.visual ||
              "Klare Gesichtszüge, atmosphärisches Licht, ruhiger Hintergrund. Keine Schrift und keine Logos.")
          }
        />
        <Select
          name="aspect_ratio"
          label="Gewünschtes Bildformat"
          defaultValue="9:16"
        >
          <option value="9:16">9:16 · TikTok / vertikale Videoszene</option>
          <option value="1:1">1:1 · Cover / Profilbild</option>
          <option value="16:9">16:9 · Querformat</option>
        </Select>
        <Select
          name="reference"
          label="Bildreferenz (optional)"
          defaultValue={reference?.asset_id ?? ""}
        >
          <option value="">Ohne Referenz</option>
          {data.assets
            .filter(
              (a: Row) =>
                a.artist_id === artistId &&
                a.kind === "image" &&
                a.rights_status !== "disputed",
            )
            .map((a: Row) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </Select>
        <Select name="song" label="Song zuordnen (optional)">
          <option value="">Nur dem Künstler zuordnen</option>
          {data.songs
            .filter((s: Row) => s.artist_id === artistId)
            .map((s: Row) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
        </Select>
        <p className="muted">
          Visuelle Identität und Ausschlüsse werden als Version festgehalten.
          Referenzen unterstützen die Ähnlichkeit; die Gesichtskonsistenz und
          das tatsächliche Bildformat bitte nach der Erstellung prüfen. Rechte
          bleiben bis zur Prüfung ungeklärt.
        </p>
        <label className="checkbox">
          <input type="checkbox" name="rights" required />
          Ich darf den Prompt und die gewählte Referenz an diesen Anbieter
          übermitteln.
        </label>
        <label className="checkbox">
          <input type="checkbox" name="approved" required />
          {cost === null
            ? "Diesen Bildauftrag und die Nutzung meines Codex-Kontingents freigeben."
            : `Diesen Bildauftrag mit ${cost.toFixed(4)} USD Kostenansatz ausdrücklich freigeben.`}
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={pending}>
          {pending ? "Wird eingereiht …" : "Bildauftrag starten"}
        </button>
      </Form>
    </Modal>
  );
}
function ResolveImage({ order, onClose }: { order: Row; onClose: () => void }) {
  const { data } = useStudio(),
    { run, pending, error } = useImageAction();
  return (
    <Modal
      title="Unklaren Bildauftrag klären"
      description="Es wird keine neue Bildgenerierung ausgelöst."
      onClose={() => !pending && onClose()}
    >
      <p>
        Prüfe Kontingent bzw. Abrechnung beim Anbieter. Falls ein Ergebnis
        verfügbar ist, importiere es in die Medienbibliothek und ordne es hier
        zu. Die Budgetreservierung bleibt als Verbrauch erhalten.
      </p>
      <Form
        onSubmit={async (v) => {
          if (
            await run("image_resolve", {
              id: order.id,
              note: v.note,
              asset_id: v.asset || null,
              acknowledged: v.acknowledged === "on",
            })
          )
            onClose();
        }}
      >
        <Select name="asset" label="Manuell importiertes Ergebnis">
          <option value="">
            Kein Ergebnis verfügbar – Auftrag ohne Bild abschließen
          </option>
          {data.assets
            .filter(
              (a: Row) => a.artist_id === order.artist_id && a.kind === "image",
            )
            .map((a: Row) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </Select>
        <Textarea
          name="note"
          label="Prüfergebnis / Nachweis"
          minLength={10}
          required
        />
        <label className="checkbox">
          <input name="acknowledged" type="checkbox" required />
          Ich habe den unklaren Auftrag geprüft. Ein möglicher Verbrauch wird
          nicht zurückgesetzt.
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={pending}>
          Prüfung dokumentieren
        </button>
      </Form>
    </Modal>
  );
}
