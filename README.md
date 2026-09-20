<div align="center">

# AI Artist Studio

### Dein Künstler. Dein Sound. Dein Studio.

Dein selbst gehostetes Studio entwickelt virtuelle Musikkünstler und produziert täglich Songs und fertige TikTok-Videos. Du übernimmst nur notwendige Übergaben.

**Deutsch · Ohne lokale GPU · ChatGPT- und Google-Login · Private Medien**

[Studio öffnen](https://artist.dorfspy.de) · [Artist-Automatik](docs/AUTOMATION.md) · [Installation](docs/OPERATIONS.md) · [Suno verbinden](docs/SUNO_API_SETUP.md) · [KI-Konten verbinden](docs/CLI_LOGIN.md) · [Musikvideos erstellen](docs/VIDEO_PRODUCTION.md)

</div>

![AI Artist Studio – tatsächliche Desktopansicht mit gekennzeichneten Testdaten](docs/screenshots/overview-desktop.png)

## Artist erstellen. Die KI übernimmt.

**Künstler → Artist erstellen**: Name, Musikstil, Aussehen und weitere Wünsche sind optional. Die KI entwickelt Character Bible und Bio, erzeugt das Hauptporträt und startet die erste Songproduktion.

Danach entsteht täglich ein neuer Song mit Lyrics, Musikstil und einem **vollständigen Musikvideo über die gesamte Songlänge**: Die KI schreibt ein Storyboard passend zu den Lyrics, erzeugt standardmäßig acht neue Bildmotive mit Künstlerreferenz und setzt sie mit Kamerabewegungen und weichen Überblendungen um. Zusätzlich entstehen drei Kurzclips samt Beschreibung. SunoAPI.org kann die Musik innerhalb deiner bestätigten Creditgrenzen erzeugen. Ohne API bekommst du unter **Manuelle Aufgaben** ein fertiges Suno-Paket; nach dem MP3-Upload läuft die Videoproduktion automatisch weiter. [Vollständige Musikvideos →](docs/FULL_MUSIC_VIDEOS.md)

Die fertigen Videos stehen dort als MP4 oder ZIP bereit. Du prüfst sie, lädst sie bei TikTok hoch und trägst den Veröffentlichungslink ein. Unter **Manuelle Aufgaben → Neue Produktion** kannst du auch sofort einen weiteren Song starten. Produktionszeit, Pause und Budgets sind pro Artist einstellbar. Das Hauptporträt bleibt die feste Bildreferenz; perfekte Gesichtsgleichheit ist nicht garantiert. [Ablauf, Voraussetzungen und Fehlerbehandlung →](docs/AUTOMATION.md)

## Ein durchgängiger Produktionsweg

```mermaid
flowchart LR
  A[Künstler & Identität] --> B[KI-Ideen & Lyrics]
  B --> C[Suno-Produktion]
  C --> D[Aufnahmen & Varianten]
  D --> E[Drei Videoformate]
  E --> F[Freigabe & TikTok-Export]
  F --> G[Veröffentlichungsnachweis]
  G --> H[Auswertung & nächste Idee]
  H --> B
```

| Bereich | Was du damit machen kannst |
|---|---|
| **Automatik & Aufgaben** | KI entwickelt den Artist, plant täglich eine Produktion, übernimmt Suno/FFmpeg und liefert MP4 + Caption. Eigene Inbox für Audioimport, fehlende Zugänge und Veröffentlichungsnachweise. |
| **Künstler** | Mehrere virtuelle Künstler führen, Character Bible versionieren, visuelle und musikalische Referenzen freigeben. |
| **Songwriting** | Echte KI-Ideen und Lyrics erstellen, Passagen gezielt überarbeiten, menschliche Zeilen schützen und Versionen vergleichen. |
| **Suno** | SunoAPI.org im Dashboard verbinden, Guthaben prüfen, Produktion freigeben und fertige Aufnahmen automatisch importieren. Alternativ vollständiges Produktionspaket und manueller Import. |
| **Medien** | Private Dateien, Herkunft/Rechte, Originale und Ableitungen, Audioplayer, Wellenform, technische Analyse und Variantenvergleich. |
| **Video-Studio** | Künstlerbilder + Suno-MP3 lokal mit FFmpeg: Charakter & Lyrics, visueller Szenenclip und Cover-Visualizer: echte MP4 in 1080 × 1920 mit H.264/AAC. Timeline, Untertitel, Crop und Renderqueue. |
| **Veröffentlichung** | Kampagnen und Kalender, unveränderliche Freigaben, MP4/Cover/Caption/Checkliste als ZIP, manuelle Veröffentlichungsnachweise. |
| **Lernschleife** | Kommentare importieren, Antwortentwürfe schreiben, tatsächliche Kennzahlen auswerten und begründete nächste Produktionen planen. |

## Konten verbinden, direkt im Dashboard

### Text-KI ohne API-Key

Unter **Einstellungen → Provider & Konten**:

- **ChatGPT verbinden** startet die offizielle Codex-Geräteanmeldung mit Link und Code.
- **Google verbinden** startet die offizielle Gemini-Anmeldung. Google-Bestätigungscode im Dialog eingeben.
- **Verbindung live testen** prüft das angemeldete Konto durch einen echten kurzen Textauftrag.

Die Konten werden auf dem Computer des separaten Runners verbunden. Tokens bleiben dort; vorhandene globale CLI-Einstellungen werden nicht überschrieben. [Anleitung und Voraussetzungen →](docs/CLI_LOGIN.md)

### Automatische Musikproduktion

Auf der Übersicht **Suno API verbinden** wählen, eigenen Schlüssel eintragen und das Guthaben prüfen. Die **Einrichtungsanleitung** ist jederzeit als Modal verfügbar. Für Generierungen werden Modell, bestätigter Creditbedarf, Tages-/Monatslimit und HTTPS-Rückmelde-Adresse hinterlegt.

**SunoAPI.org ist ein separater Drittanbieter**, mit eigenem API-Konto und Credits. Das Studio speichert den Schlüssel verschlüsselt, verlangt eine Produktionsfreigabe und sendet bei unklarem externem Zustand keinen zweiten Generierungsauftrag. [Einrichtung und Fehlerbehandlung →](docs/SUNO_API_SETUP.md)

### Bilder: deinen Generator selbst wählen

**Jobs & Einstellungen → Provider & Konten → Bild-KI auswählen**: Codex mit deinem ChatGPT-Konto, Gemini über einen separat eingerichteten Bild-API-Key oder manueller Import. Anleitung, Login, Modell und Produktionsgrenzen sind im Dashboard erreichbar.

Unter **Charakter & Medien → Bild generieren** entstehen Porträts, Cover und Videoszenen aus einem Prompt und optional einer Künstlerreferenz. Der Worker übernimmt die echte Bilddatei mit Herkunft und Identitätsversion in die Medienbibliothek. Codex nutzt das vorhandene Kontingent **ohne zusätzlichen API-Key**; kostenpflichtige Bild-APIs benötigen eine ausdrückliche Freigabe. [Einrichtung & Grenzen →](docs/IMAGE_GENERATION.md)

### Musikvideos: Bilder + Suno-Audio

**Der Standardweg ist lokal:** Die Artist-Automatik kombiniert Referenzbilder und Songaufnahme zu drei MP4. Im Video-Studio lassen sich die Projekte zusätzlich selbst gestalten. Drei Vorlagen, Bewegung, Lyrics und Visualizer stehen ohne Video-API bereit.

**Optional: echte KI-Videoszenen mit Veo.** Unter Provider & Konten einen separaten Google-AI-Studio-Key, bestätigten USD-Kostenansatz und Budget verbinden. Im Video-Studio ein Startbild animieren lassen und die importierte Szene direkt im Musikvideo verwenden. Vor jedem Auftrag werden Bildübermittlung und Kosten freigegeben. Der Gemini-CLI-Login allein umfasst diese kostenpflichtige API nicht. [Ablauf, Einrichtung und Grenzen →](docs/VIDEO_PRODUCTION.md)

## Starten

### Eingerichteter Server

**https://artist.dorfspy.de** — Bild-KI und Artist-Automatik sind installiert, HTTPS und drei systemd-Dienste geprüft. Mit dem bestehenden Betreiberkonto anmelden und unter **Künstler → Artist erstellen** starten. Für bestehende Artists **Tägliche Automatik** aktivieren. Codex und Gemini sind auf diesem Server angemeldet; SunoAPI.org bei Bedarf im Dashboard verbinden.

Bei einer frischen Installation schützt ein einmaliger Einrichtungscode die Anlage des Betreiberkontos. Es gibt kein voreingestelltes Login-Passwort.

### Lokal auf Ubuntu

Voraussetzungen: **Node ≥22.12**, PostgreSQL-16-Werkzeuge, FFmpeg/ffprobe, Python 3, C-Compiler und Linux mit Landlock ABI ≥4. PostgreSQL/Redis werden im eigenen Projektverzeichnis betrieben; keine GPU nötig.

```bash
git clone https://github.com/meinzeug/ai-artist-studio.git
cd ai-artist-studio
npm run setup:local
npm run services:start
npm run db:migrate
npm run build
npm run studio:start
```

Öffnen: **http://127.0.0.1:3210**. Eigenes Betreiberkonto anlegen. Stoppen mit `npm run studio:stop`; Diagnose mit `npm run diagnose`.

Docker Compose ist ebenfalls enthalten. Dieser Weg wurde bislang **nicht ausgeführt**. [Betrieb, Compose, Backups und Updates →](docs/OPERATIONS.md)

## Architektur

```text
Next.js / React ── validierte Backend-Aktionen ── PostgreSQL + privater Storage
                                                  │
                                     dauerhafte Jobs / Outbox
                                                  │
                                           Redis / BullMQ
                                                  │
                                                Worker
                                      ┌───────────┼────────────┐
                                   FFmpeg     Suno / Veo   CLI-Runner
                                                           Codex / Gemini
```

TypeScript, Next.js **16.3.5**, React **19.3.0**, PostgreSQL **16**, Drizzle **0.45.2**, BullMQ **6.3.8**. Abhängigkeiten sind exakt in [`package.json`](package.json) und [`package-lock.json`](package-lock.json) gepinnt. Lange Produktionen laufen im Worker. Der Runner hat keine Datenbank-, Musik- oder Social-Tokens. [Architektur →](docs/ARCHITECTURE.md)

## Geprüft – mit klaren Grenzen

- **79 Unit-/Integrationstests** bestanden; Typprüfung und Produktionsbuild erfolgreich.
- Letzte vollständige Browserabnahme: **6/6 Playwright-Szenarien**, mit **echter Codex-Textproduktion** und **drei tatsächlich gerenderten, decodierten und im Browser abgespielten Videos**.
- Zusätzlicher Upload-Regressionslauf: **1/1 bestanden**. MP3 mit eingebettetem Cover über die manuellen Aufgaben übernommen, Original unverändert erhalten und automatisch drei echte MP4 erzeugt. Falsche Dateitypen und Auftragszuordnungen bleiben gesperrt.
- Neue Vollvideo-Abnahme: Storyboard, einzelne Szenenbilder, Wiederaufnahme und ein vollständiges MP4 über 30 Sekunden im Browser geprüft; Desktop/Mobilansichten und echte Überblendungen getestet. Test-KI und Testbilder ausdrücklich synthetisch. [Vollvideo-Anleitung →](docs/FULL_MUSIC_VIDEOS.md)
- Autonome Artist-Erstellung inklusive echtem Porträt, Referenzszene, Suno-Aufgabe, automatischen MP4 und Veröffentlichungsnachweis im Browser bestanden. Restore mit 50 Tabellen und 22 Dateien geprüft.
- Bild-KI im Browser eingerichtet; **echte Codex-PNG ohne API-Key** erzeugt, heruntergeladen und auf Desktop/Smartphone geprüft. Gemini-Bild-API separat mit simulierten Antworten getestet.
- Optionaler Veo-Weg im Browser getestet: Verbindung, Hilfe, Kostenfreigabe, MP4-Import und Übernahme in die Timeline. Zusätzlicher realer Audiotest prüft, dass Szenenton durch die Song-MP3 ersetzt wird.
- Suno-Dashboard, Budgetfreigabe, verschlüsselte Verbindung und Auftrag getestet. Anbieterantworten dabei ausdrücklich simuliert; echte lokale Audioimporte separat geprüft.
- Beide tatsächlichen CLI-Anmeldedialoge im Browser bis zum offiziellen Loginlink geprüft, einschließlich Abbruch und CSRF-Schutz. Kein persönlicher Login stellvertretend durchgeführt.
- Desktop-/Smartphone-Screenshots, Worker-Wiederaufnahme und echter Backup/Restore dokumentiert.
- Server: DNS, gültiges HTTPS, Healthcheck, Loginpflicht und Schutz der Ersteinrichtung geprüft.

```bash
npm run typecheck
npm test
npm run test:e2e
npm run diagnose
```

Tests verwenden eine separate Datenbank. Der CLI-E2E-Test benötigt eine eingerichtete Codex-Anmeldung und nutzt deren Kontingent. Medien und Messwerte der Screenshots sind gekennzeichnete Testdaten. [Vollständiger Testbericht →](docs/TEST_REPORT.md)

### Externe Freischaltungen

| Integration | Stand |
|---|---|
| Codex | Text und native Bilder lokal mit ChatGPT live geprüft. Server-Anmeldung erkannt; Bild-KI im Dashboard auswählen. |
| Gemini | Offizieller Google-Login und Headless-Adapter implementiert; Server-Anmeldung erkannt. Eigenständige Modellabnahme offen; Bild-API benötigt separaten Key. |
| SunoAPI.org | Implementiert und lokal mit simuliertem Anbieter getestet. Eigener Schlüssel und bestätigtes Creditbudget fehlen noch; keine bezahlte Liveproduktion. |
| Suno Platform | Separates Produkt; kein verifizierter Zugang. |
| TikTok OAuth / Display | Implementiert; Developer-App, Scopes und Live-Verbindung fehlen. |
| TikTok Direct Post | Keine Zulassung für ein privates internes Werkzeug versprochen. Freigegebener Export ist der produktive Veröffentlichungsweg. |
| Google Veo (optional) | Bild-zu-Video-Adapter, Dashboard, Budgetfreigabe, Statusabruf und Import implementiert; Tests mit simuliertem Google. Kein Key, keine bezahlte Livegeneration. |
| Bildgenerierung | Codex/ChatGPT und Gemini-Bild-API auswählbar; Dashboard, Hilfe, Referenzen, Budgets und echter Bildimport. Native Codex-Dateiausgabe live geprüft, Gemini-API simuliert getestet. |

## Dokumentation

[Produkt & Anforderungsmatrix](docs/PRODUCT_SPEC.md) · [Implementierungsplan](docs/IMPLEMENTATION_PLAN.md) · [Integrationsmatrix mit Quellen](docs/INTEGRATION_MATRIX.md) · [Sicherheit](docs/SECURITY.md) · [Betrieb](docs/OPERATIONS.md) · [Deployment](scripts/deploy/README.md) · [Testbericht](docs/TEST_REPORT.md) · [Übergabe](docs/HANDOVER.md)

<sub>Arbeitstitel in den Studio-Einstellungen änderbar. Keine Werbewasserzeichen. Keine heimlichen API-Fallbacks. Öffentliche Aktionen bleiben kontrolliert.</sub>
