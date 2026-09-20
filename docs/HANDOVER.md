# Übergabe – AI Artist Studio

Stand **2026-09-20**. Implementierung im bestehenden Repository `/home/dennis/ai-artist-studio`, Ausgangscommit `8bf8730`. Keine fremden Änderungen verworfen und keine fremden Projekt-Credentials übernommen.

## Aktuelle Erweiterung: sofort eine weitere Produktion

Unter **Manuelle Aufgaben → Neue Produktion** kann ein bestehender Artist einen weiteren Song entwickeln, ohne bis zum nächsten Tageslauf zu warten. Der Bestätigungsdialog bindet die aktuellen Provider-Versionen; offene Produktionen, Not-Aus und Budgetgrenzen bleiben wirksam. Migration 008 trennt geplante Tagesläufe von zusätzlichen Starts mit eigener Deduplizierungskennung. Künstleridentität, Hauptporträt und Tagesplanung bleiben bestehen. 82 Unit-/Integrationstests, Typprüfung, Build und gezielter Playwright-Test bis zum Suno-ZIP bestanden. Die Browserprüfung verwendet einen ausdrücklich synthetischen Textprovider. Code **29eca50** ist auf dorfspy installiert; zusätzlich wurde über das echte Dashboard genau ein neuer Lauf gestartet und mit realem Codex bis zur gespeicherten Idee, Lyrics, Stilprompt und heruntergeladenem Suno-ZIP beobachtet. Termin und Porträt unverändert. Die offene manuelle Suno-Aufgabe benötigt jetzt die neue Aufnahme; für diesen neuen Song ist noch kein MP4 vorhanden. [Live-Nachweis](test-evidence/manual-production-live.json).

Auf dorfspy wurden die Codex-Bildlimits auf ausdrücklichen Wunsch auf **100/Tag und 1000/Monat** erhöht und die bestehende Artist-Automatik erneut bestätigt. SunoAPI.org ist weiterhin nicht verbunden; die nächste tatsächliche Aufnahme muss im manuellen Auftrag produziert/importiert werden.

## Anwendung öffnen

**https://artist.dorfspy.de** — produktiver Server `91.99.217.84`, Zugriff über Caddy/HTTPS. Hetzner-DNS A-Eintrag angelegt, Let’s-Encrypt-Zertifikat erfolgreich ausgestellt. Web, Worker und Runner laufen als eigene automatisch startende systemd-Dienste; die vorher vorhandene Anwendung bleibt in Betrieb.

Die erste Registrierung erfordert einen einmaligen Einrichtungscode. Der Code wurde ausschließlich lokal unter `.local/server-einrichtung.txt` (0600, gitignoriert) bereitgestellt und liegt serverseitig in der geschützten `/etc/artist-studio/web.env`. Danach eigene E-Mail und eigenes Passwort wählen. Weitere Registrierungen werden abgewiesen.

Lokaler Start bleibt möglich: `npm run services:start`, `npm run db:migrate`, `npm run build`, `npm run studio:start` → http://127.0.0.1:3210. Stop: `npm run studio:stop`. [Betrieb](OPERATIONS.md), [Server-Provisionierung](../scripts/deploy/README.md).

## Neue Verbindungen im Dashboard

Unter **Einstellungen → Provider & Konten**:

- **ChatGPT verbinden:** tatsächlicher offizieller Codex-Gerätecode, Anmeldung auf OpenAI-Seite, anschließend Live-Texttest.
- **Google verbinden:** tatsächliche interaktive Gemini-Anmeldung, offizieller Google-Link und Codefeld, anschließend Live-Texttest.
- **Suno API verbinden:** eigener SunoAPI.org-Key, Guthabentest ohne Musikproduktion, verschlüsselte Speicherung, Modell und bestätigte Creditgrenzen. Anleitung als Modal direkt im Dashboard.

Auf dem Server sind beide CLIs installiert und bis zum offiziellen Loginlink getestet. **Den aktuellen persönlichen Anmeldestatus zeigt das Dashboard.** Es wurden keine lokalen Authdateien auf den Server kopiert. Suno-Schlüssel werden ausschließlich vom Betreiber im Dashboard hinterlegt. Callbackadresse `https://artist.dorfspy.de/api/suno/callback` wird bei HTTPS vorausgefüllt.

SunoAPI.org ist der vom Betreiber ausdrücklich gewählte Drittanbieter, mit eigenem Konto/Abrechnung. Er ist von der separaten offiziellen Suno Platform zu unterscheiden. [Suno-Anleitung](SUNO_API_SETUP.md), [CLI-Anleitung](CLI_LOGIN.md).

