# Produktspezifikation und Anforderungsmatrix

AI Artist Studio ist eine private, deutsche Produktionszentrale für virtuelle Musikcharaktere. Der Betreiber entwickelt eine nachvollziehbare Identität, erstellt Ideen und Lyrics, produziert extern rechtmäßig Musik, importiert Aufnahmen, rendert Videos und verwaltet Freigaben, manuelle Veröffentlichung und tatsächliche Messwerte. Standard: Europe/Berlin, lokale CPU, privater Dateispeicher, ChatGPT-CLI-Login ohne API-Key.

## Zustände und Produktregeln
- Virtuelle Identität offenlegen; Öffentlichkeit, Fiktion und bestätigte Fakten trennen.
- Neue Identität erzeugt eine Version. Songs behalten ihren Identitätsstand; KI-Jobs erhalten einen Snapshot.
- Lyrics sind append-only Versionen. Geschützte Passagen dürfen weder KI noch normales Speichern entfernen; explizites Entsperren wird protokolliert.
- Audiooriginal bleibt unverändert. Videoausgaben sind abgeleitete Assets; Renderings speichern Eingaben und Hashes.
- Kein Beitrag wird extern versendet. Ein Freigabeexport benötigt Rechtefreigabe und gültigen Snapshot; Produktionsentwürfe können zuvor mit klarer Prüfliste heruntergeladen werden. Ein manueller Veröffentlichungsnachweis ist ausdrücklich unbestätigt durch die Plattform.
- Leere Kennzahlen bleiben null. Auswertung verwendet jüngste kumulative Werte, gleiche Messzeitpunkte für Raten und gewichtete Nenner.
- Fehlende Provider sind sichtbar. Weder Trends noch Medienverständnis oder Kostenfreiheit werden vorgetäuscht.

## Matrix: Auftragskapitel → Umsetzung → Nachweis

