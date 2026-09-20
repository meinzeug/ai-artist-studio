# Betrieb unter Ubuntu / Linux

## Tatsächlich verwendete Umgebung
Node 22.23.1, npm 10.9.8, PostgreSQL 16.15, Redis 7.0.15 (lokal ohne Systeminstallation extrahiert), FFmpeg/ffprobe 6.1.1, Codex CLI 0.154.0, Gemini CLI 0.60.0. Genaue npm-Versionen in package.json/package-lock.json. Linux 6.8 mit Landlock ABI ≥4 erforderlich. Keine GPU.

## Lokaler Start dieser Installation
```bash
npm run services:start
npm run db:migrate
npm run build
npm run studio:start
```
Öffnen: http://127.0.0.1:3210. Der erste Aufruf richtet ein Betreiberkonto ein. Es gibt kein Standardpasswort. `studio:start` bleibt im Vordergrund und startet Web, Worker und Runner. Strg+C beendet diese Prozesse. Alternativ `npm run studio:stop` in einem zweiten Terminal. Danach optional `npm run services:stop` für ausschließlich den projektlokalen PostgreSQL-/Redis-Dienst.

Entwicklung separat:
```bash
npm run dev
npm run worker
npm run runner
```
Die drei Befehle benötigen getrennte Terminals. Kein zweites Webprogramm auf demselben Port starten.

`npm run setup:local` installiert die gepinnten npm-Abhängigkeiten, kompiliert den Runner-Schutz und richtet einen eigenen Cluster unter `.local/postgres` auf Port 56432 sowie Redis auf 57379 ein. Es nutzt vorhandene PostgreSQL-16-/FFmpeg-/Compiler-Werkzeuge. Fehlendes Redis wird mit `apt download` und `dpkg-deb -x` in `.local` abgelegt; keine Root-/Systeminstallation. Vorhandene `.env` und `.env.runner` werden erhalten. Andere PostgreSQL-Dienste werden nicht verwendet. Nur im eigenen Cluster werden TCP-Verbindungen auf SCRAM-Passwortprüfung und Unix-Sockets auf Peer-Anmeldung gestellt. `TEST_DATABASE_URL` wird getrennt erzeugt.

## CLI-Anmeldung

**Einstellungen → Provider & Konten → ChatGPT verbinden / Google verbinden.** Die offiziellen CLI-Dialoge werden im Runner gestartet und im Dashboard begleitet. Kein API-Key nötig. Nach dem Login den echten Verbindungstest ausführen. [Schritt-für-Schritt-Anleitung](CLI_LOGIN.md).

Native vorhandene eigene Anmeldungen bleiben als ausdrücklich konfigurierte Alternative nutzbar (`CODEX_AUTH_DIR`, `GEMINI_AUTH_DIR`). Das Studio speichert neue Anmeldungen getrennt unter `RUNNER_AUTH_ROOT`; globale CLI-Konfigurationen werden nicht verändert. Python 3 wird für den offiziellen interaktiven Gemini-Codeweg benötigt. Ein Google-Login ist noch keine bestätigte nutzbare Modellquote.

## Docker Compose
Docker ist auf der Abnahmeumgebung nicht installiert; dieser Ausführungsweg ist bereitgestellt, aber hier nicht gestartet/getestet.
```bash
cp .env.compose.example .env.compose
# Drei unabhängige zufällige Geheimnisse eintragen; keine Beispielwerte verwenden.
docker compose --env-file .env.compose up --build -d
```
Image-Tags sind gepinnt. Der Host benötigt Landlock ABI ≥4 und einen Container-Runtime-Sicherheitsfilter, der Landlock-Syscalls zulässt. Der Runner scheitert andernfalls geschlossen. Keine pauschalen Privileged-/YOLO-Modi aktivieren.

Die Anmeldung kann auch im Compose-Betrieb aus dem Dashboard erfolgen. Das separate `runner_managed`-Volume enthält die Studio-Anmeldungen. Auth-Volumes niemals an Web/Worker mounten oder in allgemeine Datenbackups aufnehmen. Bei HTTPS vor der ersten Einrichtung einen zufälligen `SETUP_TOKEN` setzen.