## Funktionierende Produktionsstrecke

**Neue Vollversion:** Lyrics-Storyboard → standardmäßig acht neue KI-Bildmotive mit festem Hauptporträt → Kamerabewegungen, mehrere Einstellungen und echte Überblendungen → vollständiger Song als MP4. Bei neuen Artists vorausgewählt; für bestehende Songs unter Manuelle Aufgaben oder Video-Studio startbar. Einzelne Szenen bleiben bei Unterbrechungen erhalten. Der Titel erscheint nur kurz am Anfang. Zusatz-Kurzclips bleiben separat verfügbar. Migration 007, keine neue Bibliothek. Code `5f03a3b` committed, nach GitHub gepusht und nach Datensicherung auf dorfspy installiert. 79 Unit-/Integrationstests, zwei gezielte Browser-Szenarien und ein abschließender Wiederholungslauf bestanden. Restore: 52 Tabellen / 64 Datensätze und sieben Dateihashes geprüft. [Bedienung und technische Grenzen](FULL_MUSIC_VIDEOS.md).

Künstler/Character Bible → echte KI-Ideen → Lyrics mit Versionen/geschützten Zeilen → Suno-Paket bzw. freigegebener API-Auftrag → Audioimport mit Varianten/Rechten/Analyse → drei echte lokale FFmpeg-Videoformate → Snapshotfreigabe → TikTok-ZIP → manueller Veröffentlichungsnachweis → Kennzahlen und begründete Folgeidee.

Die 14 deutschen Ansichten inklusive Aufgaben-Inbox, privater Dateispeicher, Timeline/Untertitel/Crop, Communityimport, Director-Aktionen, Budgets, Not-Aus und persistente Jobs sind implementiert. SunoAPI-Aufträge werden nur einmal gesendet; unklare Antworten benötigen Statusklärung. Fertige Dateien werden automatisch überprüft und dedupliziert zugeordnet. Der manuelle Suno-Weg bleibt vollständig nutzbar.

## Prüfergebnisse

Aktuelle Vollversion auf dorfspy tatsächlich fertiggestellt: acht neue Codex-Bildmotive mit derselben Porträtreferenz, 16 Einstellungen und **188,8 Sekunden** vollständige Aufnahme. H.264/AAC in 1080×1920; HTTPS-Downloadhash, Browserwiedergabe und komplette Dekodierung erfolgreich. Unter **Manuelle Aufgaben → Vollständige Musikvideos** inklusive Beschreibung herunterladbar. Tägliche Vollvideo-Automatik des betroffenen Artists aktiviert; Budgets unverändert. Die bisherigen 30-Sekunden-Teaser sind zusätzliche Ausgaben. Öffentliche Veröffentlichung weiterhin manuell. [Live-Nachweis](test-evidence/full-music-video-live.json).

Vorherige Uploadkorrektur: MP3-Dateien mit eingebettetem Cover werden als Audio übernommen; Original und Cover bleiben unverändert. 71 Unit-/Integrationstests sowie ein zusätzlicher gezielter Browserlauf von der manuellen Aufgabe bis zu drei realen MP4 bestanden. Fix `1d6e3fc` auf GitHub und dem Server installiert. Die bereitgestellte Nutzer-MP3 wurde mit HTTP 200 importiert, Hash und Auftragsbezug geprüft. Die vorhandene Künstlerautomatik hat alle drei Videos fertiggestellt: je 30 Sekunden, 1080×1920, H.264/AAC, unter „Manuelle Aufgaben“ samt Beschreibung verfügbar. Siehe den aktuellen Abschnitt im [Testbericht](TEST_REPORT.md).

Die vorherige Uploadabnahme bestand 71 Unit-/Integrationstests, Typprüfung und Produktionsbuild. Die letzte vollständige Browserabnahme umfasste sechs Playwright-Szenarien; zusätzlich bestand der gezielte Cover-MP3-Test. Die Kernstrecke wurde mit echter lokaler Codex-ChatGPT-Anmeldung und drei realen MP4-Dateien im Browser getestet. Suno-Dashboard und Produktionsfreigabe mit ausdrücklich simulierten Anbieterantworten bestanden. Beide echten CLI-Anmeldewege bis zum Loginlink und deren Abbruch wurden im Browser geprüft. Desktop/390px-Mobilansichten geprüft und Screenshots gespeichert.

Serverprüfung: gültiges HTTPS, `/api/health` 200, `/api/state` ohne Session 401, Einrichtung ohne gültigen Code 403, beide CLIs erkannt und Loginlinks erzeugt. Keine öffentliche Musikveröffentlichung und keine kostenpflichtige Suno-Livegeneration ausgeführt.

