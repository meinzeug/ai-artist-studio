# Testbericht

Abnahme: **2026-09-20**, Linux/Ubuntu, Node 22.23.1, PostgreSQL 16.15, Redis 7.0.15, FFmpeg 6.1.1, Google Chrome 153.0.8010.47. Produktiv- und Testdaten sind getrennt. Es wurde keine echte öffentliche Veröffentlichung und kein zusätzlicher kostenpflichtiger Medien-API-Auftrag ausgeführt. Native Codex-Text-/Bildtests nutzen das bestehende ChatGPT-Kontingent.

## Fehlerkorrektur: MP3 mit eingebettetem Cover (2026-09-20)

- Ursache mit der vom Betreiber bereitgestellten MP3 reproduziert: ffprobe meldet das JPEG-Cover als Videospur mit `disposition.attached_pic=1`. Die bisherige Erkennung klassifizierte deshalb die komplette Aufnahme als Video. Aufgabe, Song und Auftrag waren korrekt zugeordnet.
- Der Import berücksichtigt jetzt die Cover-Disposition. Originalbytes, Cover und Dateihash bleiben erhalten. Echte Videospuren bleiben Video; ein falscher Dateiname oder Browser-MIME-Typ umgeht diese Prüfung nicht. Fehlermeldungen unterscheiden Dateityp, Auftragszuordnung und bereits geschlossene Aufgaben.
- `npm run typecheck`, `npm run build` und **71/71 Unit-/Integrationstests** bestanden, einschließlich drei neuer Tests mit tatsächlich erzeugter MP3 samt Cover, MP3 ohne Cover und MP4 mit irreführendem Dateinamen.
- `npm run test:e2e -- tests/e2e/covered-audio.spec.ts`: **1/1 bestanden, 50 Sekunden**. Synthetische MP3 mit Cover über die tatsächliche Aufgabenoberfläche hochgeladen; Song-/Lyrics-/Auftragsbezug und unveränderten Downloadhash geprüft. Automatik beendet die Musikaufgabe und rendert drei MP4 (1080×1920, H.264/AAC, yuv420p, ca. drei Sekunden), alle vollständig mit FFmpeg dekodiert. Falsche Datei, falscher Auftrag und erneuter Import in die abgeschlossene Aufgabe abgewiesen.
- Desktop und 390px-Mobilansicht tatsächlich angesehen; kein horizontaler Überlauf und keine JavaScript-Fehler. Der erste Browserlauf wurde wegen eines zu genauen Testselektors beim Aufgabenzähler beendet; nach Anpassung des Selektors und begrenzten Aktionszeitlimits bestand der vollständige gezielte Lauf.
- Original-MP3 zusätzlich lokal geprüft: Audio, eingebettetes Cover erhalten, 188,784 Sekunden, byteidentische Speicherung. Die Nutzerdatei ist **nicht** im Repository. Keine externe Generierung im Regressionstest. Die übrigen sechs CLI-/Provider-Browserszenarien wurden für diesen Uploadfix nicht erneut ausgeführt; deren letzte Abnahme steht unten.

Nachweise: [Browserergebnis](test-evidence/covered-audio-e2e.json), [Desktop](screenshots/covered-audio-desktop.png), [Mobil](screenshots/covered-audio-mobile.png), `tests/storage.test.ts`, `tests/e2e/covered-audio.spec.ts`. Lokale Logs: `.local/covered-audio-tests.log`, `.local/covered-audio-build.log`, `.local/covered-audio-e2e.log`.

