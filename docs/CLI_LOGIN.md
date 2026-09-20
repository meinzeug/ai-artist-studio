# ChatGPT und Google im Dashboard verbinden

**Einstellungen → Provider & Konten → ChatGPT verbinden / Google verbinden.** Kein OpenAI- oder Gemini-API-Key erforderlich. Die CLI muss auf dem Studio-Runner installiert sein; das Serverdeployment installiert die geprüften Versionen automatisch.

## Codex / ChatGPT

1. **Anmeldung starten**. Der Runner startet offiziell `codex login --device-auth` in einem eigenen Arbeitsverzeichnis.
2. Den angezeigten OpenAI-Link öffnen, bei ChatGPT anmelden und den Gerätecode eingeben. Gegebenenfalls Gerätecode-Anmeldung in den ChatGPT-Sicherheitseinstellungen bzw. durch den Workspace-Administrator erlauben.
3. Das Dashboard erkennt die gespeicherte Anmeldung. **Verbindung live testen** erzeugt einen kurzen strukturierten Textauftrag und prüft, ob das Konto wirklich verwendbar ist.

## Gemini / Google

1. **Anmeldung starten**. Die tatsächliche Gemini CLI läuft interaktiv in einem begrenzten Terminalprozess mit `NO_BROWSER=true`; kein nachgebauter OAuth-Client und kein Browser-Cookie-Import.
2. Den Google-Link öffnen und die Anmeldung bestätigen. Den auf der Google-Seite ausgegebenen Bestätigungscode in das Dialogfeld kopieren.
3. **Code bestätigen**, dann **Verbindung live testen**. Organisations-/Workspace-Konten können weitere Google-Cloud-Konfiguration benötigen; eine gespeicherte Anmeldung allein garantiert keine nutzbare Quote.

## Speicherort und Kontrolle

Die Anmeldung gilt für den **Computer des Runners**. Beim Aufruf von `artist.dorfspy.de` wird der Server verbunden, nicht automatisch der Browser-PC. Bei einer lokalen Installation wird der lokale Runner verbunden.

Studio-eigene Kontodaten liegen unter `RUNNER_AUTH_ROOT`, beim Deployment `/var/lib/artist-runner/auth`, Modus 0700/0600, nur für den Runner-Systembenutzer. Web und Worker erhalten weder Auth-Dateien noch OAuth-Tokens. Token-Erneuerungen aus Textaufträgen werden in diese Studio-Dateien zurückgeschrieben. Bestehende globale CLI-Konfigurationen werden nicht verändert; ausdrücklich eingerichtete bestehende Anmeldungen sind weiter als Fallback nutzbar.

**Studio-Anmeldung entfernen** löscht nur die vom Studio verwaltete lokale Anmeldung. Eine globale vorhandene Anmeldung bleibt erkennbar. Der Zugriff lässt sich zusätzlich beim Kontoprovider widerrufen. Loginprozesse haben Zeitlimit und Abbruch; beim Runner-Neustart muss ein nicht abgeschlossener Login erneut gestartet werden. Keine Logins oder Bestätigungscodes in Audit-/Anwendungslogs.

Der Runner hat keine Datenbank-, Suno- oder TikTok-Schlüssel. Texte werden in separaten Arbeitsverzeichnissen mit Linux-Landlock ausgeführt; Loginprozesse erhalten nur die CLI-Anmeldeumgebung und keine Modellaufträge. Während eines Logins werden neue Textaufrufe zurückgestellt.

## Dokumentation und tatsächliche Prüfung

Stand **2026-09-20**, Codex **0.154.0**, Gemini **0.60.0**. [Offizielle Codex-Authentifizierung](https://developers.openai.com/codex/auth/), [Gemini-Authentifizierung](https://geminicli.com/docs/get-started/authentication/). Gemini-Headless verwendet bereits gespeicherte offizielle Anmeldung; der Erstanmeldedialog ist interaktiv.

Beide echten CLIs wurden mit frischen isolierten Verzeichnissen bis zum offiziellen Anmeldelink ausgeführt und anschließend abgebrochen. Persönliche Anmeldung ist ein Nutzer-Schritt. Codex-Textproduktion wurde mit dem vorhandenen lokalen ChatGPT-Login live geprüft. Gemini-Modellaufruf ist ohne Google-Anmeldung nicht live geprüft. Keine persönlichen Anmeldedaten wurden vom Entwicklungsrechner auf den Server kopiert.

## Bildaufträge über Codex

Die Bild-KI wird unabhängig von der Text-KI unter **Provider & Konten → Bild-KI auswählen** eingestellt. Codex-Bilder verwenden dieselbe offizielle ChatGPT-Anmeldung im Runner und keinen API-Key. Im eigenen Bildauftrag wird ausschließlich die native Bildfunktion zusätzlich erlaubt; die Begrenzungen für Shell, Dateien und Netzwerk bleiben bestehen. Während eines Logins wird auch die Bilderstellung zurückgestellt. Gemini-Bilder verwenden die separat einzurichtende Developer API, nicht den Google-CLI-Login. [Anleitung](IMAGE_GENERATION.md).