| Nr. | Anforderung / Umsetzung | Implementierung | Nachweis |
|---|---|---|---|
| 1 | Durchgängige Produktionsstrecke, Mehrkünstler, manueller Weg | Studioansichten, Commands, Worker | Playwright core.spec.ts mit echter CLI und drei Videos |
| 2 | Linux, Deutsch, Berlin, privater Login, Bestand erhalten | Auth, CSS, Temporal, lokales Setup | Bestandsaufnahme; Setup-/Browsertest |
| 3 | Dokumentation und tatsächliche Zugänge unterscheiden | INTEGRATION_MATRIX.md | Quellenprüfung 2026-09-20 |
| 4 | TS/Next/React, PostgreSQL, Redis/BullMQ, FFmpeg, Worker/Runner | src/server, src/worker, src/runner, Compose | Build, Typprüfung, DB- und Rendertests |
| 5 | 14 Bereiche inklusive Aufgaben-Inbox, Leer-/Fehlerzustände, Einrichtung | components/studio.tsx, settings.tsx | Desktop-/Mobil-Browser und Screenshots |
| 6 | Character Bible mit getrennten Identitätsfeldern, KI-Konzepte, Versionen | artists.tsx, identity_versions | Künstler anlegen/bearbeiten/Reload; Konflikttest |
| 7 | Getrennte visuelle/musikalische Referenzen, Vorschlag/Freigabe | library.tsx, artist_references | Referenz-Commands; keine Gesicht/Stimmgarantie |
| 8 | Ideen, Katalogähnlichkeit, Status/Feedback/Kombination | artists.tsx, tasks.ts | Live-Ideen; Ähnlichkeitstest; Quellen ohne aktuelle Recherche leer |
| 9 | Editor, Versionen, Vergleich, Undo, Auswahl schützen, gezielte Überarbeitung | songs.tsx, lyrics_versions | Live-Lyrics; Schutz-/Versions-/Konflikttests |
| 10 | Suno ZIP, Kopierfelder, eindeutige Nummer, Auftrags-/Versionsimport | exports, upload, music_orders | ZIP/Audiozuordnung im E2E; SunoAPI.org-Adapter + Dashboard/Mocktests, echter API-Key fehlt |
| 11 | Audioplayer/Wellenform, Varianten/Master, Clips, Timing, ffprobe/EBU | songs.tsx, media.ts | synthetisches Audio, echte Analyse, technische Medienabnahme |
| 12 | Privater Import Bilder/Audio/Video/PDF, Hash/Provenienz, Storyboards, wählbare Bild-KI | storage.ts, library.tsx, tasks.ts | Inhalts-/Dateinamentests, Import-E2E, images.test.ts; native Codex-Bilder live, Gemini-Bild-API simuliert |
| 13 | 3 echte 1080×1920-MP4-Vorlagen, Timeline, Crop, Untertitel, Renderqueue | video.tsx, media.ts, renders | drei reale Renderings + ffprobe + vollständige FFmpeg-Dekodierung |
| 14 | Kampagnen, unterschiedliche KI-Konzepte, Monatskalender, Verschieben, DST | publishing.tsx, Temporal | DST-Tests, Terminkonfliktprüfung |
| 15 | Manuelle Konten, OAuth/Display implementiert, Export, Nachweis | providers/tiktok.ts, API-Routen | Export-E2E; OAuth mangels App nicht live getestet |
| 16 | Betriebsarten, Snapshotfreigabe, Not-Aus, unveränderliche Nachweise | approval.ts, commands.ts | Freigabeinvalidierung; Not-Aus-/Idempotenztest |
| 17 | Kommentar-Inbox, Einzel/CSV/JSON, Antwortentwürfe, bewusste Freigabe | intelligence.tsx, commands.ts | Injection-Test ohne Aktion; echte Antwortgenerierung im E2E |
| 18 | Nullwerte, gewichtete Raten, Korrekturen, Hypothesen/Experimente | domain.ts, intelligence.tsx | Unit-Analytics und KI-Lernschleife im E2E |
| 19 | Director zeigt Plan und führt typisierte Aktionen auf echten Objekten aus | commands.ts, intelligence.tsx | Commandvalidierung, kein Shellwerkzeug; verfügbare Objektselektion |
| 20 | Offizielle CLI-Auth, spawn/STDIN, Schema, Timeout, Abbruch, reale Isolation | runner/provider.ts, isolate.c | Codex live; beide Dashboard-Loginwege bis offiziellem Link geprüft; Gemini-Modelltest ausstehend |
| 21 | PostgreSQL-Outbox, Leases, Versuche, Wiederaufnahme, begrenzte Retries, Reservierungen | jobs.ts, worker/main.ts, budgets.ts | Konkurrenz-/Deduplizierungs-/Recoverytests |
| 22 | Relationale Tabellen, FK, Versionen, stringbasierte externe IDs | migrations | frische Migrationen, Eigentümer-/Versionstests |
| 23 | Tarif/Herkunft/Nachweise/Terms/Rechtestatus, manuelle Betreiberfreigabe | rights_records, RightsForm | Videorechte vor Freigabe geprüft |
| 24 | Sessions, Hashes, Originprüfung, parameterisierte SQL, Uploadvalidierung, Token-AES, OAuth-State | security.ts, API-Routen, Landlock | Sicherheits-/Webhook-/Datei-/Prozess-/Eigentümertests |
| 25 | Start/Stop/Diagnose, Migrationen, Backup/Restore, keine Auth im Backup | scripts, Compose, OPERATIONS | lokaler Start und HTTPS-Serverdeployment; echter Restore und DB-Neustart bestanden |
| 26 | Meilensteine mit Fortschritt | IMPLEMENTATION_PLAN | laufender Abnahmestand |
| 27 | Unit/Integration/Browser, echte Medien, getrennte Testdaten | tests | TEST_REPORT mit ausgeführten Ergebnissen |
| 28 | Dokumentation und ehrliche Übergabe | docs, README, AGENTS, GEMINI | HANDOVER |
| 29 | Erweiterungsfähige Providergrenzen, TikTok zuerst | providers/contracts.ts | keine zusätzlichen Plattformbehauptungen |
| 30 | Offizielle Quellen als Ausgangspunkt | INTEGRATION_MATRIX | Prüfdatum und Rechteblocker |

## Produktgrenzen
Aktuelle plattformweite Trendrecherche, automatisches Audio-Alignment, Stimm-/Gesichtsgarantie, Lippensynchronität, automatisches Training und öffentliche Direktposts werden nicht angeboten. Storyboards und Produktionsaufträge sind echte Textartefakte. Bilder/Videos werden ohne zusätzlich verbundenen Provider importiert. Manuelle Exporte sind vollständige Arbeitswege.

Einzelbetreiber, mehrere Künstler und Konten sind der Betriebsumfang. Das Rollenfeld ist für spätere Zusammenarbeit vorbereitet; ein Team- und Einladungsprodukt wird nicht vorgetäuscht.

## Ergänzung 2026-09-20: Produktionsweg für Musikvideos

