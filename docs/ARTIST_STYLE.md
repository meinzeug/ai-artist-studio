# Musikstil aus Vorgaben, Recherche und Referenzaufnahme

## Künstler anlegen

Unter **Künstler → Artist erstellen → Eigene Wünsche** sind drei unabhängige Eingaben möglich:

- **Musikstil:** eigenes Genre, Stimmung oder musikalische Beschreibung.
- **Band oder Musikstil im Internet recherchieren:** beispielsweise „Recherchiere Band XY: Sound, Instrumentierung und Songaufbau. Entwickle daraus eine eigenständige, modernere Richtung.“ Die ausgewählte Text-CLI bekommt ausschließlich für diesen Auftrag Websuchrechte. Quellen, Befunde, Zeit und kreative Ableitung werden gespeichert.
- **Musikreferenz hochladen:** eine gültige Audiodatei bis 25 MB und 20 Minuten. Nach ausdrücklicher Bestätigung werden bis zu 90 Sekunden an Gemini über den eigenen Google-CLI-Zugang übermittelt. Bei langen Aufnahmen: je 30 Sekunden Anfang, Mitte und Ende. Original und Dateihash bleiben unverändert und privat.

Die Vorarbeit wird in getrennten, budgetierten Jobs erledigt. Erst danach entwickelt die Identitäts-KI Charakter und musikalisches Profil anhand der Berichte. Bandreferenzen werden in Instrumentierung, Rhythmus, Arrangement und Produktionsmerkmale übersetzt; die Anwendung verspricht keine Kopie einer konkreten Stimme oder eines bestehenden Songs.

Unter **Künstler → Stil & Quellen** stehen Berichte, URLs, Unsicherheiten, Prüfzeiten, musikalische Richtung und die Originalaufnahme. Das Textmodell erhält den Audioanalysebericht, nicht die Behauptung, selbst gehört zu haben. Tempo darf unbekannt (`null`) sein; Hörschätzungen sind keine exakten Messungen.

## Tatsächliche Verfügbarkeit, geprüft am 22.09.2026

**Codex-Websuche live bestanden:** CLI 0.154.0, vorhandener ChatGPT-Login, eingeschränkter Runner, tatsächliche Suchereignisse und Ergebnis mit Quellenlink. Für `codex exec` wird `-c web_search="live"` gesetzt; die offizielle Dokumentation beschreibt dies als gleichwertig zu `--search`. Normale Text-/Bildaufträge behalten deaktivierte Websuche.

**Gemini-Höranalyse auf dorfspy extern blockiert:** CLI 0.60.0 ist installiert, Google-Anmeldedatei vorhanden. Ein tatsächlicher Versuch mit einem gekennzeichneten synthetischen MP3-Testton scheiterte mit `UNSUPPORTED_CLIENT` / `IneligibleTierError`: Google unterstützt diesen Client für den betreffenden Code-Assist-Zugang nicht mehr. Das ist keine erfolgreiche Höranalyse und nicht lediglich ein fehlender Login. Lokal fehlt zusätzlich die Gemini-Anmeldung. Ein funktionierender Codex-Textzugang ersetzt keinen Audiozugang.

Der Audioadapter und der Upload sind implementiert und mit ausdrücklich simulierten Providerantworten getestet. Eine erfolgreiche native Gemini-Höranalyse wurde **nicht** nachgewiesen. Bei diesem Fehler hält die Künstleranlage mit einer manuellen Aufgabe an. Unter **Stil & Quellen → Ohne Höranalyse fortfahren** kann der Betreiber die Analyse ausdrücklich auslassen. Die Datei bleibt als unanalysierte Referenz gespeichert. Es gibt keinen stillen Wechsel zu einer kostenpflichtigen API oder einem anderen Produkt.

## Grenzen und Sicherheit

Quellenberichte sind Aussagen des recherchierenden Providers; ein ausgeführtes Suchereignis wird geprüft, einzelne Quellen sind nicht zusätzlich unabhängig redaktionell verifiziert. Die Website-Inhalte können keine weiteren Werkzeuge, Budgets oder Veröffentlichungen freigeben. Allgemeine Shell-, Datei-, MCP- und App-Werkzeuge bleiben gesperrt.

Gemini verarbeitet `@Datei` vor dem Modellaufruf. Deshalb werden `@`-Dateiverweise in übergebenen Texten neutralisiert; nur der feste, von der Anwendung angelegte Audioauszug wird gezielt eingefügt. `--skip-trust` gilt nur für dieses frisch angelegte temporäre Arbeitsverzeichnis, weiterhin mit Landlock, gesperrten Werkzeugen und ohne globale Konfigurationsänderung.

Das Referenz-Uploadformular bestätigt die Übermittlung zur Analyse, keine Lizenz für Samples, Cover, Stimmenkopien oder Veröffentlichungen. Keine Originalaufnahme wird ungefragt in einen neuen Song oder TikTok-Beitrag übernommen.

## Offizielle Quellen

- [Codex-Konfiguration: Websuche](https://learn.chatgpt.com/docs/config-file/config-basic) und [CLI-Optionen](https://learn.chatgpt.com/docs/developer-commands?surface=cli).
- [Gemini Dateisystemwerkzeuge: Audio-Unterstützung](https://geminicli.com/docs/tools/file-system/), [direkte Dateieinbindung](https://geminicli.com/docs/cli/tutorials/file-management/) und [Authentifizierung](https://geminicli.com/docs/get-started/authentication/).

Die konkrete Google-Ablehnung stammt aus dem tatsächlichen Serveraufruf vom 22.09.2026; eine vorhandene Dokumentationsseite ist kein Nachweis für Kontozugriff.
