# Implementierungsplan und Arbeitsstand

Stand: **2026-09-20**. Arbeit im bestehenden Projektverzeichnis, keine fremden Änderungen überschrieben.

## Phase 0: Bestand und Entscheidung

- Ausgang: Git `main`, Commit `8bf8730`, sauberer Arbeitsbaum, nur leere README. Keine brauchbare bestehende Anwendung.
- Vorhanden: Node 22.23.1, npm 10.9.8, PostgreSQL 16.15, FFmpeg 6.1.1, Codex CLI 0.154.0 mit ChatGPT-Login, Gemini CLI 0.60.0 ohne Runner-Login.
- Docker fehlt. Redis wurde ohne Root lokal extrahiert (7.0.15). Fremde PostgreSQL-/Webdienste wurden nicht verwendet.
- Architektur: modularer TS/Next/React-Monolith mit parameterisiertem PostgreSQL-Datenzugriff, SQL-Migrationen, BullMQ/Redis, separatem Worker und eingeschränktem Runner. Lokaler privater Storage. Drizzle liefert typisierte Künstlerabfragen; komplexe Fachabfragen verwenden explizites `pg`-SQL für Sperren und Transaktionen.

## Ausgeführte Meilensteine

- [x] **Phase 0:** Anforderungen, offizielle Dokumentationsprüfung, Integrationsmatrix und Architektur.
- [x] **Phase 1:** Login/Einrichtung, 13 deutsche Ansichten, Künstler/Identitätsversionen, Einstellungen, privater Storage und persistente Queue. Datenbank-Neustart und Datenerhalt geprüft.
- [x] **Phase 2:** CLI-Runner, Live-Codex-Test, Ideen, Lyrics-Versionen, Vergleich, menschlicher Passagenschutz, Konfliktschutz und Suno-Pakete.
- [x] **Phase 3:** Audiozuordnung zu Song/Lyrics/Auftrag, Originale/Varianten, ffprobe/EBU/Wellenform, Master/Ausschnitte/Timing, Rechte und Charakterreferenzen.
- [x] **Phase 4:** drei echte FFmpeg-Vorlagen, Timeline/Untertitel/Crop, Queuefortschritt/Abbruch, reproduzierbare MP4 und abgeleitete Cover. Drei Dateien vollständig dekodiert und im Browser abgespielt.
- [x] **Phase 5:** Kampagnen/Kalender/DST/Konflikte, Snapshotfreigaben, Exporte und manuelle Veröffentlichungsnachweise. TikTok OAuth/Display implementiert, Verbindung extern blockiert.
- [x] **Phase 6 – lokale Voraussetzungen:** getrennte Providerverträge, Fähigkeiten und konkrete Blocker. Keine erfundenen APIs. **Externe Abnahme offen:** die separate Suno Platform sowie Bild-/Videogeneration benötigen dokumentierten Zugang; TikTok Posting benötigt tatsächliche Zulässigkeit.
- [x] **Phase 7:** Communityimport/Antwortentwürfe, Quellenkennzeichnung, Nullwerte/gewichtete Auswertung/Korrekturen, Erkenntnisse/Experimente und typisierte Director-Aktionen. Live-Lernschleife auf gespeicherten Testmesswerten bestanden.
- [x] **Phase 8:** Typprüfung, Produktionsbuild, Unit/Integration/Playwright, tatsächlicher Worker-Abbruch und Wiederaufnahme, Backup/Restore, Desktop/Mobilprüfung und Betriebsdokumentation.

## Konkrete Abnahmen

Die Kernstrecke wurde mit einer echten Codex-Anmeldung und ausdrücklich synthetischen Medien ausgeführt. Keine Musik-/Bild-/Videogeneration gegen Bezahlung, keine tatsächliche Veröffentlichung. Testdaten liegen ausschließlich in separater DB und privatem Teststorage. Details und die Zuordnung aller 20 Pflichtszenarien: [TEST_REPORT.md](TEST_REPORT.md).

Der Restore verglich nunmehr 40 Tabellen (130 Datensätze) und acht Dateihashes und bestätigte den Datenerhalt nach echtem PostgreSQL-Neustart. Der Wiederaufnahmetest beendete einen echten Worker per SIGKILL; BullMQ und die DB-Lease führten zum erfolgreichen zweiten Versuch.

## Offene externe Abnahmen und Grenzen

1. Gemini offiziell im Runner anmelden und Live-Test wiederholen.
2. TikTok Developer-App/Scopes konfigurieren; OAuth und Display live prüfen. Kein Versprechen einer Direct-Post-Zulassung für dieses private Werkzeug.
3. SunoAPI.org-Schlüssel/Creditfreigabe im Dashboard hinterlegen und echte Providerabnahme durchführen. Die separate Suno Platform benötigt weiterhin eigene Dokumentation/Zugang.
4. Bild-/Videogenerierungsanbieter ausdrücklich auswählen, dokumentieren und Budget freigeben; Uploads funktionieren bereits.
5. Docker Compose auf einem Host mit Docker und Landlock starten und separat abnehmen. Hier wurde der native Betriebsweg ausgeführt.