Historische Kernabnahme umfasst tatsächlichen Worker-SIGKILL/Wiederaufnahme sowie echten Backup/Restore einschließlich Dateihashes und PostgreSQL-Neustart. Der aktuelle genaue Stand und Nachweise stehen in [TEST_REPORT](TEST_REPORT.md).

## Noch nötige externe Schritte

| Integration | Nutzer-Schritt / Grenze |
|---|---|
| Codex auf Server | Offizielle Anmeldung am 20.09. erkannt. Bild-KI im Dashboard auswählen. Lokale Text- und Bildproduktion live erfolgreich. |
| Gemini | Server-Anmeldung erkannt; eigene Modellabnahme offen. Gemini-Bild-API separat konfigurieren. |
| SunoAPI.org | Eigenen API-Key und bestätigten Tarif/Creditbudgets eintragen. Adapter/Fehlerfälle sind getestet, echter Provider noch nicht verbunden. |
| Suno Platform | Separate Endpunktspezifikation und Zugang fehlen weiterhin. |
| TikTok OAuth/Display | Registrierte Developer-App, Redirect/Scopes und Kontozustimmung fehlen; implementiert, kein Live-Test. |
| TikTok Posting/Business | Keine Zulassung für private interne Direct-Post-Nutzung behauptet. Export/Handveröffentlichung und manueller Datenimport sind verfügbar. |
| Google Veo (optional) | Dashboard-Verbindung, Startbild-Generierung, Budget und Import implementiert. Separater Google-Key, API-Abrechnung und Liveabnahme fehlen. |
| Bildgenerierung | Codex/ChatGPT, Gemini-Bild-API und manueller Import im Dashboard wählbar. Native Codex-Dateiausgabe live geprüft; Gemini-Key/Abrechnung und Liveabnahme fehlen. |

## Betriebsgrenzen

- Kein Team-Einladungsprodukt, kein unabhängiges Sicherheits-/Lastaudit. Mobile Browseransichten getestet, keine physischen Smartphones.
- Keine garantierte Stimm-/Gesichtsidentität, automatische Wortausrichtung oder perfekte Lippensynchronität.
- Docker Compose geliefert, aber nicht ausgeführt; lokal und auf dem Server wurde der native Ubuntu-Weg abgenommen.
- Server hat etwa 2 GB RAM plus Swap. Worker/Runner arbeiten mit kleiner Parallelität und systemd-Ressourcengrenzen. Umfangreiche Langzeit-/Volllastproduktion wurde nicht geprüft.
- Anmelde- und Verschlüsselungsschlüssel sind nicht im Git-Repository. Runner-Auth gehört nicht in allgemeine Backups.

## Weiterentwicklung

`AGENTS.md` und `GEMINI.md` sind konsistent. Quellcode, Migrationen, Tests, Deployment-Skripte, Dokumentation und echte Screenshots werden auf ausdrücklichen Wunsch des Betreibers nach `origin/main` committed und gepusht. Aktuellen Git-Stand mit `git log -1` prüfen. Externe Fähigkeiten bleiben getrennt nach dokumentiert/implementiert/konfiguriert/live getestet in der [Integrationsmatrix](INTEGRATION_MATRIX.md).

## Ergänzung: lokale Musikvideos und optionale KI-Szenen

Das Video-Studio führt ausdrücklich durch **Künstlerbilder + Suno-MP3 → lokale FFmpeg-MP4**. Ein zusätzlicher aufklappbarer Bereich unterstützt Veo-Szenen mit Startbild, separater Verbindung und Kostenfreigabe. Fertige Szenen lassen sich direkt in die vorhandene Timeline übernehmen; ausschließlich die gewählte Songaufnahme wird als Tonspur exportiert. Einrichtung und Fehlerbehandlung: [VIDEO_PRODUCTION.md](VIDEO_PRODUCTION.md). Keine zusätzliche Bibliothek oder globale CLI-Konfiguration erforderlich; additive Migration `004_video_generation.sql`.

### Video-Update auf dem Server

Anwendungscode `45d62b3` auf **https://artist.dorfspy.de** installiert; Build als unprivilegierter Benutzer `artist-studio`, additive Migration 004 erfolgreich. Backup vor Update: `/var/lib/artist-studio/backups/video-update-1789914069`. Web/Worker/Runner aktiv, HTTPS-Health 200 und State ohne Session 401. Quellhashes zwischen Repository und Server stimmen überein. Lokales Studio ebenfalls wieder unter http://127.0.0.1:3210 gestartet. Kein kostenpflichtiger Veo-Liveauftrag ausgeführt.