**Serverabnahme:** Fix `1d6e3fc` nach Backup `/var/lib/artist-studio/backups/automation-update-1789922540` installiert; Produktionsbuild als Dienstbenutzer erfolgreich. HTTPS-Health 200, Web/Worker/Runner aktiv, beide geänderten Quellhashes identisch mit Git. Bereitgestellte Original-MP3 über die authentifizierte Uploadroute im vorhandenen Produktionsauftrag übernommen (HTTP 200, Audio/MPEG, 188,784 Sekunden, Cover erhalten). Originalhash und Song-/Auftragsbezug erfolgreich geprüft; die bisher offene Musikaufgabe ist `done`, der bestehende Lauf wurde automatisch fortgesetzt. Kurzlebige Prüfsession und temporäre Übertragungskopie anschließend entfernt. Keine Rechtefreigabe oder öffentliche Veröffentlichung stellvertretend vorgenommen.

**Reale Folgeproduktion abgeschlossen:** Die vorhandene Automatik hat das Bildmaterial erzeugt und alle drei Videos erfolgreich gerendert; Lauf `delivery/ready`. Drei offene Veröffentlichungsaufgaben mit Beschreibungen und Downloads vorhanden. Die tatsächlichen Serverdateien wurden mit ffprobe und SHA-256 geprüft: alle 30 Sekunden, 1080×1920, H.264/AAC, yuv420p. Beiträge bleiben `waiting_for_approval`. Die vollständige Dekodierung wurde im synthetischen Regressionstest geprüft; auf dem Server wurden die erzeugten Originalproduktionen zusätzlich geprobt. [Deployment- und Produktionsnachweis](test-evidence/covered-audio-deployment.json).

## Aktuelle Erweiterung: Künstlerautomatik

- **68/68 Unit-/Integrationstests** bestanden; nach zusätzlicher Bindung der Suno-Verbindung vor dem Versand **21/21 Automatik-/Suno-Tests** erneut bestanden.
- Typprüfung und Produktionsbuild bestanden.
- Neuer isolierter Playwright-Autonomielauf **1/1 bestanden** (6,4 Minuten): echte Codex-Character-Bible, Hauptporträt, Lyrics und Bildszene mit tatsächlich übergebener Referenz; synthetische 6-Sekunden-MP3 über die manuelle Aufgabe importiert; drei FFmpeg-Videos ohne weitere Produktionsklicks; Downloadpaket und manueller Veröffentlichungsnachweis.
- Alle drei MP4: 1080×1920, H.264/AAC, yuv420p, etwa 6 Sekunden; tatsächlich durch ffprobe und vollständige FFmpeg-Dekodierung geprüft. Keine echte Suno-Erzeugung und kein realer TikTok-Upload.
- Neue Tests: einmalige Artist-Anlage bei gleichzeitigen Klicks; Tages-/DST-Planung und kein Nachholstapel; Pause/Not-Aus; Versionsbindung an Budget/Provider; strukturierte Ergebnisse und Identitätskonflikte; feste Porträtreferenz; Datenbezug der nächsten Songidee; kein Neuauftrag bei unklarem Suno-Zustand.
- Desktop/390px-Mobil geprüft: [Erstellung](screenshots/automation-create-desktop.png), [Erstellung mobil](screenshots/automation-create-mobile.png), [Suno-Aufgabe](screenshots/automation-suno-task-desktop.png), [fertige Videos](screenshots/automation-videos-desktop.png), [Videos mobil](screenshots/automation-videos-mobile.png). Der gefundene schwarze Startframe im Szenencover wurde durch Auswahl eines späteren Videoframes korrigiert.
- Nachweis: [automation-e2e.json](test-evidence/automation-e2e.json). Abschließende Gesamtregression: **6/6 Playwright-Szenarien bestanden (10,7 Minuten)**. Erneuter Backup/Restore: **50 Tabellen / 288 Datensätze identisch, 22 Dateihashes geprüft, PostgreSQL-Neustart bestanden**. Nachweise: [Gesamttests](test-evidence/automation-tests.json), [Restore](test-evidence/automation-restore.json). Der zusätzliche Suno-Versionsschutz wurde separat mit den 21 Automatik-/Suno-Tests geprüft; finaler Build/Typprüfung erfolgreich.

