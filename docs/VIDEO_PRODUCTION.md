# Musikvideos aus Bildern und Suno-Aufnahmen

Stand: **20.09.2026**. FFmpeg ist der reguläre Produktionsweg. Die Anwendung benötigt dafür weder eine Video-API noch eine GPU.

## Standardweg

1. Künstler auswählen. Unter **Medienbibliothek** Künstlerbilder und die rechtmäßig bezogene Suno-MP3 importieren. Audio dem Song und gegebenenfalls dem Suno-Auftrag zuordnen; API-Aufnahmen werden automatisch übernommen.
2. **Video-Studio** öffnen und eine Vorlage wählen: **Charakter & Lyrics**, **Visueller Musikclip** oder **Cover-Visualizer**.
3. Songaufnahme, Start/Ende, Bildmaterial, Szenenreihenfolge, Bildausschnitt und optional Lyrics wählen. Bilder erhalten auf Wunsch eine dezente Bewegung. Bei mehreren Szenen müssen die eingetragenen Dauern den gesamten Ausschnitt abdecken.
4. Projekt speichern und **Video rendern** starten. Rendering läuft im separaten Worker; Fortschritt, Abbruch und Fehler sind im Studio sichtbar.
5. MP4 prüfen, Rechte und Kennzeichnungen hinterlegen, Beitrag freigeben und TikTok-Exportpaket herunterladen.

Ausgabe: **1080 × 1920, H.264, AAC, yuv420p, faststart**, 24/25/30 fps und wählbare Qualität. Originaldateien bleiben erhalten. Alle drei Vorlagen verwenden die ausgewählte Songaufnahme als Tonspur. Eingefügte Videos liefern nur die Bildspur; ihr Originalton wird nicht beigemischt. Kurze Videoszenen werden bei längerer Timeline-Dauer wiederholt.

## Optional: ein Künstlerbild mit Google Veo animieren

**Einstellungen → Provider & Konten → Google Veo verbinden**. Über **Veo-Anleitung** ist dieselbe Hilfe auch im Dashboard als Modal verfügbar.

- Eigenes [Google-AI-Studio-Projekt/API-Key](https://aistudio.google.com/apikey), verfügbare Veo-Berechtigung und API-Abrechnung erforderlich. Die Gemini-CLI-Anmeldung bleibt unabhängig und benötigt weiterhin keinen API-Key für Textaufträge.
- Unterstützt: dokumentierte Preview-Modelle `veo-3.1-fast-generate-preview` und `veo-3.1-generate-preview`, 4/6/8 Sekunden, 720p, 9:16, ein Bild und ein Video pro Auftrag. Das Startbild wird als nachvollziehbare JPEG-Ableitung mittig auf 720 × 1280 zugeschnitten; das Original bleibt unverändert.
- Unter [Google-Preise](https://ai.google.dev/gemini-api/docs/pricing) den aktuellen Modellpreis bei 720p nachsehen. Konservativen **USD-Kostenansatz pro Sekunde**, Tages- und Monatslimit eintragen. Kein Preis ist voreingestellt; 0 USD Limit sperrt Generierungen. Lokale Kostenansätze sind keine Rechnungsbeträge und keine Garantie für die tatsächliche externe Abrechnung.
- Der Verbindungstest verwendet ausschließlich `models.get` und prüft `predictLongRunning`. Das bestätigt den Modellzugriff, keine verfügbare Generierungsquote und keine erfolgreiche Videoproduktion.
- Im Video-Studio **Optionale KI-Szenen öffnen → KI-Szene vorbereiten**. Startbild, Prompt, Dauer und optional Song wählen. Rechte zur Übermittlung an Google und Kosten ausdrücklich freigeben. Personen im Startbild müssen erwachsen sein.
- Der Worker übermittelt genau einen Generierungsversuch und speichert die Google-Auftragskennung. Status wird über kurze separate Jobs abgefragt. Fertige MP4 werden geprüft und mit Hash, Herkunft, Modell, Prompt, Bildreferenz und Kostenansatz privat gespeichert.
- **Im Musikvideo verwenden** öffnet die vorhandene Timeline mit der neuen Szene. Das lokale FFmpeg-Rendering kombiniert sie mit der Suno-Aufnahme; generierter Szenenton ist nicht die finale Tonspur.

Die KI-Videogenerierung liefert zusätzliche Szenen. Sie garantiert keine Lippensynchronität oder unveränderte Gesichtsidentität. Die SynthID-Kennzeichnung des Anbieters wird nicht gezielt entfernt. Rechte stehen nach dem Import auf **Ungeklärt** und müssen vor Veröffentlichung geprüft werden.

## Fehler und Wiederaufnahme

- **Nicht verbunden / Zugriff abgewiesen:** API-Key, Projekt, Modellberechtigung, Abrechnung und Kontingent prüfen. Es gibt keinen automatischen Wechsel des Providers.
- **Budget überschritten:** Limits oder Produktionsumfang bewusst anpassen. Reservierungen sind atomar; doppelte Klicks mit derselben Auftragskennung erzeugen keinen zweiten Auftrag.
- **Unklarer externer Zustand:** Übermittlung kann bei Google angekommen sein. Kein automatischer neuer POST. Nach Klärung kann die exakte `operation.name` des bereits bestehenden Auftrags zugeordnet werden. Keine Kennung raten.
- **Fehler beim Statusabruf/Import:** Der bestehende Auftrag kann erneut abgefragt werden. Downloadfehler, Speicherlimit oder Neustart lösen keine neue kostenpflichtige Generation aus. Nach fünf Abruffehlern oder zwei Stunden stoppt die automatische Abfrage und verlangt einen Eingriff.
- **Bereits übermittelt:** Ein lokaler Abbruch beendet keine laufende Google-Generation. Not-Aus verhindert neue lokale Starts. Verbindungstrennung und Künstlerlöschung sind gesperrt, solange externe Aufträge ungeklärt sind.
- **Anbieterergebnis leer/abgewiesen:** Fehler anzeigen und Google-Abrechnung prüfen. Eine verbrauchte oder unklare Reservierung wird nicht automatisch als erstattet behandelt.

## Dokumentationsgrundlage und Abnahme

Geprüft am **20.09.2026**:

- [Veo-REST-Beispiele, Parameter und Grenzen](https://ai.google.dev/gemini-api/docs/veo?hl=en): `POST /v1beta/models/{model}:predictLongRunning`, `GET /v1beta/{operation.name}`, Ergebnis `response.generateVideoResponse.generatedSamples[].video.uri`.
- [Models GET](https://ai.google.dev/api/models): Verbindungstest ohne Generierung.
- [Offizieller Google-SDK-Konverter](https://github.com/googleapis/js-genai/blob/main/src/converters/_models_converters.ts): REST-Felder `instances[].image.bytesBase64Encoded`, `mimeType`, `parameters.sampleCount`.
- [Preise](https://ai.google.dev/gemini-api/docs/pricing): separate API-Abrechnung; keine aus CLI-Login abgeleitete kostenlose Nutzung.

Implementiert und mit ausdrücklich simulierten Google-Antworten geprüft. Reale lokale Test-MP4 und synthetische MP3 werden tatsächlich verarbeitet und dekodiert. **Kein Veo-Kundenschlüssel hinterlegt, keine kostenpflichtige Livegeneration ausgeführt.** [Testbericht](TEST_REPORT.md), [Integrationsmatrix](INTEGRATION_MATRIX.md).