## Diagnose und Wartung
```bash
npm run diagnose
npm run typecheck
npm test
npm run test:e2e
```
Health: `/api/health` meldet nur Verfügbarkeit. Detaillierte Provider-/Jobinformationen erfordern Login. Fehlgeschlagene Jobs und Versuchshistorie stehen unter Jobs. Retry ist eine bewusste neue lokale Ausführung mit neuem Budget; unklarer externer Status ist gesperrt. Temporäre lokale Netzwerkfehler haben begrenzte exponentielle Wiederholungen. PostgreSQL-Leases stellen nach Prozessabbruch wieder her; BullMQ behandelt seine eigenen verlorenen Locks.

Synthetische Testdaten werden in `artist_studio_test` und `.local/test-assets` erzeugt; Testserver auf Port 3212, eigene Queue. Der echte CLI-Test verwendet Kontingent der ausdrücklich eingerichteten CLI. Keine externen kostenpflichtigen Musik-/Videoaufträge und keine Posts werden gesendet. Tests setzen niemals die Produktionsdatenbank zurück.

## Backup
Für Konsistenz zunächst Web und Worker anhalten; CLI-Runner kann ebenfalls beendet werden. Datenbank bleibt an.
```bash
npm run backup -- /privater/pfad/backup-2026-09-20
```
Sicherung enthält `database.dump`, `manifest.json` und ausschließlich referenzierte Dateien unter `assets/`. Aktive Jobs verhindern das Backup. CLI-Auth, `.env`, Schlüssel und Host-Home werden ausgeschlossen. Den Token-Verschlüsselungsschlüssel separat sicher verwahren; ohne ihn lassen sich gesicherte Provider-Tokens nicht entschlüsseln. Für konsistente Sicherungen keine parallel schreibenden Web-/Worker-Prozesse zulassen.

## Restore in eine neue Datenbank
Eine neue leere PostgreSQL-Datenbank und einen neuen leeren Storagepfad vorbereiten. Das Skript verweigert das Überschreiben der aktuellen Produktionsdatenbank und einer nicht leeren Zieldatenbank.
```bash
npm run restore -- /privater/pfad/backup POSTGRESQL_ZIEL_URL /privater/pfad/wiederhergestellte-assets
```
`pg_restore` stellt Beziehungen und Versionen wieder her; jede Datei wird anhand des Manifest-SHA-256 geprüft. Danach DATABASE_URL und STORAGE_ROOT bewusst auf die neue Umgebung umstellen, denselben getrennt verwahrten Verschlüsselungsschlüssel konfigurieren und Diagnose/Kernstrecke prüfen. Keine CLI-Auth aus Backup erwarten.

## Updates
1. Releaseänderungen lesen; Web/Worker beenden.
2. Konsistentes Backup erstellen und Restore-Nachweis bereithalten.
3. Code und Lockfile übernehmen; `npm ci`.
4. `npm run db:migrate` (versioniert, transaktional, mit DB-Sperre).
5. Typ-/Unit-/Integrationstests, Build und separaten E2E-Test ausführen.
6. Prozesse neu starten; Health und ausstehende Jobs prüfen.

## Externe Zugänge
TikTok OAuth/Display benötigt registrierte Developer-App, explizite Scopes `user.info.basic,video.list`, gültige Redirect-URI und Client Key/Secret. Tokens rotieren über den dokumentierten Refreshweg. Posting, Kommentare und Business-Watchtime sind separate Berechtigungen. Diese private Anwendung verwendet produktiv den Exportweg. SunoAPI.org wird direkt im Dashboard eingerichtet; eigener Drittanbieter-Key, bestätigte Credits und HTTPS-Callback erforderlich. Die separate Suno Platform ist weiterhin nicht verbunden. Details in SUNO_API_SETUP.md.

## Zusätzliche Abnahmeskripte

