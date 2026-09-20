# Dein Artist produziert selbständig

## Vollständiges Musikvideo und zusätzliche Kurzclips

Neue Artist-Produktionen erstellen standardmäßig ein Musikvideo für die gesamte Aufnahme mit eigenem Lyrics-Storyboard und acht neuen referenzbasierten Bildmotiven. Anzahl und Aktivierung stehen in den Automatik-Einstellungen. Bereits vorhandene Songs erhalten ihre Vollversion über **Manuelle Aufgaben → Vollständige Musikvideos → Vollständiges Musikvideo erstellen**. Die bestehenden drei 30-Sekunden-Videos sind zusätzliche Kurzformate. [Ablauf, Kontingent und Wiederaufnahme](FULL_MUSIC_VIDEOS.md).

## Einmal einrichten

1. Unter **Jobs & Einstellungen → Provider & Konten** ChatGPT/Codex oder Gemini/Google für Texte verbinden. Die Anmeldung gilt auf dem Runner-Rechner. Die vorhandenen Login-Dialoge und Verbindungstests bleiben nutzbar.
2. **Bild-KI** wählen. Codex nutzt dein ChatGPT-Kontingent ohne zusätzlichen API-Key. Die Gemini-Bild-API benötigt eine eigene Verbindung und bestätigte Kosten. Ist noch keine Bild-KI gewählt, darf die ausdrücklich gestartete Artist-Automatik die vorhandene Codex-Anmeldung verwenden; ein fehlender Login erscheint als Aufgabe. Es gibt keinen stillen Wechsel zu einer kostenpflichtigen API.
3. Optional **SunoAPI.org** verbinden und Creditbedarf sowie Tages-/Monatsbudget bestätigen. Das ist der ausdrücklich gewählte Drittanbieter, nicht die separate Suno Platform.
4. **Künstler → Artist erstellen**. Alle Wünsche sind optional. Der Startknopf gibt die beschriebene tägliche interne Produktion innerhalb deiner eingerichteten Grenzen frei.

## Was automatisch passiert

- Eigenständiger Name, öffentliche Bio, fiktiver Charakter, musikalische und visuelle Identität werden als versionierte Character Bible gespeichert.
- Die Bild-KI erzeugt ein Hauptporträt. Dieses bleibt die feste Referenz für die folgenden Bildaufträge dieses Artists, auch wenn ein Client ein anderes oder kein Referenzbild angibt. Die Referenz wird tatsächlich als Bilddatei übermittelt. Das verbessert Wiedererkennbarkeit, garantiert aber keine identischen Gesichter.
- Der Text-Director entwickelt eine Songidee, Lyrics, Musikstil, eine Videoszene und drei verschiedene Beitragskonzepte inklusive Caption/Hashtags. Vorhandener Katalog, Kommentare, Erkenntnisse und korrekt zusammengefasste Kennzahlen fließen ein. Der Datenbezug bleibt im Produktionsplan gespeichert. Ohne Kennzahlen werden keine Trends oder Erfolgsraten erfunden.
- Bei verbundener, für die Automatik bestätigter SunoAPI-Verbindung wird ein Auftrag eingereiht und dessen Audio übernommen. Die eingerichteten Creditbudgets werden atomar reserviert.
- Ohne API erscheint eine **manuelle Suno-Aufgabe** mit kopierbaren Feldern, Produktionspaket und Audio-Upload. Der Upload ordnet die Aufnahme dem Auftrag, Song und der Lyrics-Version zu. Danach setzt die Automatik von selbst fort.
- Ein weiteres Bild entsteht mit dem festen Hauptporträt als Referenz. Im ausdrücklich gewählten manuellen Bildmodus wird das vorhandene Hauptporträt wiederverwendet.
- FFmpeg rendert drei lokale 1080×1920-MP4 mit H.264/AAC: Charakterclip, Szenenclip und Cover-Visualizer. Die Aufnahme liefert den Ton. Alle Projekte und Renderparameter bleiben im Video-Studio editierbar.
- Unter **Manuelle Aufgaben** liegen drei Videos mit Beschreibung, MP4-Download und ZIP bereit. Du prüfst Ton, Bild, Rechte und Kennzeichnungen und lädst selbst bei TikTok hoch. Link und tatsächlicher Zeitpunkt lassen sich direkt in der Aufgabe dokumentieren.

## Tägliche Produktion

Die erste Produktion beginnt sofort. Weitere Produktionen starten standardmäßig **09:00 Europe/Berlin**; Uhrzeit, Musikweg und Pause sind je Artist unter **Tägliche Automatik / Automatik einstellen** bedienbar. Bestehende Artists können hier ausdrücklich aktiviert werden; ihre vorhandene Identität wird erhalten.

