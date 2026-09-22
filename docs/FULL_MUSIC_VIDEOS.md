# Vollständige Musikvideos

Die Vollversion verwendet die gesamte zugeordnete Aufnahme. Die drei 30-Sekunden-Formate sind zusätzliche Kurzclips.

## Ablauf

1. **Neue Artists:** Im Erstellungsdialog ist „Vollständiges Musikvideo automatisch produzieren“ vorausgewählt. Die Bildanzahl wird aus der tatsächlichen Audiodauer berechnet: mindestens ein neues Motiv pro fünf Sekunden, zum Beispiel 36 bei 3:00 oder 38 bei 3:09 Minuten. Unter Automatik einstellen lässt sich die Vollversion aktivieren. Bereits begonnene Produktionssnapshots behalten ihren bisherigen Schnittplan.
2. **Vorhandener Song:** Unter **Manuelle Aufgaben** oder **Video-Studio → Vollständige Musikvideos** die Produktion starten. Aufnahme, Lyrics-Version und Hauptporträt werden festgehalten; erneuter Audioimport ist nicht nötig.
3. Die Text-KI entwickelt eine durchgehende Bildgeschichte. Ein durchgehender Handlungsbogen und Bildstil werden mit dem ersten Teilauftrag festgehalten. Pro Teilauftrag entstehen höchstens acht Szenen; Folgeaufträge erhalten den gemeinsamen Plan und bisherige Szenen. Jede Szene enthält einen echten Lyrics-Auszug in Textreihenfolge, einen neuen Bildauftrag, Kameraidee und ausdrücklich beschriebenen Anschluss.
4. Die Bild-KI erzeugt jedes Motiv separat mit dem festen Künstlerporträt als Referenz. Die gespeicherten Bilder sind in der Medienbibliothek und im Storyboard sichtbar. Ein anderer Ausschnitt desselben Bildes zählt nicht als neues Motiv. Jede Szene benötigt ein eigenes Bild.
5. FFmpeg rendert ein vertikales MP4 über die gesamte Songlänge: 1080×1920, H.264/AAC, sanfte Bewegungen und echte Überblendungen. Der Songtitel erscheint nur vier Sekunden am Anfang. Kein dauerhaft eingeblendeter Teaser-Slogan, keine Werbewasserzeichen.
6. Das fertige Video und die Beschreibung stehen im Bereich **Vollständige Musikvideos** zum Download bereit. Rechte-/Kennzeichnungsprüfung und tatsächliche Veröffentlichung bleiben beim Betreiber.

## Kontingent und Wiederaufnahme

Ein vollständiges Musikvideo benötigt mehrere begrenzte Textaufträge (je höchstens acht Szenen), die angezeigte Anzahl Bildaufträge und einen lokalen Renderauftrag. Das Studio erhöht keine Tages-/Monats-/Creditgrenzen. Codex nutzt die vorhandene ChatGPT-Anmeldung und deren Kontingent. Gemini-Bilder benötigen weiterhin die separat konfigurierte API und Kostenfreigabe; der Dialog zeigt den maximalen Kostenansatz für die gewählte Motivanzahl.

Jede Szene hat einen dauerhaften Generierungsauftrag. Fertige Bilder bleiben bei Neustart, Budgetstopp oder Renderfehler erhalten. „Vorhandene Produktion fortsetzen“ nutzt sie erneut. Ein unklarer externer Bildauftrag muss zuerst in der Bildproduktion geklärt werden; die Fortsetzung sendet ihn nicht erneut. Bei fehlendem Bildprovider können eigene Bilder importiert und einzeln den Szenen zugeordnet werden. Ein Bild darf nicht alle Szenen ersetzen.

## Gestaltung und Grenzen

- Szenen folgen dem Inhalt und der Reihenfolge der Lyrics. Die tatsächliche Audiodauer wird framegenau auf die benötigten Motive verteilt, jeweils höchstens fünf Sekunden. Die Beschreibung zeigt redaktionelle Zeitfenster. Das Textmodell hört die Aufnahme nicht; es gibt keine behauptete wortgenaue Ausrichtung und keine automatisch eingebrannten Karaoke-Untertitel. Manuelle Untertitelkorrektur bleibt im Editor möglich.
- Diese Produktion animiert KI-Standbilder. Bewegte Kameraausschnitte und Überblendungen erzeugen keine echte Körperanimation oder Lippensynchronität. Der vorhandene optionale Veo-Weg bleibt eine separate Szenenproduktion.
- Referenzbilder unterstützen Wiedererkennbarkeit; perfekte Gesichtsidentität wird nicht garantiert. Storyboard und erzeugte Motive vor Veröffentlichung prüfen.
- Technische Grenze: bis 20 Minuten pro Projekt, bis 240 generierte Motive und Timeline-Einstellungen. Die verifizierten Laufzeiten stehen im Testbericht. Sehr lange Filme benötigen entsprechend Renderzeit und Speicher.

## Technik

Migrationen `007_full_music_videos.sql` und `009_storyboard_cadence.sql`: versionierte `music_video_productions` mit Aufnahme-/Lyrics-/Referenz-Snapshot und relationale `music_video_scenes`. Persistenter `storyboard_plan`, gespeicherte Teilergebnisse und ein eigener, deduplizierter und budgetierter Job je Teilauftrag. Eigener Scheduler mit PostgreSQL-Sperre, deduplizierte Storyboard-/Bild-/Renderaufträge, typisierte Commands und vorhandene Rechte-/Budgetprüfungen. Vollversionen sind normale private Assets, Videoprojekte, Beitragsentwürfe und Veröffentlichungsaufgaben.

Der Renderer verarbeitet höchstens zwei Bildquellen gleichzeitig. Kurze Überblendungen werden separat gerendert und mit den Kamerafahrten zusammengesetzt; dadurch entsteht keine große, speicherintensive FFmpeg-Filterkette für den gesamten Film. Das Originalaudio bleibt unverändert.
