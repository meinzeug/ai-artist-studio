# Architektur

Web (Next.js/React) → validierte Commands → PostgreSQL / privater Dateispeicher.
PostgreSQL-Outbox → BullMQ/Redis → Worker → FFmpeg oder eingeschränkter CLI-Runner.

PostgreSQL speichert relationale Entitäten, Versionen, Jobzustände, Versuche, Freigaben, Budget und Audit. Drizzle bildet Künstlerabfragen typisiert ab; komplexe Fachtransaktionen verwenden bewusst explizite, parameterisierte pg-Abfragen für FOR UPDATE, Outbox und Budgetreservierungen; SQL-Migrationen sind überprüfbar und transaktional. JSONB dient nur variablen Identitätsfeldern, Timeline-Snapshots, Providerantworten und Metadaten. Sperren, eindeutige Idempotenzschlüssel und atomare Budgets verhindern lokale Doppelverarbeitung. Fremde Nebenwirkungen sind niemals automatisch als exactly-once anzusehen.

CLI-Runner: eigener Prozess, Token zwischen Worker und Runner, Umgebungs-Allowlist, isolierte Arbeitsverzeichnisse, nur Textschemas. Keine DB-/Social-/Musik-Credentials. Linux Landlock ABI ≥4 als tatsächlich geprüfte Datei-/TCP-Grenze (User-Namespaces/bubblewrap waren hier nicht verfügbar), ergänzend dedizierter Compose-Container, Tools providerseitig gesperrt, keine Host-Home-Freigabe. CLI-Auth separat und vom Datenbackup ausgeschlossen.

Providergrenzen: Text (Codex/Gemini), Musik (manuelles Suno, ausdrücklich gewähltes SunoAPI.org und weiterhin gesperrte separate Suno Platform), Medien (Upload, native Codex-Bilder, explizite Gemini-Bild-API, FFmpeg und optionaler Veo-Adapter), Social (manueller Export, optional TikTok OAuth/Display). Jeder Adapter meldet Fähigkeiten und tatsächlichen Verbindungszustand.

Dateien liegen außerhalb public, Downloads prüfen Anmeldung/Eigentümer und unterstützen Range. Dateityperkennung anhand des Inhalts, FFprobe und Bilddecoder prüfen importierte Medien. Bearbeitungen erzeugen neue Assets mit Elternbeziehung und SHA-256.

Designsystem: dunkles Produktionsstudio, warme orange Akzente, Radix-Dialoge, Lucide-Symbole, gemeinsame Form-/Karten-/Statuskomponenten. Desktop mit Sidebar, mobil einklappbare Navigation. Keine erfundenen Metriken.

## Referenzprüfung

