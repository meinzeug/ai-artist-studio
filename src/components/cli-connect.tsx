"use client";
import { useEffect, useState } from "react";
import { Modal, Input, useStudio } from "./ui";
export function CliConnect({
  provider,
  onChange,
}: {
  provider: "codex" | "gemini";
  onChange: () => void;
}) {
  const { act } = useStudio();
  const [open, setOpen] = useState(false),
    [login, setLogin] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [code, setCode] = useState("");
  const call = async (action: string, extra: any = {}) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, provider, id: login?.id, ...extra }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setLogin(action === "disconnect" ? null : d);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (
      !open ||
      !login?.id ||
      !["starting", "waiting", "verifying"].includes(login.state)
    )
      return;
    const id = setInterval(async () => {
      try {
        const r = await fetch("/api/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", provider, id: login.id }),
        });
        const d = await r.json();
        if (!r.ok) {
          setError(d.error);
          clearInterval(id);
        } else {
          setLogin(d);
          if (d.state === "connected") onChange();
        }
      } catch {
        setError("Runner nicht erreichbar. Anmeldung erneut prüfen.");
      }
    }, 1500);
    return () => clearInterval(id);
  }, [open, login?.id, login?.state, provider]);
  const pending =
    login && ["starting", "waiting", "verifying"].includes(login.state);
  return (
    <>
      <button type="button" className="primary" onClick={() => setOpen(true)}>
        {provider === "codex" ? "ChatGPT verbinden" : "Google verbinden"}
      </button>
      {open && (
        <Modal
          title={
            provider === "codex"
              ? "Mit ChatGPT verbinden"
              : "Mit Google verbinden"
          }
          description="Offizielle CLI-Anmeldung ohne API-Key. Dein Konto wird auf dem Rechner des Studio-Runners verbunden."
          onClose={() => setOpen(false)}
        >
          <div className="info-bar">
            Du meldest dich ausschließlich auf der Seite von{" "}
            {provider === "codex" ? "OpenAI" : "Google"} an. Das Studio fragt
            kein Kontopasswort ab. Bestehende globale CLI-Einstellungen werden
            nicht überschrieben.
          </div>
          {provider === "codex" ? (
            <p>
              Erlaube gegebenenfalls die Gerätecode-Anmeldung in den
              ChatGPT-Sicherheitseinstellungen. Öffne danach den Anmeldelink und
              gib den angezeigten Code ein.
            </p>
          ) : (
            <p>
              Öffne den Google-Anmeldelink. Kopiere anschließend den
              Bestätigungscode von Google hierher. Für Organisationskonten
              können zusätzliche Google-Cloud-Berechtigungen erforderlich sein.
            </p>
          )}
          {!pending && login?.state !== "connected" && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => call("start")}
            >
              {busy ? "Wird gestartet …" : "Anmeldung starten"}
            </button>
          )}
          {pending && !login.url && (
            <p role="status">Offizielle CLI wird gestartet …</p>
          )}
          {login?.url && pending && (
            <div className="panel">
              <a
                className="button primary"
                href={login.url}
                target="_blank"
                rel="noreferrer"
              >
                {provider === "codex"
                  ? "ChatGPT-Anmeldung öffnen"
                  : "Google-Anmeldung öffnen"}
              </a>
              {login.deviceCode && (
                <p>
                  Gerätecode:{" "}
                  <strong className="device-code">{login.deviceCode}</strong>
                </p>
              )}
              {provider === "gemini" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void call("code", { code });
                    setCode("");
                  }}
                >
                  <Input
                    label="Google-Bestätigungscode"
                    name="google_code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="off"
                    required
                  />
                  <button
                    type="submit"
                    disabled={busy || login.state === "verifying"}
                  >
                    {login.state === "verifying"
                      ? "Anmeldung wird geprüft …"
                      : "Code bestätigen"}
                  </button>
                </form>
              )}
              <small>
                Gültig bis{" "}
                {new Date(login.expiresAt).toLocaleTimeString("de-DE")}. Nicht
                weitergeben.
              </small>
            </div>
          )}
          {pending && (
            <button disabled={busy} onClick={() => call("cancel")}>
              Anmeldung abbrechen
            </button>
          )}
          {login?.state === "connected" && (
            <div className="panel">
              <h3>Konto im Runner verbunden</h3>
              <p>
                Teste jetzt mit einem echten kurzen Textauftrag, ob das Konto
                verwendbar ist. Der Test nutzt dein CLI-Kontingent.
              </p>
              <button
                className="primary"
                onClick={async () => {
                  await act("queue_ai", {
                    kind: "health_check",
                    input: { provider },
                  });
                  setOpen(false);
                }}
              >
                Verbindung live testen
              </button>
            </div>
          )}
          {(error || login?.error) && (
            <p className="error" role="alert">
              {error || login?.error}
            </p>
          )}
          <details>
            <summary>Verbindung entfernen & Hinweise</summary>
            <p>
              Gespeicherte Studio-Anmeldung auf diesem Runner entfernen. Eine
              separat vorhandene globale CLI-Anmeldung bleibt bestehen. Bei
              Bedarf kannst du den Kontozugriff zusätzlich bei{" "}
              {provider === "codex" ? "OpenAI" : "Google"} widerrufen.
            </p>
            <button
              className="danger"
              disabled={busy || pending}
              onClick={() => call("disconnect")}
            >
              Studio-Anmeldung entfernen
            </button>
            <p>
              <a
                href={
                  provider === "codex"
                    ? "https://developers.openai.com/codex/auth/"
                    : "https://geminicli.com/docs/get-started/authentication/"
                }
                target="_blank"
                rel="noreferrer"
              >
                Offizielle Anleitung
              </a>
            </p>
          </details>
        </Modal>
      )}
    </>
  );
}