Verbindlicher Standard: importierte Künstlerbilder und Suno-MP3 werden lokal mit FFmpeg zu TikTok-MP4 zusammengesetzt (`src/components/video.tsx`, `src/server/media.ts`, Kern-E2E). Echte KI-Video-Szenen sind ein optionaler Zusatz (`src/providers/veo.ts`, `src/server/video-generation.ts`, `src/components/veo.tsx`), mit gesonderter API-Verbindung, Budget und Zustimmung. Nachweis: `tests/veo.test.ts` (inklusive tatsächlicher Audiofrequenzprüfung) und `tests/e2e/veo.spec.ts` (simulierter Google-Anbieter, reale Medien). Kein Veo-Liveerfolg behauptet.

## Ergänzung: autonome tägliche Artist-Produktion

| Nutzeranforderung | Implementierung | Nachweis |
|---|---|---|
| Ein Knopf, optionale Vorgaben, Charakter/Bio/Porträt durch KI | `CreateAutomaticArtist`, `auto_create`, `auto_identity`, Bildprovider | `zzz-automation.spec.ts`: echte Codex-Identität und echtes Porträt |
| Hauptporträt in allen späteren Bildaufträgen | `artist_automations.reference_asset_id`, erzwungene Backend-Zuordnung | `automation.test.ts`: Client ohne Referenz wird korrigiert; Browserlauf mit echtem Referenzbild |
| Täglich Song entwickeln und produzieren | `tickAutomation`, `auto_song`, versionierte Suno-Budgetfreigabe | Tages-/DST-/Ausfall-/Doppel-/Pause-/Not-Aus-Tests; Suno-Reservierung ohne externe Zahlung |
| Manuelle Aufgaben statt verstreuter Formulare | `manual_tasks`, eigene Navigationsseite, Paket/Copy/Upload | vollständiger Browserlauf mit zugeordnetem MP3-Import und automatischer Fortsetzung |
| Automatisch drei MP4 + Beschreibungen | persistente `automation_clips`, FFmpeg-Projekte/Renderings/Posts | drei echte 1080×1920-H.264/AAC-Dateien, vollständige Dekodierung |
| Video herunterladen, TikTok selbst veröffentlichen | `delivery`-ZIP, `PublishTask`, `auto_publish` | echtes ZIP, Versionskonflikt, manueller Nachweis; kein externer TikTok-Post |
| Datenbasierte nächste Idee | Katalog, Kommentare, Insights, `summarizeMetrics`, gespeicherte `data_basis` | Unit-/Integrationstest prüft tatsächliche Messwerte, fehlende Werte und Quellen-IDs |
| Neustart ohne doppelten kostenpflichtigen Auftrag | dauerhafte Stufen, deterministische Jobschlüssel, vorhandene External-State-Sperren | wiederholte Schedulerläufe, offene Übergaben, unklarer Suno-Zustand, alte Recoverytests |

Bestehende Artists werden nur auf ausdrücklichen Start hin automatisiert. Automatische Bildreferenzfreigabe bedeutet ausschließlich visuelle Referenzwahl, keine Rechtsfreigabe. Veo bleibt ein optionaler separat beauftragter Zusatz. Bedienung: [AUTOMATION.md](AUTOMATION.md).

## Ergänzung: vollständiges Musikvideo statt ausschließlich Kurzclips

| Nutzeranforderung | Implementierung | Nachweis |
|---|---|---|
| Ganze Suno-Aufnahme als Hauptvideo | `fullMusicVideoTimeline`, Vorlage `music_video`, tatsächliche ffprobe-Laufzeit | `music-video.test.ts`: 188,784 Sekunden Zeitverteilung; echte Voll-Renderings; Browser-MP4 |
| Viele Bilder passend zu Lyrics und Artist | schema-validiertes Storyboard, 4–24 neue Motive, feste Porträt-/Identitätsversion | echte Lyrics-Auszüge, unterschiedliche Motive, Referenz-/Eigentümerprüfungen |
| Bildgeschichte mit Bewegung und Schnitt | zwei Einstellungen für längere Motive, Kamerafahrten, echte Überblendungen, kurzzeitiger Titel | echte FFmpeg-Dekodierung, Übergangspixeltest, gespeicherte Renderparameter |
| Vollversion automatisch und für bestehende Songs | tägliche Automatik, eigener Dialog unter Manuelle Aufgaben/Video-Studio | Übergang nach Audioimport und tatsächlicher Browser-Download |
| Fertige Szenen behalten; Grenzen respektieren | dauerhafte Szenenaufträge, Budgetstopp, geschützte Fortsetzung und manueller Bildimport | konkurrierender Start, unbekannter Anbieterzustand, Budget und Wiederaufnahme getestet |

Details und konkrete Serverabnahme: [Vollständige Musikvideos](FULL_MUSIC_VIDEOS.md), [Testbericht](TEST_REPORT.md).
