# Sicherheit und Datenschutz

## Grenzen
Web, Worker und CLI-Runner sind getrennte Prozesse. Compose veröffentlicht nur den Webport auf 127.0.0.1. PostgreSQL und Redis bleiben im Compose-Netz. Lokaler nativer Betrieb ist ein Einzelbenutzerbetrieb; die Dienste sind nur über Loopback erreichbar. Der eigene PostgreSQL-Cluster verlangt per TCP SCRAM-Passwortauthentifizierung, am lokalen Socket Peer-Anmeldung.

Der Runner läuft ohne Root, Docker-Socket, Host-Home-Mount oder Datenbankzugang. In Compose erhält er ausschließlich sein Runner-Token und eigene CLI-Auth-Volumes. Nativ lädt er `.env.runner`, nicht `.env`. KI-Kindprozesse erhalten eine feste Umgebungs-Allowlist, einen leeren Job-Home und eine temporäre Kopie ausschließlich der ausdrücklich vorgesehenen offiziellen Auth-Datei. Die Kopie wird danach gelöscht; Host-Konfigurationen bleiben unverändert. Refreshänderungen werden nur in Studio-eigene Authdateien atomar zurückgeschrieben; globale Host-Anmeldungen bleiben unverändert. Neue offizielle Anmeldungen sind im Dashboard möglich. Codex-Authdateien mit API-Key-Modus werden abgewiesen.

Landlock ABI 4 oder höher ist zwingend: Host-Dateien, Projekt und normale Benutzerverzeichnisse werden ausgeschlossen. Erlaubt sind notwendige Laufzeitdateien und genau das eigene Jobverzeichnis. TCP-Verbindungen der Kindprozesse sind auf Zielport 443 begrenzt; insbesondere PostgreSQL/Redis/Studio auf Loopback sind nicht erreichbar. Dateizugriff und TCP-Sperre werden tatsächlich getestet. Shell-/Browser-/Apps-/MCP-Werkzeuge sind bei Codex deaktiviert bzw. mangels Konfiguration nicht geladen; Gemini erhält eine Deny-All-Toolpolicy und leere Toolkonfiguration. Ohne Landlock startet die Produktion nicht. Diese Grenze ersetzt nicht die Regeln und Quoten des Anbieters.

## Anwendung
- Passwort: scrypt mit zufälligem Salt; konstante Vergleichszeit. Mindestlänge bei Einrichtung 12 Zeichen. Kein Standardpasswort.
- Session: zufällige 256-Bit-Cookies, nur Hash in DB, HttpOnly, SameSite=Lax für OAuth-Rückkehr, Secure bei HTTPS, 7 Tage Ablauf. Abmelden widerruft die Session.
- Schreib-Requests prüfen exakten APP_ORIGIN, Session, Zod-Schema und Eigentümer. Uploads prüfen diese Voraussetzungen vor Verarbeitung. SQL-Werte sind gebunden; dynamische Tabellennamen ausschließlich interne Allowlists.
- Einrichtung ist einmalig mit PostgreSQL-Transaktionssperre geschützt. Bei HTTPS ist zusätzlich ein gültiger, separat übergebener SETUP_TOKEN erforderlich; ohne konfigurierten Code scheitert die Einrichtung geschlossen. Loginversuche werden begrenzt.
- React escaped importierte Texte. Kein dangerouslySetInnerHTML. PDF-Belege werden als Download, nicht als HTML ausgeliefert. CSP, nosniff, Referrer- und Frame-Schutz sind gesetzt.
- Dateiinhalt wird unabhängig von Dateiendungen erkannt. Keine SVG/HTML/Skriptuploads. Bilder werden mit Pixellimit decodiert; Medien werden mit ffprobe validiert. Maximal 250 MB, 4 Stunden Dauer, private UUID-Speicherschlüssel. Dateinamen mit Pfaden/Steuerzeichen werden abgewiesen.
- FFmpeg erhält getrennte Argumente ohne Shell. Text landet in einer eigenen ASS-Datei; Steuersequenzen werden entfernt. Numerische Parameter sind begrenzt. Threads, Laufzeit und Prozessausgabe sind begrenzt; Originale werden nicht verändert.
- Manuelle Imports laden keine beliebigen Fremd-URLs herunter. SunoAPI-Ergebnisdownloads prüfen jedes HTTPS-Ziel, alle DNS-Adressen, pinnen die gewählte öffentliche IP und wiederholen diese Prüfung bei jedem Redirect. TikTok-Aufrufe verwenden feste offizielle Hosts und folgen keinen Redirects. Der Suno-Downloader akzeptiert nur Port 443, keine URL-Credentials, begrenzte Redirects, Dateigröße und Zeit.
- OAuth-State ist zufällig, an den angemeldeten Betreiber gebunden, zehn Minuten gültig und einmalig verbrauchbar. Access-/Refresh-Tokens sind AES-256-GCM-verschlüsselt, der Schlüssel bleibt außerhalb der DB. Tokens kommen nicht in Browser-State, KI-Prompts oder Exportdaten.
- TikTok-Webhooks prüfen HMAC-SHA256 und fünf Minuten Zeitfenster; Payload-Hash dedupliziert. Aktuell werden Ereignisse protokolliert und lösen keine Veröffentlichung aus.