Nächster nutzerseitiger Schritt: http://127.0.0.1:3210 öffnen, eigenes Betreiberkonto und ersten echten Künstler anlegen. Keine Testdaten oder Standardpasswörter in der Produktionsdatenbank.

## Erweiterungsauftrag – Suno, Kontologin und Server

- [x] Vom Betreiber ausdrücklich gewählten Drittanbieter SunoAPI.org anhand realer Dokumentation integrieren: sichere Verbindung, Credits, Freigabe, einmalige Übermittlung, Polling und automatischer Audioimport.
- [x] Dashboardkarte und aufrufbare Modal-Anleitung, Fehler-/Budget-/Importtests sowie realer Browserlauf mit simuliertem Provider.
- [x] Codex- und Gemini-Anmeldung ohne API-Key direkt unter Einstellungen: offizielle CLI-Flows, eigene Authdateien, Refresh, Abbruch, Zeitlimits, kein globales Überschreiben.
- [x] Beide tatsächlichen Loginlinks lokal, im Browser und auf dem Server geprüft. Persönliche Anmeldung bleibt Nutzer-Schritt.
- [x] Hetzner A-Eintrag artist.dorfspy.de → 91.99.217.84 (TTL 300), gültiges HTTPS und getrennte systemd-Dienste. Fremde Anwendung bleibt erhalten.
- [x] Wirksame Loginpflicht und einmaliger Einrichtungscode für öffentlich erreichbare Erstinstallation geprüft.
- [x] README, Integrationsmatrix, Betriebs-/Sicherheits- und Loginanleitungen aktualisieren.
- [x] Abschließenden gemeinsamen Testlauf (3/3 Browser, 38/38 Unit/Integration) und aktuellen Restore protokollieren.
- [x] Projektquellen und Dokumentation für GitHub übergeben; Geheimnisse und Laufzeitdaten durch .gitignore ausgeschlossen und Inhalte geprüft. Commit-/Remote-Nachweis: git log -1 und origin/main.

Externe Abnahme offen: persönliche Server-Logins, echter SunoAPI-Key und genehmigte Credits; keine bezahlte Testproduktion ohne Nutzerfreigabe. Nächster nutzerseitiger Schritt: HTTPS-Studio mit separat übergebenem Einrichtungscode öffnen und Konten verbinden.

## Erweiterung: FFmpeg als Standard, optionale KI-Videos (2026-09-20)

1. Bestehende drei FFmpeg-Vorlagen als Hauptweg für Künstlerbilder + Suno-Audio hervorheben; Audiomapping und MP4-Ausgabe erneut prüfen.
2. Optionalen Google-Veo-Adapter ergänzen: offizielle REST-Endpunkte, gesonderter API-Key, Dashboard-Verbindung mit Anleitung, manuell bestätigter USD-Tarif und atomare Tages-/Monatsreservierung. Kein bezahlter Liveauftrag ohne Freigabe.
3. Persistente Szenenaufträge, genau ein Übermittlungsversuch, Statusabfrage/Wiederaufnahme, sicherer Download und Import in die vorhandene Timeline. Unklare Übermittlung verhindert erneute Generation.
4. Unit-/Integration-/Browsertests mit ausdrücklich simuliertem Veo; echte FFmpeg-Dateien technisch prüfen, Desktop/Mobil dokumentieren.
5. Dokumentation aktualisieren, geprüfte Änderung committen/pushen und auf dem bereits beauftragten Server installieren.

Externer Blocker: kein Veo-API-Key und keine genehmigte kostenpflichtige Livegeneration. Das betrifft nur optionale KI-Szenen.

### Abnahme der Video-Erweiterung

- [x] FFmpeg-Hauptweg im Video-Studio und in der README sichtbar; alle drei lokalen Vorlagen erhalten.
- [x] Veo-Startbildadapter mit Dashboard/Modal, gesondertem Key, expliziter Kostenfreigabe und atomaren USD-Grenzen.
- [x] Persistente Aufträge, Statusabrufe, Wiederaufnahme ohne zweiten POST, private MP4 und Vorschaubilder, direkte Timeline-Übernahme.
- [x] 47/47 Unit-/Integrationstests sowie 4/4 vollständige Browsertests bestanden. Eigenständiger MP3-/Veo-Browsertest nach Korrektur der Zeitfelder zusätzlich bestanden.
- [x] Backup/Restore mit 43 Tabellen, elf Dateihashes und PostgreSQL-Neustart geprüft.
- [x] Einrichtungs-/Betriebsdokumentation, Integrationsmatrix und Testnachweise aktualisiert.
- [x] Geprüfte Quellen committed/gepusht (`45d62b3`) und auf dem bestehenden Server installiert. HTTPS/Health, Loginpflicht, Dienste und Quellhashes geprüft.

Keine bezahlte Veo-Livegeneration; eigener Google-Key und ausdrückliche Auftragsfreigabe bleiben nötig.

## Erweiterung: auswählbare Bild-KI (2026-09-20)