`node --import tsx scripts/test-cli.ts` prüft beide CLIs. `scripts/test-ui.ts` prüft die vorhandenen synthetischen E2E-Daten ohne neue KI-Produktion. `scripts/test-recovery.ts` beendet ausschließlich seinen eigenen Testworker. `scripts/test-restore.ts` benötigt angehaltene Studio-Prozesse und startet den eigenen PostgreSQL-Dienst tatsächlich neu. Details im TEST_REPORT. Für Browsertests wird vorhandenes Google Chrome verwendet; ohne Chrome `npx playwright install chromium` ausführen.

## Tatsächlich eingerichteter Server

`https://artist.dorfspy.de` → `91.99.217.84`, Hetzner A-RRset TTL 300, Caddy mit automatisch erneuertem Let’s-Encrypt-Zertifikat. Deployment am 2026-09-20 geprüft. Die vorhandene andere Anwendung läuft weiter.

- Code: `/opt/ai-artist-studio`, npm-Abhängigkeiten lokal, CLIs separat `/opt/artist-cli`.
- Web/Worker: Systembenutzer `artist-studio`, private Medien `/var/lib/artist-studio/assets`, Secrets `/etc/artist-studio/web.env`.
- Runner: eigener Systembenutzer `artist-runner`, Auth `/var/lib/artist-runner/auth`, Secrets `/etc/artist-studio/runner.env`. Webbenutzer darf diese Authdateien nicht lesen.
- Dienste: `artist-studio-web`, `artist-studio-worker`, `artist-studio-runner`; alle systemd-Units automatisch aktiviert.
- Standard-PostgreSQL auf Loopback, eigene DB/Rolle `artist_studio`; Redis auf Loopback. Nicht den lokalen Entwicklungscluster kopieren.
- Ersteinrichtung verlangt `SETUP_TOKEN`. Separat übergeben, nicht im Repository/Backup. Nach erstem Konto wird jede weitere Registrierung abgewiesen.

Quellen und Provisionierung: [Deployment-Skripte](../scripts/deploy/README.md). Der Next-Build muss bei diesem nativen Weg auf dem Zielhost ausgeführt werden, da Turbopack externe Modulaliasse in `node_modules` anlegt. Es genügt nicht, nur `.next` von einem anderen Pfad zu kopieren. Auf dem kleinen Host geprüft: `NODE_OPTIONS=--max-old-space-size=768 npm run build`.

Serverbackup: Web und Worker stoppen, DB weiterlaufen lassen; `scripts/backup.ts` als `artist-studio` mit der geschützten Web-Umgebung starten. Backup außerhalb des Webroots unter einem nur für diesen Benutzer lesbaren Pfad speichern. Runner-Auth ausdrücklich ausnehmen. Schlüssel separat sichern. Bei Updates nur die drei Studio-Dienste verändern.

## Optionale Veo-Szenen

Migration `004_video_generation.sql` vor Start des aktualisierten Workers/Webs ausführen. Keine zusätzliche CLI, GPU oder npm-Abhängigkeit. Google-Key ausschließlich im Dashboard konfigurieren; verschlüsselt in `video_connections`, niemals in Runner-Env oder KI-Prompts. API-Projekt und Abrechnung separat einrichten. Tages-/Monatsbudgets mit bestätigtem USD-Kostenansatz beginnen standardmäßig bei 0. [Einrichtung und Wiederaufnahme](VIDEO_PRODUCTION.md).

Sicherungen enthalten die verschlüsselte Verbindung sowie Szenenaufträge/Reservierungen in den drei neuen Tabellen. Der vorhandene außerhalb der DB verwahrte `TOKEN_ENCRYPTION_KEY` ist beim Restore weiter erforderlich. Unklare externe Operationen nach Wiederherstellung abfragen, niemals blind erneut generieren.

## Bildprovider-Update