## Fachliche Schutzregeln
Freigaben binden Konto, Datei/Hash, Cover, Caption, Kennzeichnungen, Privatsphäre, Interaktionen, Rechte und geplante Exportaktion. Veränderungen invalidieren sie. Not-Aus sperrt neue interne Starts. Externe unklare Zustände werden nicht blind wiederholt; Direct Post und kostenpflichtige Generierungen sind ohne verifizierten Zugang nicht aktivierbar.

Kommentare, Lyrics und Künstlertexte sind untrusted Daten, die ausschließlich in begrenzte Textaufträge eingehen. Das strukturierte KI-Ergebnis wird erneut fachlich validiert; es besitzt keine beliebige Shell- oder Veröffentlichungsaktion. Die KI erhält keine Provider-Tokens oder Passwörter und behauptet ohne Audiozugriff keine Hörbewertung.

## Datenlebenszyklus
Künstlerexport enthält Fachobjekte und Medien, keine Authentifizierungstokens. Künstler können mit expliziter Namensbestätigung vollständig lokal gelöscht werden; laufende Jobs müssen vorher gestoppt werden. Kommentare sind einzeln löschbar; konfigurierbare Aufbewahrungszeit wird über einen bewussten Bereinigungsschritt angewendet. Es werden keine zusätzlichen Profile über Kommentierende angelegt. Backups enthalten verschlüsselte Verbindungstokens, aber weder Schlüssel noch CLI-Auth. Sicherungen ebenso privat behandeln wie Produktionsdaten.

## Betrieb
Vor externer Erreichbarkeit HTTPS-Reverse-Proxy, korrektes APP_ORIGIN, Firewall und Zugriffsbeschränkung einrichten. Diese Implementierung wurde nicht unabhängig sicherheitsauditiert. Abhängigkeiten sind gepinnt; Updates benötigen Migrationen und die Kernstreckentests. Keine eigene Rechtsgarantie für hochgeladene Inhalte.

## Kontodialoge und öffentliches Deployment

Der Backend-Proxy verlangt Betreiberrolle, Session und Origin. Loginstatus ist an eine zufällige Vorgangskennung und Betreiber-ID gebunden. Der Runner akzeptiert ausschließlich typisierte Loginaktionen; keine frei wählbaren Befehle. Codes und vollständige CLI-Ausgaben werden nicht geloggt. Nur offizielle OpenAI-/Google-Loginhosts werden als Link ausgegeben. Zeitlimit, Abbruch und begrenzte Prozessausgabe sind implementiert.

Server: getrennte nicht privilegierte Unix-Benutzer, systemd `NoNewPrivileges`, `ProtectSystem=strict`, private temporäre Verzeichnisse, Schreibrechte nur in eigenem Datenverzeichnis, CPU-/Speicher-/Prozessgrenzen. Caddy stellt HTTPS bereit. Keine Datenbank-/Runnerports werden extern veröffentlicht. Hetzner-API-Key bleibt außerhalb App, Server-Env und Repository.

SunoAPI-Callback ist öffentlich erreichbar, besitzt keine Schreibbefugnis auf Produktionszustände und quittiert nur begrenzte Requests. Status und Audio-IDs kommen aus authentifiziertem Polling. Der Suno-API-Key wird AES-GCM-verschlüsselt in der DB gespeichert; der Schlüssel liegt separat.

## Veo (optional)

Gesonderter API-Key, AES-GCM und explizite Bild-/Kostenfreigabe. Modellabfrage/Generierung verwenden den festen offiziellen Google-Host ohne Redirects. Download-URIs sind auf Google-Dateiendpunkte begrenzt; HTTPS-Downloads prüfen/pinnen öffentliche DNS-Ziele, begrenzen Größe und Redirects und entfernen API-Header beim Hostwechsel. Providerfehler geben weder Antwortkörper noch Schlüssel wieder. Startbilder werden per Hash geprüft, mit Pixellimit dekodiert und als separate JPEG-Ableitung übertragen. Alle Kostenreservierungen sperren dieselbe Betreiber-Einstellungszeile. `queue_ai` und Director erlauben keinen Umweg um die Freigabe. Nur bekannte externe Aufträge sind wiederholt abfragbar. Unklare Übermittlungen bleiben ohne automatischen Neuauftrag.

## Bildgenerierung

