# Bild-KI einrichten und verwenden

Stand: **20. September 2026**. Bild-KI und Text-KI werden unabhängig gewählt.

## Im Dashboard

1. **Jobs & Einstellungen → Provider & Konten → Bilder & Charakterdesign → Bild-KI auswählen** öffnen.
2. Gewünschten Weg wählen: **Codex · ChatGPT-Konto**, **Gemini · Bild-API** oder **Manueller Import**.
3. Verbindung prüfen und Tages-/Monatsgrenzen festlegen. Die Modal-Anleitung ist direkt über **Bild-KI-Anleitung** erreichbar.
4. Unter **Charakter & Medien → Bild generieren** einen Künstler, Bildname, Motiv, Format und optional ein Referenzbild auswählen. Eine freigegebene Hauptporträt-Referenz wird vorgeschlagen.
5. Übermittlung und Kontingent-/Kostenverbrauch ausdrücklich bestätigen. Der Auftrag läuft im Worker; das Ergebnis erscheint mit Vorschau in derselben Medienbibliothek.
6. Über **Bild & Rechte** prüfen, als Künstlerreferenz vorschlagen und Rechte dokumentieren. Im Video-Studio mit der Suno-MP3 kombinieren.

Die Bibliothek bietet ebenfalls **Bild-KI ändern**. Neue Bilder werden als eigenständige Assets mit Dateihash, Künstler-/Songzuordnung, Identitätsversion, Prompt, Modell und Referenzbeziehung gespeichert. Sie überschreiben kein Hauptporträt. Nutzungsrechte starten als **ungeklärt**.

## Codex: ohne zusätzlichen API-Key

