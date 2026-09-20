# Testbericht

Abnahme: **2026-09-20**, Linux/Ubuntu, Node 22.23.1, PostgreSQL 16.15, Redis 7.0.15, FFmpeg 6.1.1, Google Chrome 153.0.8010.47. Produktiv- und Testdaten sind getrennt. Es wurde keine echte öffentliche Veröffentlichung und keine kostenpflichtige Mediengeneration ausgeführt.

## Tatsächlich bestanden

| Prüfung | Ergebnis / Nachweis |
|---|---|
| `npm run typecheck` | bestanden, keine TypeScript-Fehler |
| `npm run build` | Produktionsbuild erfolgreich; Web und API-Routen erstellt |
| `npm test` | **38/38 bestanden**, inklusive Suno-Verbindung/Budgets/Import und CLI-Anmeldespeicher; keine ausgelassenen Tests |
| `npm run test:e2e` | **3 Playwright-Tests bestanden**, zusammen 3,1 Minuten: echte Codex-Kernstrecke, SunoAPI-Dashboard mit Offline-Anbieter und beide offiziellen CLI-Loginlinks |
| `node --import tsx scripts/test-cli.ts` | Codex 0.154.0: tatsächliche strukturierte Antwort mit ChatGPT-Login; Gemini 0.60.0: installiert, Login fehlt verständlich gemeldet |
| `node --import tsx scripts/test-recovery.ts` | tatsächlicher Worker per SIGKILL beendet; zweiter Prozess übernimmt über PostgreSQL-Lease/BullMQ-Stalled-Recovery; Auftrag mit **zwei Versuchen** erfolgreich |
| `node --import tsx scripts/test-restore.ts` | echte Sicherung und Restore in neue DB/Storage; **40 Tabellen / 130 Datensätze identisch, 8 Dateien anhand SHA-256 verifiziert**; echter PostgreSQL-Neustart bestätigt Datenerhalt |
| `node --import tsx scripts/test-ui.ts` | zusätzliche Abnahme der zuletzt geänderten Vorschau und des Drizzle-Lesezugriffs: drei Videos im Browser abgespielt, Desktop 1440px und Smartphone 390px, kein horizontaler Überlauf, keine Browserfehler |
| `npm run diagnose` | PostgreSQL erreichbar, Redis PONG, Web HTTP 200, Runner HTTP 200, ffmpeg/ffprobe verfügbar |

Der abschließende gemeinsame E2E-Lauf endete am **20.09.2026, ca. 15:32 UTC**. Backup/Restore wurde danach mit allen aktuellen Migrationen einschließlich Suno-Tabellen erneut erfolgreich ausgeführt. Der Build wurde anschließend lokal und auf dem Server erstellt. Externe Providerantworten in Suno-Tests sind ausdrücklich simuliert.

### Neue Abnahmen

- SunoAPI: gespeicherter API-Key verschlüsselt und aus Browser-State ausgeschlossen; invalides JSON/Authfehler; doppelte Klicks; konkurrierende Creditlimits; Rückerstattung nur bei eindeutig nicht gesendetem Auftrag; unklarer POST ohne Wiederholung; Statuspolling und tatsächlich decodierter Audioimport mit Deduplizierung; private/reservierte Downloadziele gesperrt.
- CLI-Login: offizielle Links aus ANSI-Ausgabe, fremde Loginhosts verworfen, eigene Authdateien/Refresh statt Änderung globaler Anmeldung, API-Key-Modus abgewiesen. Beide echten CLIs erzeugten lokal und auf dem Server einen Loginlink. Browser: Dialoge, Linkhosts, Abbruch und Originprüfung bestanden. Persönliche Zustimmung nicht stellvertretend durchgeführt.
- Server: A-RRset zeigt auf 91.99.217.84; TLS-Zertifikat validiert; HTTPS-Health 200, private State-API 401, fremde Erstregistrierung ohne gültigen Setupcode 403. Leere Produktionsdatenbank bleibt erhalten. Isolierter Codex-Versionsaufruf unter Landlock erfolgreich. Bestehender anderer Dienst weiterhin aktiv.
- `npx tsx scripts/test-deployment.ts`: echte HTTPS-Startseite bei 1440px und 390px, Einrichtungscodefeld, keine JS-Fehler und kein horizontaler Überlauf. Nachweis `docs/test-evidence/deployment.json`.

## Alle 20 verbindlichen Szenarien

