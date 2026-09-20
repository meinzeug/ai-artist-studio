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