## Erweiterung: Bildprovider auswählen

Eigene Bildproviderkarte unter **Jobs & Einstellungen → Provider & Konten**, inklusive Einrichtungsmodal und ChatGPT-Anmeldung. Bilder lassen sich unter **Charakter & Medien** erzeugen, optional mit Künstlerreferenz, Identitätsversion und Songzuordnung. Codex-Bildfunktion mit CLI 0.154.0 im isolierten Runner live erfolgreich (echte PNG, kein API-Key). Gemini-Bild-API separat mit verschlüsseltem Key und bestätigten USD-Ansätzen implementiert. Keine bezahlte Gemini-Bildgeneration. Anleitung: [IMAGE_GENERATION.md](IMAGE_GENERATION.md). Additive Migration 005; kein neues npm-Paket.

## Neu: Artist-Automatik und Manuelle Aufgaben

**Künstler → Artist erstellen** startet Character Bible, Bio, Hauptporträt und erste Songproduktion. Weitere Läufe täglich, Standard 09:00 Europe/Berlin. Optionale Vorgaben, Pause/Uhrzeit und Budgetfreigaben pro Artist. Das Hauptporträt wird für spätere Bilder im Backend als Referenz erzwungen. SunoAPI.org produziert bei bestätigter Verbindung/Budget; sonst erscheinen fertiges Paket und Audio-Upload auf der neuen Seite **Manuelle Aufgaben**. Nach dem Upload laufen referenzbasierte Bildproduktion und drei FFmpeg-Renderings selbständig weiter. Die Aufgaben liefern MP4, Beschreibungen, ZIP und manuellen Veröffentlichungsnachweis.

Additive Migration 006, keine neue npm-Abhängigkeit. Bestehende Artists werden nicht ungefragt aktiviert. Tagesplanung hält bei offenen Produktionsübergaben an und erzeugt keinen Nachholstapel. Vorhandene Auswertung/Katalog/Kommentare fließen in neue Songpläne ein. Ein Textmodell bewertet dabei keine gehörte Musik; Ausschnitte sind Anfang/Mitte/Ende und ohne erfundene Lyrics-Zeitstempel. [Bedienung und Grenzen](AUTOMATION.md).

68 Unit-/Integrationstests und ein vollständiger neuer Browserlauf mit echten Codex-Texten/Referenzbildern sowie drei vollständig decodierten MP4 bestanden. Die abschließende Gesamtregression bestand alle 6 Browser-Szenarien. Backup/Restore: 50 Tabellen, 288 Datensätze und 22 Dateihashes identisch, echter PostgreSQL-Neustart bestanden. Anwendungscode `94d325e` ist auf https://artist.dorfspy.de installiert. Migrationen 005/006 und alle drei Dienste geprüft. Keine bezahlte Suno-/Gemini-/Veo-Generation und kein tatsächlicher TikTok-Post.

### Deployment der Bild-/Automatik-Erweiterung

- Anwendungscode: **94d325e**, einschließlich Bildfeature **d7bb129**, auf GitHub und auf `dorfspy`.
- Sicherung vor Update: `/var/lib/artist-studio/backups/automation-update-1789920350`.
- Build als `artist-studio`; Web/Worker/Runner aktiv, Quellhashes identisch. Bestehender Produktionsbestand erhalten; kein Artist ungefragt automatisiert.
- HTTPS-Health **200**, Daten ohne Session **401**, authentifizierter State mit allen vier neuen Datenbereichen **200**. Für diesen Lesetest wurde nur eine kurzlebige Session angelegt und anschließend entfernt.
- Tatsächliche Server-Loginseite in Desktop/390px-Browser getestet; keine JS-Fehler oder horizontalen Überläufe. Falscher Einrichtungscode weiterhin **403**.
- Beide CLI-Anmeldungen auf dem Server erkannt. Codex meldet native Bildfähigkeit; keine Produktionsgeneration beim Deployment ausgelöst. Suno-Verbindung fehlt weiterhin: eigenen SunoAPI.org-Key und Creditbudgets im Dashboard hinterlegen oder den fertigen manuellen Aufgabenweg verwenden.
- Lokales Studio wieder gestartet: http://127.0.0.1:3210. Diagnose: PostgreSQL, Redis, Web, Runner und FFmpeg erreichbar.

Nachweise: [Server](test-evidence/automation-deployment.json), [HTTPS-Browser](test-evidence/automation-deployment-browser.json), [Tests](test-evidence/automation-tests.json), [Restore](test-evidence/automation-restore.json). Keine CLI-Anmeldedateien auf den Server übertragen.