Die [offizielle Codex-Bildfunktion](https://learn.chatgpt.com/docs/image-generation) verwendet native Bildgenerierung mit `gpt-image-2` und zählt zum Codex-Kontingent. Anmeldung über **ChatGPT verbinden** im Dialog oder in der bestehenden CLI-Karte. Bei selbst gehostetem Betrieb gehört die Anmeldung zum Rechner des Studio-Runners; ein Login auf dem eigenen Laptop verbindet nicht automatisch den Server.

**Technisch tatsächlich geprüft:** Codex CLI **0.154.0**, `codex exec --json`, aktivierte native Bildfunktion, STDIN-Prompt und PNG-Dateiausgabe aus dem geschützten Jobverzeichnis. Kein OpenAI-API-Key, kein API-Abrechnungsfallback und keine globale Konfigurationsänderung. Die offizielle Anleitung beschreibt vor allem interaktive Nutzung; unser Headless-Nachweis stammt aus dem echten lokalen Runner-Test.

Reine Textaufträge deaktivieren die Bildfunktion weiterhin. Nur der eigene `/image`-Runnerauftrag schaltet sie ein. Shell, Browser, Apps, weitere Agenten und Websuche bleiben deaktiviert. Landlock begrenzt Dateien und ausführbare Programme; Anmeldedateien bleiben im Runner. Der Webprozess erhält nur Bilddaten und Status.

Die Formate 9:16, 1:1 und 16:9 werden Codex als Bildwunsch übergeben. Die tatsächlichen Pixelmaße stehen am Ergebnis. Der endgültige Zuschnitt erfolgt im Video-Studio. Eine Referenz unterstützt Wiedererkennbarkeit, garantiert aber kein identisches Gesicht. Der Verbindungstest liest Installation und Anmeldestatus; erst eine erfolgreiche Bilderstellung ist ein Bild-Livetest.

## Gemini: ausdrücklich konfigurierte Bild-API

Der normale Google-Login der Gemini CLI ist hier für Textaufträge eingerichtet. Für Bilder verwendet das Studio die separate [Gemini Developer API](https://ai.google.dev/gemini-api/docs/generate-content/image-generation), keinen übernommenen Google-Browsercookie und kein umgewidmetes CLI-OAuth-Token.

- Eigenen Key in [Google AI Studio](https://aistudio.google.com/apikey) erstellen; Modellzugang, Region und Abrechnung selbst prüfen.
- Unterstützte dokumentierte Modelle: `gemini-3.1-flash-image`, `gemini-3-pro-image`, `gemini-2.5-flash-image`.
- REST: `GET https://generativelanguage.googleapis.com/v1/models/{model}` als kostenfreier Metadatencheck; `POST .../{model}:generateContent` für den freigegebenen Auftrag. Auth ausschließlich als `x-goog-api-key`-Header; keine Redirects oder benutzerdefinierten API-Hosts.
- `contents.parts` enthält Prompt und optional eine PNG-Referenz. `generationConfig.responseModalities`, `candidateCount: 1` und `responseFormat.image` folgen den am Prüfdatum dokumentierten REST-Beispielen. 1K-Ausgabe, bei Gemini 2.5 dessen Standardauflösung.
- Ein konservativer USD-Kostenansatz pro Auftrag berücksichtigt Eingaben und Bildausgabe. **Keine Preisgarantie:** [Tarif](https://ai.google.dev/gemini-api/docs/pricing) und Anbieterabrechnung selbst prüfen. Lokale Reservierung ersetzt kein beim Anbieter eingerichtetes Abrechnungsbudget.
- Kein Kundenschlüssel und keine bezahlte Gemini-Bildgeneration durch die Entwicklung verwendet. Adapter und Fehlerpfade mit ausdrücklich simulierten Antworten getestet.

Schlüssel werden AES-GCM-verschlüsselt gespeichert und weder an den Browser noch an die Text-KI zurückgegeben. Beim Wechsel zu Codex oder manuellem Import wird ein bisheriger Bild-API-Key aus dieser Verbindung entfernt; der gesonderte Veo-Key bleibt in dessen eigener Verbindung.

## Grenzen und Wiederaufnahme

- Ein Auftrag zielt auf ein Bild. Falls der Anbieter mehrere Bilder zurückgibt, übernimmt diese Version die erste Bilddatei und dokumentiert deren Anzahl in den Metadaten.
- Tages-/Monatslimits zählen Aufträge über Providerwechsel hinweg. Bei API-Aufträgen werden zusätzlich USD-Ansätze unter derselben Datenbanksperre atomar reserviert. Codex-Kosten sind `null`, nicht 0 USD; sein Verbrauch wird über Auftragsgrenzen und das tatsächliche Accountkontingent begrenzt.
- Doppelklicks mit identischer Auftragskennung erzeugen keinen zweiten Job. Externe Generierung hat einen einzigen Übermittlungsversuch. Kein automatischer kostenpflichtiger Neuauftrag nach Timeout, Verbindungsabbruch oder Prozessneustart.
- Bei **Status unklar** Kontingent/Abrechnung prüfen. Über **Status klären** kann ein bereits importiertes Ergebnis zugeordnet oder der Auftrag mit Prüfnotiz ohne Bild abgeschlossen werden. Ein möglicher Verbrauch bleibt gebucht; diese Zuordnung ist manuell und zählt nicht als Live-Verbindungstest.
- Erfolgreich übernommene Bilder bleiben bei einem Worker-Neustart erhalten. Wird die Antwort vor dem Import verloren, bieten diese synchronen Bildwege keine verlässliche externe Auftragsabfrage. Das Studio stellt dies als unklar dar; eine erneute Generierung erfordert einen neuen bewusst freigegebenen Auftrag.
- Maximal vier Bildantworten, insgesamt begrenzte Antwortgröße; die erste Datei wird inhaltlich erkannt und mit Pixellimit dekodiert. Referenzen werden per Hash geprüft und auf höchstens 1536 Pixel Kantenlänge als PNG-Ableitung übertragen, Originale bleiben unverändert.
- Erfolgreiche Bilder werden auch dann sicher übernommen, wenn der Nutzer unmittelbar nach der externen Antwort abbricht. Das ist keine neue externe Aktion; bereits entstandene Inhalte werden nicht als ungeschehen dargestellt.

## Verwendung in der Artist-Automatik

**Artist erstellen** erlaubt ausdrücklich die automatische Entwicklung samt Porträt und täglichen Szenen. Wenn bisher keine Bildverbindung gewählt wurde, wird die vorhandene Codex-Anmeldung verwendet; fehlt sie, entsteht eine Einrichtungsaufgabe. Eine bezahlte API wird dabei nicht ausgewählt. Bereits gewählte Provider und Budgets werden als Version bestätigt.

Das erste Porträt wird als feste visuelle Referenz gespeichert. Nachfolgende Bildaufträge dieses Artists übernehmen es verbindlich, auch in der Bibliothek. Die Referenzauswahl ist dann entsprechend beschriftet und gesperrt. Rechte starten weiterhin ungeklärt; visuelle Referenzwahl ist keine Rechtsfreigabe. Beide tatsächlichen Bilder – Hauptporträt und Folgeszene mit Referenz – wurden in der automatischen Browserstrecke live mit Codex erzeugt. [Gesamtablauf](AUTOMATION.md).