Migration `005_image_generation.sql` ist additiv. Vor dem Update wie üblich Daten und Assets sichern. Neue Runner-Bildfunktion erfordert einen Neustart von **Web, Worker und Runner**, nachdem laufende Jobs/Anmeldungen beendet sind. Auth-Verzeichnisse unverändert beibehalten; keine lokalen Accountdateien auf den Server kopieren. Keine neue npm-Abhängigkeit und kein neues Systempaket.

Im Dashboard unter Provider & Konten die Bild-KI ausdrücklich wählen. Codex nutzt die bestehende Runner-Anmeldung. Für Gemini ist ein eigener Bild-API-Key nötig; unabhängig vom Veo-Key. [Schrittfolge und Fehlerbehandlung](IMAGE_GENERATION.md). Bestehende Künstler und Bilder bleiben erhalten. Der Standard führt ohne eingerichteten Bildprovider weiterhin zum manuellen Import.

## Künstlerautomatik (Migration 006)

Nach Backup und Migration Web/Worker/Runner gemeinsam aktualisieren. Kein neuer Systemdienst, kein Cronjob und keine neue Abhängigkeit nötig. Der Worker erledigt Tagesplanung und Wiederaufnahme anhand der Datenbank. Bestehende Artists bleiben zunächst unverändert; unter „Tägliche Automatik“ ausdrücklich aktivieren. Neue „Artist erstellen“-Aufträge starten den vollständigen Ablauf. Vor Wartungen Automatik pausieren beziehungsweise Not-Aus aktivieren und laufende Jobs auslaufen lassen. Nicht die Queue alleine löschen: PostgreSQL hält den Produktionsfortschritt.

Standard 09:00 Europe/Berlin, pro Artist einstellbar. Ausfalltage erzeugen keinen Nachholstapel. Referenzbild, Providerfreigaben, Tagesläufe, Clipprojekte und Aufgaben werden regulär gesichert/exportiert. Nach einem Restore unbekannte externe Aufträge klären; niemals manuell einen zweiten Auftrag als „Retry“ erzwingen. [Bedienung und Grenzen](AUTOMATION.md).

## Vollständige Musikvideos (Migration 007)

Nach Sicherung und Ende laufender Provideraufträge Migration 007 und den aktualisierten Web-/Worker-Code installieren. Die Migration erweitert die erlaubten Videovorlagen und ergänzt zwei relationale Tabellen. Kein neuer Dienst, Paket oder API-Key. Bereits aktive Künstler behalten zunächst ihre bisherige Einstellung; die Vollversion wird gezielt in der Automatik eingeschaltet.

Der Renderer begrenzt sich auf zwei Bildquellen gleichzeitig; Bildaufträge laufen einzeln innerhalb der bisherigen Grenzen. Fortschritt, fertige Szenen und unveränderliche Referenzen werden in PostgreSQL gesichert. Bei Budget-/Providerblockern unter „Vollständige Musikvideos“ fortsetzen, nachdem die Ursache behoben wurde. Bereits unklar übermittelte Bildaufträge zuerst klären. Einen laufenden externen Auftrag nicht durch Löschen von Queue-/Datenbankeinträgen wiederholen.

Restore nach Migration 007 mit 52 Tabellen, 64 Datensätzen, sieben Dateihashes und echtem DB-Neustart bestanden; dieser Test verwendet ausschließlich eine separate synthetische Testproduktion. [Nachweis](test-evidence/full-music-video-restore.json).

## Zusätzliche Produktionen (Migration 008)

Vor dem Update laufende Aufträge auslaufen lassen und Daten sichern. Migration 008 ergänzt Startart/Startkennung an `automation_runs` und ersetzt den allgemeinen Tagesindex durch einen partiellen Index für geplante Tagesproduktionen. Vorhandene Läufe bleiben tägliche Produktionen. Web und sämtliche Worker gemeinsam aktualisieren und neu starten, da sich auch der Scheduler-Sperrschlüssel auf das aktuelle Datenbankschema bezieht. Keine neue Abhängigkeit. Zusätzliche Produktionen über den Dashboard-Dialog starten; keine Termine oder bestehenden Laufdaten zum Erzwingen eines Starts manipulieren.