Es gibt höchstens einen automatisch geplanten Lauf pro lokalem Kalendertag und einen noch laufenden/wartenden Produktionslauf pro Artist. Eine offene Audio- oder Fehlerübergabe verhindert einen Rückstau neuer Songs. Fertige Videos dürfen dagegen auf ihre manuelle Veröffentlichung warten, während am nächsten Tag ein neuer Song entsteht. Ausfalltage werden nicht stapelweise nachproduziert.

### Sofort einen weiteren Song starten

Unter **Manuelle Aufgaben → Neue Produktion** lässt sich ein zusätzlicher Song für den gewählten Artist starten, auch nach einer bereits abgeschlossenen Tagesproduktion. Der Dialog zeigt die aktuelle Providerverbindung und Grenzen; anschließend **Produktion bestätigen & starten** wählen. Künstleridentität, Hauptporträt und nächster täglicher Termin bleiben bestehen. Offene Produktionen oder Vollvideos müssen zuerst abgeschlossen werden. Wiederholte Klicks mit derselben Startkennung erzeugen keinen zweiten Lauf. Die bestehenden Text-, Bild- und Musikbudgets gelten weiterhin.

Bei einer Zeitumstellung wird eine nicht existierende Startzeit um die DST-Lücke nach hinten verschoben; bei einer doppelten Uhrzeit wird das erste Vorkommen verwendet. Diese Regel gilt nur für den wiederkehrenden internen Produktionsstart. Veröffentlichungsnachweise behalten die explizite Auswahl bei mehrdeutigen Uhrzeiten.

## Eingriffe und Grenzen

| Situation | Verhalten |
|---|---|
| CLI nicht angemeldet / Quote erreicht | Konkrete Aufgabe; Anmeldung oder Quote prüfen, Schritt bewusst erneut freigeben. |
| Bildprovider manuell | Einmal Hauptporträt hochladen, danach wird es für die Videos wiederverwendet. |
| Provider oder Budget geändert | Lauf wartet auf neue Bestätigung in den Automatik-Einstellungen. Ein bisher nicht versendeter manueller Suno-Auftrag kann danach den API-Weg nutzen. |
| Suno/Bildauftrag nach Timeout unklar | Kein zweiter Auftrag. Bestehende externe Kennung bzw. Ergebnis in Musikproduktion/Medien klären. |
| Renderfehler | Lokalen Schritt wiederholen; der gespeicherte Snapshot wird verwendet. |
| Automatik pausiert | Keine weiteren Stufen starten. Bereits begonnene Jobs können noch fertiglaufen; Abbruch unter Jobs. |
| Globaler Not-Aus | Neue Produktionen bleiben gesperrt. Bereits externe Vorgänge benötigen gesonderte Klärung. |
| Rechte ungeklärt | Produktion bleibt ein Entwurf. Die KI erteilt keine Rechtsgarantie. Bekannte gesperrte/streitige Medien werden nicht freigegeben. |

Ein ZIP aus „Manuelle Aufgaben“ ist ein **Produktionsentwurf**, keine automatische Veröffentlichungsfreigabe. Es enthält MP4, Caption, Cover (falls vorhanden), Dateihash und Prüfliste. Die spätere Betreiberbestätigung bindet Inhalt/Hash/Konto/Kennzeichnungen in einen Freigabesnapshot und speichert einen ausdrücklich **manuell, nicht extern verifizierten** Veröffentlichungsnachweis. Änderungen zwischen Vorschau und Bestätigung werden abgewiesen.

Die Automatik hört keine Aufnahme: Bei den zusätzlichen Kurzclips sind Anfang, Mitte und Ende geometrisch bestimmte, maximal 30 Sekunden lange Ausschnitte. Die neue Vollversion deckt die gesamte Aufnahme ab und gestaltet Motive nach den Lyrics; der Titel erscheint dort nur vier Sekunden. Es werden keine erfundenen wortgenauen Lyrics-Zeitstempel angelegt. Die erste verfügbare Aufnahme wird vorläufig gewählt, ohne behauptete Hörbewertung. Diese Entscheidungen können im Musik-/Video-Studio überarbeitet werden.

Veo bleibt eine optionale, separat freizugebende Erweiterung im Video-Studio. Die tägliche Automatik verwendet Bild + Aufnahme + FFmpeg und startet keine ungefragte kostenpflichtige Videogeneration.

## Betrieb

Migration **006_artist_automation.sql** ergänzt vier relationale Tabellen. Der bestehende Worker steuert die Stufen und prüft fällige Tage. PostgreSQL, eindeutige Schlüssel, Transaktionen und eine Worker-Sperre sichern den Fortschritt; die Queue ist nicht die einzige Wahrheit. Web, Worker und Runner müssen laufen. Nach einem Neustart setzt der Worker bestehende Läufe fort; unbekannte externe Zustände bleiben gesperrt.

Tests und tatsächliche Livegrenzen stehen im [Testbericht](TEST_REPORT.md). Authdateien werden nicht exportiert oder in normale Backups aufgenommen.