## Ursprüngliche Kernabnahme

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
- Bezahlte SunoAPI.org-Liveproduktion, separate Suno Platform, TikTok OAuth/Display/Upload/Direct Post, Business-Kommentare sowie Gemini-Bild-API/Veo: **keine Live-Abnahme**, Zugänge/Berechtigungen fehlen beziehungsweise private Direct-Post-Nutzung ist nicht als zulässig nachgewiesen.
- Suno-Webproduktion und echte TikTok-Handveröffentlichung wurden nicht im Nutzerkonto ausgeführt. Lokaler Paket-/Import-/Export-/Nachweisweg ist getestet.
- Kein unabhängiges Security-Audit, kein Lasttest über große Kataloge, keine mehrstündige Renderabnahme und kein physisches iOS/Android-Gerät. Smartphoneprüfung erfolgte mit realem Chromium in 390px-Viewport.

## Wiederholen

Voraussetzung: eigener Testcluster, `.env` mit `TEST_DATABASE_URL`, laufender Runner und Browser. `npm run test:e2e` setzt ausschließlich `artist_studio_test.public` zurück; niemals auf produktive DB umbiegen. CLI-E2E verbraucht das vorhandene Kontingent. Recovery verwendet ein separates kurzlebiges Schema. Vor `test-restore.ts` alle Studio-Prozesse stoppen, weil der Test den projektlokalen Datenbankdienst tatsächlich neu startet. Die Restore-Datenbank und Dateien bleiben als Prüfbeleg bestehen.

## Zusätzliche Screenshots und Logs

[Suno-Verbindung](screenshots/suno-connect-desktop.png), [Suno-Anleitung mobil](screenshots/suno-guide-mobile.png), [KI-Konten](screenshots/cli-providers-desktop.png), [Google-Dialog mobil](screenshots/cli-login-mobile.png), [echte HTTPS-Ersteinrichtung](screenshots/server-setup-desktop.png). Screenshots der Loginanleitung enthalten keine gültigen Geräte-/OAuth-Codes.

Aktueller lokaler Lauf: `.local/final-tests.log`, `.local/final-e2e.log`, `.local/final-typecheck.log`, `.local/final-build.log`, `.local/final-restore.log`, `.local/deployment-browser.log`. Maschinenlesbare Ergebnisse wurden ohne Secrets nach `docs/test-evidence/` übernommen. Server-Buildlog: `/var/log/artist-studio-build.log`.

## Erweiterungsabnahme: FFmpeg-Standard und optionale Veo-Szenen (20.09.2026)

- `npm test`: **47/47 bestanden**. Neun zusätzliche Veo-/Medientests prüfen verschlüsselte Verbindung ohne kostenpflichtigen Test, Berechtigungen, Schema, Kostenfreigabe, Not-Aus, gleichzeitige Budgetreservierung, Idempotenz, unklare POST-Antwort, Neustart/Wiederaufnahme, manuelle Statuszuordnung, Deduplizierung, Dateiprüfung und Fehlerrückmeldung. Nach abschließender Ergänzung der Coveranalyse: Veo-Tests **9/9 erneut bestanden**.
- `npm run typecheck` und `npm run build`: **bestanden**. Keine neuen npm-Abhängigkeiten.
- `npm run test:e2e`: **4/4 bestanden** (4,1 Minuten): vollständige Kernstrecke mit echtem Codex; Suno mit simuliertem Anbieter; optionaler Veo-Weg mit simuliertem Google; tatsächliche CLI-Loginlinks/Abbruch.
- Der Veo-Browsertest verbindet einen absichtlich simulierten Google-Anbieter, prüft Fehler bei falschem Key, zeigt die Modal-Anleitung, verlangt Bildrechte/Kostenfreigabe und importiert eine echte synthetische MP4. Die Szene wird im Editor ausgewählt und in ein echtes vertikales Musikvideo gerendert. Keine bezahlte Google-Produktion.
- Separater FFmpeg-Test: synthetische Videoszene mit **999-Hz-Ton** plus importierte synthetische **440-Hz-MP3**. Ausgabe tatsächlich dekodiert; 1080×1920, H.264/AAC, Laufzeit geprüft. Frequenzmessung belegt dominierende Songspur ohne beigemischten Szenenton.
- Downloadtest: API-Key wird bei Redirect auf anderen Host entfernt; DNS-Adresse wird gepinnt. Keine Tests übertragen einen echten Google-Key.
- Neue Desktop-/390px-Smartphone-Screenshots tatsächlich angesehen. Keine horizontalen Überläufe oder JavaScript-Fehler in der Browserabnahme.
- `scripts/test-restore.ts`: **43 Tabellen identisch, elf Dateihashes verifiziert, echter PostgreSQL-Neustart bestanden**. Dies ist der Sicherungsstand des vollständigen 4-Test-Browserlaufs.