Codex native Bilder erhalten ausschließlich freigegebenen Prompt, minimale visuelle Künstlerdaten und optionale Referenzdatei. Bildwerkzeug nur im eigenen Runnerauftrag eingeschaltet; reine Textjobs bleiben ohne Bildfunktion. Keine Shell-/Browser-/Web-/Appfreigabe; dieselbe Landlock-Grenze, Zeit- und Ausgabelimits. Authdateien verbleiben im Runner, Medien werden als begrenzte Bilddaten zurückgegeben. Eigene Jobverzeichnisse werden entfernt.

Gemini-Bild-API ist eine separat konfigurierte Verbindung mit AES-GCM-Key, festen HTTPS-Endpunkten und gesperrten Redirects. Kein CLI-Token wird zur API-Authentifizierung umgenutzt. Dashboardzustand enthält keine Schlüssel. Schema-/Besitzprüfungen, unveränderliche Referenzhashes, Bilddecoder und gemeinsame Budgetsperre sichern den Auftrag. Keine automatische externe Wiederholung; manuelle Klärung mit Audit und fortbestehender Verbrauchsbuchung.

## Künstlerautomatik

Die einmalige Artist-/Automatikfreigabe autorisiert interne tägliche Produktionen nur innerhalb der aktuellen, versionierten Provider- und Studio-Grenzen. Eine geänderte kostenpflichtige Verbindung wird nicht stillschweigend genutzt. Die Auswahl eines noch nicht eingerichteten Bildproviders darf nur die vorhandene Codex-Accountanmeldung verwenden. Fremde Kommentartexte und Messwerte bleiben Daten im abgeschotteten Textauftrag.

Manuelle Aufgaben prüfen Betreiber, Artist, Auftrag, Song und Dateityp beim Audioimport. Das Backend erzwingt die gespeicherte Porträtreferenz. Rechte an Referenzen und Musik bleiben Betreiberverantwortung; automatische Referenzwahl ist keine automatische Nutzungsrechtefreigabe. Veröffentlichungsnachweise verlangen eine explizite Erklärung, aktuelle Beitragsversion und HTTPS-TikTok-Link; bekannte gesperrte Renderinputs verhindern die Freigabe. Downloads von Produktionsentwürfen sind keine öffentlichen Aktionen und werden als ungeprüft gekennzeichnet. Pausieren hält weitere Stufen an, bereits laufende externe Aufträge werden nicht als zurückgenommen dargestellt.

Suno-Generierungsjobs binden zusätzlich die bestätigte Verbindungsversion. Vor dem ersten Providerkontakt und erneut direkt vor der Übermittlungsmarkierung wird diese geprüft. Ein zwischenzeitlicher Wechsel stoppt den nicht gesendeten Auftrag und gibt die lokale Creditreservierung frei. Bereits übermittelte Vorgänge werden dadurch nicht als storniert dargestellt.

## Stilreferenzen und Websuche (22.09.2026)

Die Suchfreigabe ist ein typisierter Parameter ausschließlich des dedizierten Stilauftrags; Inhalte aus Web, Kommentaren und MP3-Metadaten können sie nicht aktivieren. Codex verwendet `web_search=live`, Gemini darf ausschließlich `google_web_search` verwenden. Allgemeine Shell-/Datei-/MCP-/App-Werkzeuge bleiben gesperrt. Für als recherchiert gespeicherte Berichte wird ein tatsächliches Provider-Suchereignis verlangt.

Die neue Multipart-Route `/api/artists/create` prüft Origin, Session, Größe, Dateisignatur, tatsächlichen Audioinhalt/Dauer und die ausdrückliche Übermittlungsbestätigung. Artist, Referenzasset und Stilauftrag werden atomar angelegt; Wiederholungen mit derselben Erstellungskennung erzeugen keinen zweiten Artist und ungenutzte Uploads werden entfernt. Der Originalhash bleibt erhalten. Der Worker überträgt höchstens 90 Sekunden als MP3 an den getrennten Runner, keine privaten Speicherpfade oder Token in Prompts.

Gemini-Dateiverweise werden bereits vor dem Modell verarbeitet. Alle `@` in Promptdaten werden deshalb neutralisiert; ausschließlich die fest angelegte Datei `reference.mp3` wird eingefügt. Werkzeuge bleiben auch im Audiomodus durch die Admin-Policy gesperrt. Das temporäre eigene Arbeitsverzeichnis darf für diese Sitzung als vertrauenswürdig gelten; Landlock und Prozessgrenzen bleiben bestehen. Kein globales Vertrauen, kein YOLO-Modus.

Geänderte TikTok-Texte betreffen Musikpromotion. AIGC-/Rechte-/Veröffentlichungsprüfungen und Freigabesnapshots bleiben separate Pflichtschritte. Ungeklärte Stilanalyse kann nur vom Eigentümer mit aktueller Version ausdrücklich ausgelassen werden.
