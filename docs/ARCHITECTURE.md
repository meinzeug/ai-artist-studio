# Architektur

Web (Next.js/React) → validierte Commands → PostgreSQL / privater Dateispeicher.
PostgreSQL-Outbox → BullMQ/Redis → Worker → FFmpeg oder eingeschränkter CLI-Runner.

PostgreSQL speichert relationale Entitäten, Versionen, Jobzustände, Versuche, Freigaben, Budget und Audit. Drizzle bildet Künstlerabfragen typisiert ab; komplexe Fachtransaktionen verwenden bewusst explizite, parameterisierte pg-Abfragen für FOR UPDATE, Outbox und Budgetreservierungen; SQL-Migrationen sind überprüfbar und transaktional. JSONB dient nur variablen Identitätsfeldern, Timeline-Snapshots, Providerantworten und Metadaten. Sperren, eindeutige Idempotenzschlüssel und atomare Budgets verhindern lokale Doppelverarbeitung. Fremde Nebenwirkungen sind niemals automatisch als exactly-once anzusehen.

CLI-Runner: eigener Prozess, Token zwischen Worker und Runner, Umgebungs-Allowlist, isolierte Arbeitsverzeichnisse, nur Textschemas. Keine DB-/Social-/Musik-Credentials. Linux Landlock ABI ≥4 als tatsächlich geprüfte Datei-/TCP-Grenze (User-Namespaces/bubblewrap waren hier nicht verfügbar), ergänzend dedizierter Compose-Container, Tools providerseitig gesperrt, keine Host-Home-Freigabe. CLI-Auth separat und vom Datenbackup ausgeschlossen.

Providergrenzen: Text (Codex/Gemini), Musik (manuelles Suno, ausdrücklich gewähltes SunoAPI.org und weiterhin gesperrte separate Suno Platform), Medien (Upload plus Erweiterungsschnittstelle), Social (manueller Export, optional TikTok OAuth/Display). Jeder Adapter meldet Fähigkeiten und tatsächlichen Verbindungszustand.

Dateien liegen außerhalb public, Downloads prüfen Anmeldung/Eigentümer und unterstützen Range. Dateityperkennung anhand des Inhalts, FFprobe und Bilddecoder prüfen importierte Medien. Bearbeitungen erzeugen neue Assets mit Elternbeziehung und SHA-256.

Designsystem: dunkles Produktionsstudio, warme orange Akzente, Radix-Dialoge, Lucide-Symbole, gemeinsame Form-/Karten-/Statuskomponenten. Desktop mit Sidebar, mobil einklappbare Navigation. Keine erfundenen Metriken.

## Referenzprüfung

Stand 2026-09-20: [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-new), [typisierte Abfragen](https://orm.drizzle.team/docs/select), [Linux Landlock](https://docs.kernel.org/userspace-api/landlock.html). Laufende Versionen sind in OPERATIONS und package-lock.json festgehalten. Native Prozesse und Compose besitzen unterschiedliche Betriebsvoraussetzungen; Compose wurde mangels Docker nicht ausgeführt.

## Server und Dashboard-Verbindungen

Drei systemd-Dienste unter getrennten Benutzern: Web/Worker `artist-studio`, Runner `artist-runner`. Caddy terminiert HTTPS für `artist.dorfspy.de`. Datenbank/Redis/Runner bleiben lokal. Die öffentliche Ersteinrichtung benötigt ein separat übergebenes Token.

CLI-Login: Dashboard → authentifizierter Backend-Proxy → Runner → offizielle CLI. Gemini benötigt einen Python-PTY-Helfer für den offiziellen interaktiven Google-Codeweg, Codex verwendet Gerätecode. Nur Loginlink, Gerätecode und Status gelangen an den angemeldeten Betreiber; OAuth-Tokens verbleiben beim Runner. Studio-eigene Refreshes werden atomar gespeichert.

SunoAPI: `music_connections` enthält AES-GCM-verschlüsselte Schlüssel und Creditgrenzen. Atomare Creditreservierung und persistierter Übermittlungsbeginn gehen dem einzigen Generierungs-POST voraus. Statusjobs fragen ausschließlich bereits bekannte Aufträge ab. Öffentliche Callbacks können keinen Status verändern. Audioimports prüfen öffentliche DNS-Ziele, pinnen DNS-Ergebnis pro Request, begrenzen Redirects/Größe und verwenden Dateisignaturen/ffprobe.
