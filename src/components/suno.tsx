"use client";
import { useState } from "react";
import {
  Plug,
  BookOpen,
  RefreshCw,
  Music2,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import {
  useStudio,
  Modal,
  Form,
  Input,
  Select,
  Badge,
  formatDate,
  type Row,
} from "./ui";
function useMusicAction() {
  const { reload, toast } = useStudio();
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const run = async (action: string, data: Row = {}) => {
    setPending(true);
    setError("");
    try {
      const r = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      await reload();
      toast(
        action === "suno_generate"
          ? "Musikauftrag eingereiht. Die Aufnahmen erscheinen automatisch."
          : "SunoAPI-Einstellungen aktualisiert.",
      );
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setPending(false);
    }
  };
  return { run, pending, error };
}
export function SunoConnectionCard() {
  const { data, nav } = useStudio(),
    connection = data.music_connection;
  const [edit, setEdit] = useState(false),
    [help, setHelp] = useState(false);
  const { run, pending, error } = useMusicAction();
  const ready =
    connection?.state === "connected" &&
    connection.callback_url &&
    Number(connection.credits_per_generation) > 0 &&
    Number(connection.daily_credit_limit) >=
      Number(connection.credits_per_generation) &&
    Number(connection.monthly_credit_limit) >=
      Number(connection.credits_per_generation);
  return (
    <>
      <section className="panel suno-connection">
        <div className="panel-heading">
          <div className="suno-brand">
            <span className="suno-icon">
              <Music2 size={24} />
            </span>
            <div>
              <small>MUSIKPRODUKTION · DRITTANBIETER</small>
              <h3>SunoAPI.org verbinden</h3>
            </div>
          </div>
          <Badge
            label={
              ready
                ? "Bereit zur Produktion"
                : connection?.state === "connected"
                  ? "API verbunden"
                  : connection
                    ? "Verbindung prüfen"
                    : "Noch nicht verbunden"
            }
          />
        </div>
        <p>
          Vom Songtext zur Aufnahme: direkt im Studio produzieren, Fortschritt
          verfolgen und Varianten automatisch übernehmen.
        </p>
        <div className="suno-facts">
          <span>
            <strong>{connection?.remaining_credits ?? "—"}</strong>{" "}
            Anbieter-Credits
          </span>
          <span>
            <ShieldCheck size={15} />{" "}
            {connection
              ? "Schlüssel verschlüsselt gespeichert"
              : "Eigener API-Schlüssel"}
          </span>
          {connection && (
            <span>Geprüft: {formatDate(connection.checked_at)}</span>
          )}
        </div>
        {connection?.error && <p className="error">{connection.error}</p>}
        {connection && !ready && (
          <p className="muted">
            Für die Produktion: Rückmelde-Adresse und bestätigten Creditbedarf
            mit Tages-/Monatslimit hinterlegen.
          </p>
        )}
        <div className="actions">
          <button className="primary" onClick={() => setEdit(true)}>
            <Plug size={16} />
            {connection ? "Verbindung bearbeiten" : "Suno API verbinden"}
          </button>
          <button onClick={() => setHelp(true)}>
            <BookOpen size={16} />
            Einrichtungsanleitung
          </button>
          {connection && (
            <button disabled={pending} onClick={() => run("suno_check")}>
              <RefreshCw size={16} />
              Guthaben aktualisieren
            </button>
          )}
          {ready && (
            <button onClick={() => nav("music")}>
              Zur Musikproduktion <ArrowUpRight size={16} />
            </button>
          )}
        </div>
        {error && !edit && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
      {edit && (
        <Modal
          title="Suno API verbinden"
          description="SunoAPI.org ist ein separater Anbieter mit eigenem API-Konto und Guthaben."
          onClose={() => setEdit(false)}
        >
          <Form
            onSubmit={async (v) => {
              const result = await run("suno_connect", {
                api_key: v.api_key || undefined,
                version: connection?.version ?? 0,
                model: v.model,
                callback_url: v.callback_url,
                credits_per_generation: v.credits_per_generation
                  ? Number(v.credits_per_generation)
                  : null,
                daily_credit_limit: Number(v.daily_credit_limit),
                monthly_credit_limit: Number(v.monthly_credit_limit),
              });
              if (result) setEdit(false);
            }}
          >
            <Input
              label="API-Schlüssel"
              name="api_key"
              type="password"
              autoComplete="new-password"
              required={!connection}
              placeholder={
                connection
                  ? "Leer lassen, um gespeicherten Schlüssel zu behalten"
                  : "Schlüssel aus deinem SunoAPI.org-Konto"
              }
            />
            <p className="muted">
              „Verbinden & prüfen“ liest nur dein Guthaben. Dabei wird keine
              Musikproduktion gestartet.
            </p>
            <Select
              label="Standardmodell"
              name="model"
              defaultValue={connection?.model ?? "V6"}
            >
              <option value="V6">V6 · Standard</option>
              <option value="V6_WILD">V6 Wild · Experimentell</option>
              <option value="V6_MINI">V6 Mini</option>
            </Select>
            <details open={!!connection}>
              <summary>
                Produktion einrichten: Budget & Rückmelde-Adresse
              </summary>
              <div className="form suno-advanced">
                <Input
                  label="Rückmelde-Adresse (HTTPS)"
                  name="callback_url"
                  type="url"
                  defaultValue={
                    connection?.callback_url ??
                    (typeof window !== "undefined" &&
                    location.protocol === "https:"
                      ? location.origin + "/api/suno/callback"
                      : "")
                  }
                  placeholder="https://deine-domain.de/api/suno/callback"
                />
                <small>
                  Vom Anbieter vorgeschrieben. Verwende eine öffentlich
                  erreichbare Adresse unter deiner Kontrolle. Das Studio fragt
                  den Status zusätzlich automatisch ab. Details in der
                  Anleitung.
                </small>
                <Input
                  label="Bestätigte Credits pro Generierung"
                  name="credits_per_generation"
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={connection?.credits_per_generation ?? ""}
                  placeholder="Aktuellen Tarif beim Anbieter prüfen"
                />
                <div className="grid-two">
                  <Input
                    label="Creditlimit pro Tag"
                    name="daily_credit_limit"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={connection?.daily_credit_limit ?? 0}
                  />
                  <Input
                    label="Creditlimit pro Monat"
                    name="monthly_credit_limit"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={connection?.monthly_credit_limit ?? 0}
                  />
                </div>
                <small>
                  0 sperrt neue Produktionen. Lokale Reservierung anhand deines
                  eingetragenen Tarifs; der Anbieter setzt seine tatsächlichen
                  Preise. Jede neue Generation benötigt deine Freigabe.
                </small>
              </div>
            </details>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="actions">
              <button type="submit" className="primary" disabled={pending}>
                {pending ? "Verbindung wird geprüft …" : "Verbinden & prüfen"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEdit(false);
                  setHelp(true);
                }}
              >
                Anleitung öffnen
              </button>
              {connection && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={async () => {
                    if (await run("suno_disconnect")) setEdit(false);
                  }}
                >
                  Verbindung entfernen
                </button>
              )}
            </div>
          </Form>
        </Modal>
      )}
      {help && (
        <Modal
          title="Suno API einrichten"
          description="Einmal verbinden. Songs direkt im Studio produzieren."
          onClose={() => setHelp(false)}
          wide
        >
          <ol className="suno-guide">
            <li>
              <h3>API-Konto öffnen</h3>
              <p>
                Erstelle dein Konto bei{" "}
                <a href="https://sunoapi.org/" target="_blank" rel="noreferrer">
                  SunoAPI.org ↗
                </a>
                . Dieser Anbieter verwendet eigene Credits. Dein
                Suno-Web-Abonnement oder der Zugang zu platform.suno.com ist
                dafür kein API-Schlüssel.
              </p>
            </li>
            <li>
              <h3>Schlüssel erstellen und verbinden</h3>
              <p>
                Öffne die{" "}
                <a
                  href="https://sunoapi.org/api-key"
                  target="_blank"
                  rel="noreferrer"
                >
                  API-Schlüsselverwaltung ↗
                </a>
                , kopiere deinen Schlüssel und füge ihn unter „Suno API
                verbinden“ ein. „Verbinden & prüfen“ liest das Guthaben und
                speichert den Schlüssel verschlüsselt auf deinem Server.
              </p>
            </li>
            <li>
              <h3>Rückmelde-Adresse eintragen</h3>
              <p>
                Die Anbieter-Dokumentation verlangt <code>callBackUrl</code>.
                Bei geschütztem HTTPS-Betrieb kannst du{" "}
                <code>https://deine-domain.de/api/suno/callback</code>{" "}
                verwenden. Nur dieser Empfangsweg muss vom Anbieter erreichbar
                sein. Eine ausschließlich lokale Adresse wie 127.0.0.1 ist nicht
                erreichbar. Alternativ einen eigenen HTTPS-Empfänger verwenden.
              </p>
              <p>
                Das Studio veröffentlicht sich nicht automatisch ins Internet.
                Der Empfangsweg bestätigt nur den Eingang. Auftragsstatus und
                Downloads werden ausschließlich über authentifizierte
                API-Abfragen übernommen.
              </p>
            </li>
            <li>
              <h3>Credits und Grenzen festlegen</h3>
              <p>
                Prüfe im Anbieterkonto den aktuellen Creditbedarf der gewählten
                Generation. Trage ihn sowie Tages- und Monatslimits ein.
                Unbekannte Preise werden nicht als kostenlos behandelt. Ohne
                Budget startet keine Produktion.
              </p>
            </li>
            <li>
              <h3>Song produzieren</h3>
              <p>
                Speichere Lyrics und Musikstil und erstelle das
                Suno-Produktionspaket. In „Musikproduktion“ wählst du „Mit API
                produzieren“, prüfst Modell und Creditfreigabe und startest den
                Auftrag. Die App lädt fertige Varianten automatisch in die
                Songbibliothek und analysiert sie.
              </p>
            </li>
            <li>
              <h3>Bei Unterbrechungen</h3>
              <p>
                Die gespeicherte Anbieter-ID bleibt erhalten. „Status & Import
                fortsetzen“ fragt denselben Auftrag ab. Ist nach einem
                Verbindungsabbruch keine ID bekannt, übernimm die Task-ID aus
                dem Anbieterkonto. So wird kein zweiter kostenpflichtiger
                Auftrag blind erzeugt. Rechte an den Ergebnissen weiterhin
                anhand der Nachweise prüfen.
              </p>
            </li>
          </ol>
          <div className="actions">
            <a
              className="button"
              href="https://docs.sunoapi.org/suno-api/generate-music"
              target="_blank"
              rel="noreferrer"
            >
              API-Dokumentation ↗
            </a>
            <button
              className="primary"
              onClick={() => {
                setHelp(false);
                setEdit(true);
              }}
            >
              Jetzt verbinden
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function SunoOrderActions({ order }: { order: Row }) {
  const { data } = useStudio();
  const connection = data.music_connection;
  const [modal, setModal] = useState<"generate" | "resume" | null>(null);
  const { run, pending, error } = useMusicAction();
  const api = order.provider === "sunoapi_org";
  return (
    <div className="suno-order">
      {api ? (
        <>
          <p>
            <strong>SunoAPI.org</strong> ·{" "}
            {order.provider_status ?? "Auftrag gespeichert"}
            {order.external_id && (
              <>
                <br />
                <small>Task-ID: {order.external_id}</small>
              </>
            )}
          </p>
          {order.error && <p className="error">{order.error}</p>}
          {!["queued", "submitting", "succeeded"].includes(order.state) && (
            <button onClick={() => setModal("resume")}>
              Status & Import fortsetzen
            </button>
          )}
          <small>
            Abgeschickte Aufträge können beim Anbieter weiterlaufen. Ein lokaler
            Abbruch storniert keine externe Generation.
          </small>
        </>
      ) : (
        order.state === "waiting_for_input" && (
          <>
            <button
              className="primary"
              disabled={connection?.state !== "connected"}
              onClick={() => setModal("generate")}
            >
              <Music2 size={16} />
              Mit API produzieren
            </button>
            {!connection && (
              <small>
                Suno API oben verbinden, um automatisch zu produzieren.
              </small>
            )}
          </>
        )
      )}
      {modal === "generate" && (
        <Modal
          title="Musikproduktion freigeben"
          description={order.production_number + " · " + order.package.title}
          onClose={() => setModal(null)}
        >
          <Form
            onSubmit={async (v) => {
              const result = await run("suno_generate", {
                order_id: order.id,
                approved: v.approved === "on",
                approved_credits: Number(connection?.credits_per_generation),
                options: {
                  model: v.model,
                  instrumental: v.instrumental === "on",
                  ...(v.vocalGender ? { vocalGender: v.vocalGender } : {}),
                  ...(v.duration ? { duration: Number(v.duration) } : {}),
                },
              });
              if (result) setModal(null);
            }}
          >
            <p>
              Lyrics-Version und Musikstil dieses Produktionspakets werden an
              SunoAPI.org gesendet. Fertige Aufnahmen werden automatisch
              importiert.
            </p>
            <div className="suno-facts">
              <span>Lyrics: {order.package.lyrics.length}/5000</span>
              <span>Stil: {order.package.style_prompt.length}/1000</span>
              <span>Titel: {order.package.title.length}/80</span>
            </div>
            <Select
              name="model"
              label="Musikmodell"
              defaultValue={connection?.model ?? "V6"}
            >
              <option value="V6">V6</option>
              <option value="V6_WILD">V6 Wild</option>
              <option value="V6_MINI">V6 Mini</option>
            </Select>
            <Select name="vocalGender" label="Stimmpräferenz" defaultValue="">
              <option value="">Keine Vorgabe</option>
              <option value="f">Weiblich</option>
              <option value="m">Männlich</option>
            </Select>
            <Input
              name="duration"
              label="Gewünschte Dauer in Sekunden (optional)"
              type="number"
              min="10"
              max="360"
            />
            <label className="check">
              <input type="checkbox" name="instrumental" />
              Instrumental ohne Gesang
            </label>
            <div className="info-bar">
              Reservierung:{" "}
              {connection?.credits_per_generation ?? "noch unbekannt"} Credits ·
              Tageslimit {connection?.daily_credit_limit ?? 0} · Monatslimit{" "}
              {connection?.monthly_credit_limit ?? 0}. Bitte den eingetragenen
              Tarif für das gewählte Modell prüfen.
            </div>
            <label className="check">
              <input type="checkbox" name="approved" required />
              Ich bestätige den eingetragenen Creditbedarf für dieses Modell und
              gebe diesen Auftrag frei.
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="primary"
              disabled={
                pending ||
                !connection?.callback_url ||
                !Number(connection?.credits_per_generation)
              }
            >
              {pending ? "Auftrag wird gespeichert …" : "Produktion starten"}
            </button>
            {(!connection?.callback_url ||
              !Number(connection?.credits_per_generation)) && (
              <p className="error">
                In „Verbindung bearbeiten“ zuerst Rückmelde-Adresse und
                Creditbedarf eintragen.
              </p>
            )}
          </Form>
        </Modal>
      )}
      {modal === "resume" && (
        <Modal
          title="Vorhandenen Auftrag prüfen"
          description="Es wird keine neue Generation bestellt."
          onClose={() => setModal(null)}
        >
          <Form
            onSubmit={async (v) => {
              if (
                await run("suno_resume", {
                  order_id: order.id,
                  task_id: v.task_id,
                })
              )
                setModal(null);
            }}
          >
            <Input
              label="Task-ID aus dem SunoAPI.org-Konto"
              name="task_id"
              defaultValue={order.external_id ?? ""}
              readOnly={!!order.external_id}
              required
            />
            <p>
              Nur die ID genau dieses Produktionsauftrags übernehmen. Bereits
              importierte Varianten werden nicht doppelt angelegt.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="primary" disabled={pending}>
              Statusabruf starten
            </button>
          </Form>
        </Modal>
      )}
    </div>
  );
}