Nachweise: `tests/veo.test.ts`, `tests/e2e/veo.spec.ts`, [Veo-Browserergebnis](test-evidence/veo-browser.json), [Restore](test-evidence/restore-evidence.json), [Desktop](screenshots/video-optional-desktop.png), [Mobil](screenshots/video-optional-mobile.png). Lokale Logs: `.local/veo-all-tests.log`, `.local/veo-tests.log`, `.local/veo-e2e.log`, `.local/veo-build.log`, `.local/veo-restore.log`.

Nicht ausgeführt: echte kostenpflichtige Veo-Generation; kein Kundenschlüssel oder freigegebener Liveauftrag vorhanden. Kein Bildgenerierungsadapter neu aktiviert.

Zusätzlicher eigenständiger Veo-Browsertest verwendet eine synthetische MP3 mit 3,030204 s Laufzeit. Er deckte einen vorhandenen HTML-`step`-Fehler auf: Audiolaufzeiten mit mehr Nachkommastellen blockierten „Projekt speichern“. Zeitfelder im Video-/Audioeditor akzeptieren jetzt beliebige gültige Sekundenwerte; serverseitige Grenzen bleiben aktiv. Der Test prüft ausdrücklich die Browservalidität beider Zeitfelder.

Der eigenständig aus frischer Testdatenbank laufende Veo-/MP3-Browsertest wurde nach der Korrektur erneut ausgeführt: **1/1 bestanden (1,4 Minuten)**, inklusive automatisch erzeugtem Vorschaubild und realem FFmpeg-Rendering. Er ist separat mit `npm run test:e2e -- tests/e2e/veo.spec.ts` ausführbar und benötigt keinen CLI-Login.

### Installierter Stand

Abschließender eigenständiger MP3-/Veo-Browserlauf: **1/1 bestanden (38,3 s)**. Szenenvorschaubild und fertiges MP4 sind sichtbar. Screenshots deaktivieren CSS-Übergänge während der Aufnahme; eine gesonderte Browserprüfung bestätigt die vollständig ausgeblendete mobile Seitenleiste. Kein dauerhafter Layoutfehler.

Server-Update (`45d62b3`): Datenbackup erstellt, Build als `artist-studio` bestanden, Migration 004 ausgeführt. HTTPS `/api/health` **200**, `/api/state` ohne Session **401**, alle drei systemd-Dienste **active**. SHA-256 von Szenen-Backend, Videooberfläche und Migration stimmt mit dem Repository überein. Keine Provider-Credentials übertragen oder paid Generierung ausgelöst. [Deploymentnachweis](test-evidence/video-deployment.json).

## Erweiterung: Bild-KI auswählen (2026-09-20)

