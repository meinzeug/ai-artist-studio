# SunoAPI.org verbinden

Geprüft: **20. September 2026**. Der Betreiber hat ausdrücklich die Dokumentation von [SunoAPI.org](https://docs.sunoapi.org/) gewählt. Dies ist ein **separater Drittanbieter**. Ein Suno-Webabo oder ein Login bei Suno verbindet dieses API-Konto nicht automatisch. Die offizielle Suno Platform bleibt ein gesonderter, hier nicht zugänglicher Anbieter.

## Im Dashboard

1. Auf der Übersicht **Suno API verbinden** wählen. Dieselbe Einrichtung findet sich unter **Einstellungen → Provider & Konten** und **Musikproduktion**.
2. Bei [SunoAPI.org](https://sunoapi.org/) anmelden und unter [API Key](https://sunoapi.org/api-key) den eigenen Schlüssel erstellen/kopieren. Schlüssel nur in das Passwortfeld des Studios einfügen.
3. **Verbinden & prüfen** fragt ausschließlich das Creditguthaben ab. Keine Testproduktion und keine automatische Abbuchung. Der Schlüssel wird AES-256-GCM-verschlüsselt gespeichert und nie an Browser oder Text-KI zurückgegeben.
4. **Produktion einrichten** öffnen: bestätigten Creditbedarf für das gewählte Modell, Tages-/Monatslimit und eine HTTPS-Rückmelde-Adresse eintragen. Standardlimits sind 0. Die Anbieterpreise sind nicht fest einprogrammiert.
5. Auf dem eingerichteten Server ist die Adresse `https://artist.dorfspy.de/api/suno/callback` bereits vorausgefüllt. Bei rein lokalem Betrieb wird ein eigener öffentlich erreichbarer HTTPS-Empfänger benötigt. Es werden keine undokumentierten Callback-Ersatzadressen verwendet.
6. Im Song zuerst eine Lyrics-Version speichern und ein Produktionspaket erstellen. **Mit API produzieren** öffnen, Modell/Einstellungen prüfen und den konkreten Creditbedarf freigeben.
7. Der Worker sendet den Auftrag, fragt den Status ab und importiert fertige Audiodateien samt Song-, Lyrics- und Auftragsbezug. Danach stehen Variantenvergleich, Audioanalyse und Video-Studio zur Verfügung.

**Einrichtungsanleitung** öffnet diese Schritte direkt als Modal. Für Gesangsproduktionen sind Lyrics erforderlich. Unterstützt werden die im aktuellen Generate-Endpunkt dokumentierten Modelle `V6`, `V6_WILD`, `V6_MINI`, Instrumental, optionale Stimmlage und Dauer. Es wird keine identische Stimme garantiert.

## Fehler und erneutes Abrufen

- Falscher Schlüssel / fehlende Credits / gesperrter Zugriff werden verständlich angezeigt.
- Pro lokalem Produktionsauftrag maximal ein Generierungs-POST. Ein Doppelklick erzeugt keinen weiteren Auftrag.
- Bei Timeout nach Übertragungsbeginn bleibt der Status **extern unklar**. Credits bleiben vorsorglich reserviert. Im Anbieterkonto die vorhandene Task-ID prüfen und in der App hinterlegen; **Status erneut abrufen** erzeugt keine neue Musik.
- Fertige Dateien werden anhand externer Audio-ID dedupliziert. Teilweise fehlgeschlagene Downloads sind wiederaufnehmbar. Nach wiederholten Abfragefehlern ist eine bewusste Wiederaufnahme erforderlich.
- Lokale Creditlimits verwenden den vom Betreiber bestätigten Betrag. Tatsächliche Abbuchungen erfolgen nach Anbieterabrechnung; unbekannte Preise werden nicht als kostenlos behandelt.
- Rechte stehen nach Import auf **ungeklärt**. Tarif, Herkunft und Nutzungsnachweise vor Freigabe ergänzen.

## Dokumentierte Schnittstellen

Basis: `https://api.sunoapi.org`, Bearer-Authentifizierung. Einzelne Dokumentationsbeispiele nennen eine ältere Hostadresse; das Studio wechselt nicht stillschweigend auf diese.

| Vorgang | Route | Quelle |
|---|---|---|
| Guthaben | GET `/api/v1/generate/credit` | [Remaining credits](https://docs.sunoapi.org/suno-api/get-remaining-credits) |
| Generierung | POST `/api/v1/generate` | [Generate music](https://docs.sunoapi.org/suno-api/generate-music) |
| Status / Audiodateien | GET `/api/v1/generate/record-info?taskId=…` | [Generation details](https://docs.sunoapi.org/suno-api/get-music-generation-details) |

Der Anbieter verlangt `callBackUrl`. Der öffentliche Studio-Empfänger quittiert nur; **keine Statusänderung durch ungeprüfte Callbacks**. Verlässliche Zustandsänderungen erfolgen über authentifizierte Statusabfragen. Keine behauptete Signaturprüfung, für die keine belastbare Spezifikation vorliegt.

## Prüfstatus

Implementiert: Verbindung, verschlüsselter Schlüssel, Budgets/Freigabe, Worker, Polling, automatischer Import, Anleitung, Fehler-/Wiederaufnahmepfade. Unit-/Integrationstests verwenden ausdrücklich simulierte Anbieterantworten und echte lokale Audiodateien. **Kein Kunden-API-Key vorhanden, keine bezahlte Liveproduktion ausgeführt.** Weitere SunoAPI-Produkte wie Extend, Cover oder Video sind nicht Teil dieses Produktionsadapters.