| Nr. | Szenario | Ausführung / Beleg |
|---|---|---|
| 1 | Frische Einrichtung und erster Login | Playwright richtet leere Testdatenbank über echte Oberfläche ein; Logout/Login ebenfalls bestanden |
| 2 | Künstler erstellen, ändern, neu laden | echter Browser; zusätzlich konkurrierende Versionsänderungen im DB-Integrationstest |
| 3 | CLI erkennen und fehlende Anmeldung | echte lokale Versionserkennung; fehlendes Gemini-OAuth tatsächlich geprüft |
| 4 | Strukturierte CLI-Antwort übernehmen | echtes Codex: Verbindung, Idee, Lyrics; gespeicherte Fachobjekte geprüft |
| 5 | Fehlerhaftes JSON, Timeout, Quota | Unit: ungültiger Gemini-JSON-Envelope, Codex-Fehlerereignisse, Quota-Klassifizierung; echter harmloser Kindprozess wird bei Timeout/Abbruch beendet. **Keine echte Kontosperre absichtlich provoziert** |
| 6 | Lyrics-Versionen und menschliche Änderungen | geschützte Zeile übernommen; Änderung an geschütztem Text abgewiesen; ungespeicherter Browserentwurf bleibt bei neuer externer Version erhalten; Vergleich/neuen Stand laden geprüft |
| 7 | Suno-Export und Audiozuordnung | echtes ZIP mit Produktionsauftrag; WAV-Upload mit Lyrics-/Song-/Auftragsbezug; Datenbankzuordnung geprüft |
| 8 | Drei echte Videoformate | Charakter/Lyrics, Szenenclip und Visualizer tatsächlich durch FFmpeg gerendert |
| 9 | Auflösung, Dauer, Audio, Abspielbarkeit | alle drei MP4: 1080×1920, je 3 Sekunden, H.264/AAC, yuv420p; ffprobe, vollständige FFmpeg-Dekodierung und Browserwiedergabe |
| 10 | Freigabe nach Änderung ungültig | Caption nach Freigabe geändert; ungültiger Snapshot erkannt; nach erneuter Freigabe ZIP exportiert |
| 11 | Doppelte Jobs/Klicks | parallele gleiche Idempotenzschlüssel erzeugen einen Job/eine Reservierung; Produktionsworkflow ebenfalls idempotent. Suno-POST zusätzlich mit simuliertem Anbieter auf Einmaligkeit geprüft |
| 12 | Unklarer externer Zustand | abgelaufener externer Auftrag wird `unknown_external_state`; kein automatischer Neuauftrag, manuelles Retry abgewiesen |
| 13 | Neustart mitten im Job | tatsächlicher Worker-Abbruch, verlorener BullMQ-Lock und erfolgreicher zweiter Versuch. Für kürzere Testdauer wurde **nur der gespeicherte Lease-Ablauf vorgezogen**, nicht das Ergebnis simuliert |
| 14 | Gleichzeitige Budgets | sechs konkurrierende Starts bei Limit zwei: genau zwei Reservierungen erfolgreich; unbekannte Kosten und fehlende Freigabe blockiert |
| 15 | Fehlende Kennzahlen | `null` bleibt fehlend, insbesondere Watchtime; keine Rate bei fehlendem Nenner; kumulative Werte nicht summiert; gewichtete Rate, unterschiedliche Messzeiten und sinkende Zähler getestet |
| 16 | Sommerzeit | nicht existierende Uhrzeit abgewiesen; doppeldeutige Uhrzeit braucht Wahl; früherer/späterer Zeitpunkt korrekt auf UTC aufgelöst |
| 17 | Manipulativer Kommentar | DB-Test: kein Job aus Kommentartext; E2E: echter CLI-Antwortentwurf auf Injection-Text ohne zusätzlichen Veröffentlichungsversuch |
| 18 | Falsche/doppelte Webhooks | HMAC, Zeitfenster und Payloadmanipulation geprüft; doppeltes Ereignis dedupliziert. OAuth-State zusätzlich einmalig und Mock-Wiederverbindung idempotent geprüft |
| 19 | Ungültige Dateien/Namen | Pfadmanipulation und unerlaubte Inhalte abgewiesen; synthetisches gültiges Audio/Bild tatsächlich decodiert |
| 20 | Backup und Restore | produktiver Backup-/Restorecode ausgeführt; neue separate DB und neuer Storage; vollständige Datensatz-Fingerprints und Dateihashes verglichen; Datenbank neu gestartet |