- `npm run typecheck`: bestanden. `npm run build`: bestanden.
- `npm test`: **55/55** bestanden. Acht neue Bildtests prüfen dokumentierte API-Payloads, begrenzte Antworten, verschlüsselte Keys/Geheimnisprojektion, fehlenden ChatGPT-Login, Eigentümer-/Referenz-/Kostenfreigabe, Konkurrenz um Budgets, Doppelklicks, echte Bilddekodierung, unterbrochene Übermittlung ohne zweiten POST, manuelle Klärung und Codex ohne API-Abrechnung.
- Nach Ergänzung der Wiederaufnahme eines bereits übernommenen Bildes: `node --import tsx --test tests/images.test.ts` **8/8** bestanden.
- Direkter eingeschränkter Codex-Runner-Test: echte PNG mit CLI 0.154.0 über vorhandenen ChatGPT-Login, keine separate API-Anmeldung. Synthetisches Testmotiv, keine Künstlerproduktion.
- Voller Playwright-Durchlauf: bisherige vier Szenarien bestanden; Bildgenerierung im fünften Szenario erzeugte/importierte eine echte PNG. Die Oberfläche klappte die Auftragsliste danach zu früh zu. Dieser tatsächliche Bedienfehler wurde behoben; Nachprüfung separat protokolliert.

Gemini-Bild-API wurde mit simulierten Antworten geprüft. Keine kostenpflichtige Gemini-Bildgeneration und keine Übernahme lokaler CLI-Anmeldedaten auf den Server.

### Ergebnis der Bild-Nachprüfung

`npx playwright test tests/e2e/zz-images.spec.ts`: **1/1 bestanden** nach der Korrektur (51,2 Sekunden). Gemeinsam mit den vier bestandenen bisherigen Szenarien sind alle fünf Browser-Szenarien abgenommen; kein zweiter vollständiger Suite-Lauf behauptet. Echter Codex-Aufruf über Dashboard → Worker → isolierter Runner → Bildimport, PNG **1254 × 1254**, Download/Decoder, Rechtezustand, Providerpersistenz, manueller Modus und Desktop/Mobil geprüft; keine Browserfehler. Screenshot-Prüfung führte außerdem zur Entfernung eines veralteten „kein Bildprovider“-Hinweises in der Bibliothek. Nachweis: [image-e2e.json](test-evidence/image-e2e.json).

Backup/Restore des getrennten Bild-Testbestands mit Migration 005: **46 Tabellen, 24 Datensätze, 1 echte generierte Bilddatei**, Tabelleninhalte/Dateihash identisch; PostgreSQL-Neustart bestanden. Dieser kleine Bestand ergänzt den vorherigen Restore der vollständigen Produktionsstrecke. Keine CLI-Anmeldedateien im Backup. [Restore-Nachweis](test-evidence/image-restore.json).

Ansichten: [Provider mobil](screenshots/image-provider-mobile.png), [Generierung Desktop](screenshots/image-generate-desktop.png), [Ergebnis Desktop](screenshots/image-library-desktop.png), [Ergebnis mobil](screenshots/image-library-mobile.png).

## Serverabnahme der Artist-Automatik

`94d325e` mit Migrationen 005/006 auf dem vorhandenen Host installiert, nachdem ein konsistentes Backup erstellt wurde. Build ohne Root, drei aktive Dienste, identische Quellhashes, unveränderter Produktionsbestand. TLS-validierter Healthcheck 200, State ohne Session 401 und mit kurzlebiger anschließend entfernter Prüfsession 200; neue Automatik-Arrays vollständig vorhanden. Tatsächliche HTTPS-Loginseite auf Desktop und Smartphonebreite geprüft; ungültiger Setupcode 403, kein Konto angelegt, keine Browserfehler. Beide CLI-Konten angemeldet, Suno-Verbindung weiterhin nicht eingerichtet. Keine bezahlte Testproduktion und kein öffentlicher Post ausgelöst.

Nachweise: [automation-deployment.json](test-evidence/automation-deployment.json), [automation-deployment-browser.json](test-evidence/automation-deployment-browser.json). Der wiederholbare Deployment-Browsertest unterstützt nun sowohl Erstinstallation als auch eine bereits eingerichtete Anwendung. Lokale Diagnose nach Wiederanlauf erfolgreich.