1. Native Codex-Bildgenerierung mit vorhandener ChatGPT-Anmeldung im eingeschränkten Runner praktisch prüfen; Gemini-Bild-API separat dokumentieren.
2. Eigene Bildprovider-Auswahl unter Einstellungen mit Login/Key, Modell, Grenzen, Status und Modal-Anleitung. Keine automatische Umstellung der Text-KI.
3. Bildauftrag aus Medienbibliothek mit Künstleridentität, optionaler Referenz, Format, expliziter Kontingent-/Kostenfreigabe; dauerhafte Queue, geprüfter privater Bildimport und Herkunft.
4. Tests für Adapter, Rechte, Budgets, Doppelklicks, Fehler und tatsächliche Desktop-/Mobiloberfläche.
5. Dokumentation, Commit, Push und gesichertes Update des vorhandenen dorfspy-Deployments.

### Abnahme der Bild-Erweiterung

- [x] Native Codex-Bilder mit ChatGPT ohne API-Key praktisch geprüft.
- [x] Bild-KI-Auswahl, Verbindung/Modell/Grenzen, integrierter ChatGPT-Login und Modal-Anleitung.
- [x] Echte Bildaufträge aus der Medienbibliothek mit optionaler Referenz, Herkunft und Videoverwendung.
- [x] 55/55 Unit-/Integrationstests; gezielte 8/8 Bildtests nach Wiederaufnahme-Ergänzung. Typprüfung/Produktionsbuild bestanden.
- [x] Vier vorhandene Browser-Szenarien bestanden; Bild-Szenario nach behobenem Aufklappfehler 1/1 bestanden. Echte Codex-PNG aus dem Dashboard, Desktop/Mobil dokumentiert.
- [x] Aktuellen Bildbestand mit Migration 005 tatsächlich gesichert, wiederhergestellt und nach Datenbank-Neustart geprüft.
- [x] Bildfeature gemeinsam mit der Automatik in `94d325e` gepusht und auf dem bestehenden Server installiert. Migration 005 und Runner-Neustart geprüft.

## Erweiterung: autonome Künstlerproduktion (Nutzerauftrag 2026-09-20)

Die Bildprovider-Erweiterung (`d7bb129`) und die neue Autonomie-Erweiterung gehören zur gemeinsamen Lieferung:

1. Ein-Klick-Künstleranlage mit optionalen Vorgaben; KI entwickelt Name, Character Bible, Bio und initiales Hauptporträt.
2. Dauerhafte Automatik pro Künstler, täglicher Kalender in Europe/Berlin, kein doppelter Tag und kein ungeprüftes Aufholen verpasster Tage. Pausieren/Not-Aus/Budgets bleiben wirksam.
3. Songidee, Lyrics, Stilprompt, Szenenidee und drei Beiträge autonom planen; SunoAPI bei ausdrücklich freigegebenen vorhandenen Credits, sonst konkrete Suno-Aufgabe.
4. Eigene Seite „Manuelle Aufgaben“ mit direkt zugeordnetem Audioimport, Verbindungs-/Fehleraufgaben und fertigen MP4/Caption/Veröffentlichungsnachweisen.
5. Hauptporträt automatisch als feste Referenz für spätere Bilder, drei lokale FFmpeg-MP4 erstellen, öffentliche Aktionen weiterhin manuell.
6. Fehlende Zugänge/Budgets/unklare externe Zustände dürfen keine verdeckten Wiederholungen auslösen. Persistente Stufen/Idempotenz und Wiederaufnahme testen.
7. Echte Browserstrecke einschließlich automatischer Künstlerentwicklung, Portrait, manuellem Suno-Import und fertigen Videos prüfen; anschließend beide Änderungen pushen und gemeinsam deployen.

### Abnahme der Automatik

- [x] Migration 006, persistente Tagesplanung, Pausieren/Not-Aus, Versions- und Idempotenzprüfungen.
- [x] Vollständige Artist-/Song-KI, festes Hauptporträt, Suno-API innerhalb bestätigter Grenzen beziehungsweise manuelle Aufgabe.
- [x] Direkter Audioimport mit automatischer Fortsetzung, drei FFmpeg-Projekte/MP4, Captions und Aufgaben-Inbox.
- [x] Entwurfspaket, manuelle Betreiberprüfung und versionierter Veröffentlichungsnachweis.
- [x] Datenbezug tatsächlicher Kennzahlen/Erkenntnisse im nächsten Songplan.
- [x] 68/68 Unit-/Integrationstests, nach zusätzlichem Suno-Versionsschutz 21/21 betroffene Tests erneut bestanden.
- [x] 6/6 komplette Browser-Szenarien mit echten Codex-Texten/Bildern und MP4. Desktop/Mobil visuell geprüft; schwarzes Szenencover korrigiert.
- [x] Finaler Build/Typprüfung und Restore (50 Tabellen, 288 Datensätze, 22 Dateihashes, echter DB-Neustart).
- [x] `94d325e` nach GitHub gepusht und auf artist.dorfspy.de installiert. Vorher Serverbackup, Migrationen 005/006, alle drei Dienste aktiv. HTTPS 200, ohne Anmeldung 401, authentifizierter State 200 und Quellhashes geprüft.