Zusätzlich geprüft: sichere Passwortprüfung, AES-GCM-Rundlauf, fremde Eigentümer, Not-Aus, ASS-Textinjektion, begrenzte Prozessausgabe, Landlock-Datei-/TCP-Sperre, ausdrückliches Verbot unbeabsichtigter API-Key-Abrechnung und Abbruch wartender abhängiger Jobs.

## Testmedien und Screenshots

Das Testaudio ist ein selbst erzeugtes 4-Sekunden-Sinussignal (440/660 Hz), ausdrücklich **SYNTHETISCHE TESTDATEI**. Das Bild ist selbst erzeugte geometrische Testgrafik, kein echter Künstler. Veröffentlichungslink und Kennzahlen sind explizite Testeingaben; kein realer TikTok-Post wurde behauptet.

Screenshots der tatsächlich laufenden Anwendung: [unveränderte Produktionseinrichtung](screenshots/setup-desktop.png), [Übersicht Desktop](screenshots/overview-desktop.png), [Künstler](screenshots/artists-desktop.png), [Lyrics](screenshots/lyrics-desktop.png), [Video-Studio](screenshots/video-desktop.png), [Auswertung](screenshots/analytics-desktop.png), [Übersicht mobil](screenshots/overview-mobile.png), [Bibliothek mobil](screenshots/library-mobile.png), [Video mobil](screenshots/video-mobile.png), [Kalender mobil](screenshots/calendar-mobile.png). Visuell geprüft; Ladeindikatoren in ungestarteten Videovorschauen wurden durch anklickbare echte Vorschaubilder ersetzt.

Maschinenlesbare Abnahmezusammenfassungen: `docs/test-evidence/`. Ausführungslogs dieser Installation: `.local/unit.log`, `.local/e2e.log`, `.local/recovery.log`, `.local/restore.log`, `.local/cli-test.log`, `.local/ui.log`, `.local/build.log`, `.local/diagnose.log`.

## Nicht ausgeführt / Grenzen des Nachweises

- Docker-Compose-Betrieb: **nicht ausgeführt**, Docker ist hier nicht installiert. Nativer Betrieb ist getestet.
- Gemini-Modellproduktion: **nicht erfolgreich live getestet**, Anmeldung fehlt.
- Bezahlte SunoAPI.org-Liveproduktion, separate Suno Platform, TikTok OAuth/Display/Upload/Direct Post, Business-Kommentare und externe Bild-/Videogeneration: **keine Live-Abnahme**, Zugänge/Berechtigungen fehlen beziehungsweise private Direct-Post-Nutzung ist nicht als zulässig nachgewiesen.
- Suno-Webproduktion und echte TikTok-Handveröffentlichung wurden nicht im Nutzerkonto ausgeführt. Lokaler Paket-/Import-/Export-/Nachweisweg ist getestet.
- Kein unabhängiges Security-Audit, kein Lasttest über große Kataloge, keine mehrstündige Renderabnahme und kein physisches iOS/Android-Gerät. Smartphoneprüfung erfolgte mit realem Chromium in 390px-Viewport.

## Wiederholen

Voraussetzung: eigener Testcluster, `.env` mit `TEST_DATABASE_URL`, laufender Runner und Browser. `npm run test:e2e` setzt ausschließlich `artist_studio_test.public` zurück; niemals auf produktive DB umbiegen. CLI-E2E verbraucht das vorhandene Kontingent. Recovery verwendet ein separates kurzlebiges Schema. Vor `test-restore.ts` alle Studio-Prozesse stoppen, weil der Test den projektlokalen Datenbankdienst tatsächlich neu startet. Die Restore-Datenbank und Dateien bleiben als Prüfbeleg bestehen.

## Zusätzliche Screenshots und Logs

[Suno-Verbindung](screenshots/suno-connect-desktop.png), [Suno-Anleitung mobil](screenshots/suno-guide-mobile.png), [KI-Konten](screenshots/cli-providers-desktop.png), [Google-Dialog mobil](screenshots/cli-login-mobile.png), [echte HTTPS-Ersteinrichtung](screenshots/server-setup-desktop.png). Screenshots der Loginanleitung enthalten keine gültigen Geräte-/OAuth-Codes.

Aktueller lokaler Lauf: `.local/final-tests.log`, `.local/final-e2e.log`, `.local/final-typecheck.log`, `.local/final-build.log`, `.local/final-restore.log`, `.local/deployment-browser.log`. Maschinenlesbare Ergebnisse wurden ohne Secrets nach `docs/test-evidence/` übernommen. Server-Buildlog: `/var/log/artist-studio-build.log`.