Stand 2026-09-20: [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-new), [typisierte Abfragen](https://orm.drizzle.team/docs/select), [Linux Landlock](https://docs.kernel.org/userspace-api/landlock.html). Laufende Versionen sind in OPERATIONS und package-lock.json festgehalten. Native Prozesse und Compose besitzen unterschiedliche Betriebsvoraussetzungen; Compose wurde mangels Docker nicht ausgeführt.

## Server und Dashboard-Verbindungen

Drei systemd-Dienste unter getrennten Benutzern: Web/Worker `artist-studio`, Runner `artist-runner`. Caddy terminiert HTTPS für `artist.dorfspy.de`. Datenbank/Redis/Runner bleiben lokal. Die öffentliche Ersteinrichtung benötigt ein separat übergebenes Token.

CLI-Login: Dashboard → authentifizierter Backend-Proxy → Runner → offizielle CLI. Gemini benötigt einen Python-PTY-Helfer für den offiziellen interaktiven Google-Codeweg, Codex verwendet Gerätecode. Nur Loginlink, Gerätecode und Status gelangen an den angemeldeten Betreiber; OAuth-Tokens verbleiben beim Runner. Studio-eigene Refreshes werden atomar gespeichert.

SunoAPI: `music_connections` enthält AES-GCM-verschlüsselte Schlüssel und Creditgrenzen. Atomare Creditreservierung und persistierter Übermittlungsbeginn gehen dem einzigen Generierungs-POST voraus. Statusjobs fragen ausschließlich bereits bekannte Aufträge ab. Öffentliche Callbacks können keinen Status verändern. Audioimports prüfen öffentliche DNS-Ziele, pinnen DNS-Ergebnis pro Request, begrenzen Redirects/Größe und verwenden Dateisignaturen/ffprobe.

## Optionale Videoszenen

`video_connections` hält den verschlüsselten Google-Key und ausdrücklich bestätigte USD-Kostenansätze. `video_generations` speichert unveränderliche Szenenaufträge und Startbild-Hashes, `video_cost_reservations` die atomare Budgetreservierung. `veo_generate` ist ein externer Job mit einem Übermittlungsversuch. `veo_sync` fragt nur vorhandene Operationen ab; Downloads und Importe sind dedupliziert. Die gemeinsame FFmpeg-Pipeline ersetzt Szenenton durch die gewählte Songaufnahme. Der CLI-Runner erhält keinen Veo-Key. Details: VIDEO_PRODUCTION.md.

## Bildprovider

Migration 005 ergänzt `image_connections`, `image_generations` und `image_reservations`. Die Auswahl ist unabhängig von `settings.provider` (Text). Eigene typisierte Aktionen `image_configure`, `image_generate`, `image_resolve` prüfen Besitz, Freigabe, Versionssnapshot, Not-Aus und atomare Budgets. `queue_ai` kann diese Prüfungen nicht umgehen. Der Worker nutzt entweder den isolierten Runner `/image` oder den festen offiziellen Google-Endpunkt. Einmalige Übermittlung, keine automatische Wiederholung bei unklarem Zustand, wiederanlaufende fachliche Zustandsprüfung. Assets bleiben unverändert und privat. Details: [Bildproduktion](IMAGE_GENERATION.md).

## Dauerhafte Künstlerautomatik

Vollständige Musikvideos ergänzen diese Automatik mit Migration 007: `music_video_productions` hält die unveränderliche Produktionsgrundlage und `music_video_scenes` einzelne Bildaufträge. Eigener Scheduler-Lock, begrenztes strukturiertes Storyboard, referenzbasierte Bilder mit vorhandenen Budgetreservierungen und separat gerenderte Überblendungen halten die Produktion wiederaufnehmbar und den Speicherverbrauch klein. Die Automatik wartet vor den zusätzlichen Kurzclips auf die Vollversion. Bestehende fertige Läufe können eine Vollversion erhalten, ohne ihre Kurzclips zu ersetzen. [Details](FULL_MUSIC_VIDEOS.md).

Migration 006 ergänzt `artist_automations` (Zeitplan, Hauptreferenz, freigegebene Provider-Versionen), `automation_runs` (Stufe/Tag/Job-/Song-/Auftragsbezug), `automation_clips` (drei konkrete Projekte und Posts) und `manual_tasks` (menschliche Übergaben). Der Worker prüft fällige Tage und setzt Stufen fort; ein PostgreSQL-Advisory-Lock verhindert parallele Schedulerläufe. Eindeutige Tages-/Erstellungsschlüssel und ein partieller Index sichern höchstens einen aktiven Lauf pro Artist.

`auto_identity` und `auto_song` sind begrenzte strukturierte Textaufträge im vorhandenen CLI-Runner. Bestehende Artist-Snapshots, Katalog und tatsächlich gespeicherte Erkenntnisse/Kennzahlen liefern Kontext. Laufende Produktionen überschreiben keine menschlich geänderte Identität. Der Hauptporträtbezug wird im Backend für spätere Bildaufträge erzwungen. Musik-/Bild-/Renderaufträge nutzen die bestehenden separaten Adapter und Budgetreservierungen. Manuelle Audioimporte schließen an denselben Lauf an; fertige Videos erzeugen drei private Beitragsentwürfe mit Aufgaben.

`delivery` exportiert einen klar bezeichneten Entwurf ohne Freigabebehauptung. `auto_publish` dokumentiert nach expliziter Betreiberprüfung die eigene manuelle Veröffentlichung und bindet einen aktuellen Snapshot. Es gibt keinen neuen externen Posting-Endpunkt. Ablauf und Grenzen: [AUTOMATION.md](AUTOMATION.md).

### Zusätzlicher Produktionsstart (Migration 008)

`auto_start` erzeugt nach Betreiberbestätigung einen Lauf mit `start_kind=manual` und eindeutigem `start_key`. Der partielle Tagesindex gilt für `daily`; der bestehende Index gegen mehrere aktive Läufe bleibt erhalten. Settings-/Policy-Sperren, Provider-Versionen und Budgetprüfungen gelten auch beim Zusatzstart. Tagesplan und Künstleridentität werden nicht geändert. Scheduler prüfen den aktiven Lauf erneut innerhalb ihrer Transaktion. Advisory-Locks der beiden Scheduler sind nach Datenbankschema getrennt, damit unabhängige Testschemas sich nicht blockieren; Worker desselben Schemas teilen weiterhin die Sperre.
