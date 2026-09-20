# Ubuntu-Deployment

Der hier geprüfte Host nutzt Ubuntu 24.04, Node 22, PostgreSQL 16, Redis, FFmpeg, Python 3 und Caddy. Bestehende Projekte werden nicht verändert. Server-Provisionierung erfordert administrativen Zugriff; Web, Worker und Runner laufen danach als getrennte Systembenutzer ohne Root.

1. Betriebspakete installieren: `postgresql-16 redis-server ffmpeg gcc libc6-dev linux-libc-dev python3 ca-certificates`.
2. Release (Quellen und Lockdatei) nach `/opt/ai-artist-studio` übertragen. Keine `.env`, `.local`, Testdaten oder lokalen CLI-Anmeldungen übertragen.
3. Dort `npm ci` und `NODE_OPTIONS=--max-old-space-size=768 npm run build` ausführen. Turbopack erzeugt pfadbezogene Modulaliasse; `.next` allein ist kein portables Release. CLIs separat mit `npm install --prefix /opt/artist-cli --save-exact @openai/codex@0.154.0 @google/gemini-cli@0.60.0` installieren.
4. `python3 scripts/deploy/bootstrap-server.py`. Erstellt nur beim ersten Lauf Secrets, DB und Einrichtungscode, danach Migrationen und drei systemd-Units. Bestehende Konfiguration bleibt erhalten.
5. Inhalt von `artist.caddy` zum bestehenden Caddyfile ergänzen. Mit `caddy validate --config /etc/caddy/Caddyfile` prüfen, dann `systemctl reload caddy`.
6. DNS A `artist.dorfspy.de` → `91.99.217.84`; Caddy beschafft/erneuert TLS. DB, Redis, Web und Runner lauschen nur lokal.
7. HTTPS öffnen und Betreiberkonto mit dem geschützten `SETUP_TOKEN` aus `/etc/artist-studio/web.env` erstellen. Keine öffentliche Ersteinrichtung ohne Code. Danach werden weitere Registrierungen abgelehnt.
8. Unter Einstellungen → Provider & Konten die offiziellen ChatGPT-/Google-Anmeldungen durchführen. Runner-Credentials liegen ausschließlich unter `/var/lib/artist-runner/auth`, nicht in Datenbackups.

Updates: Anwendung sichern, nur ihre Worker-/Web-Dienste stoppen, geprüfte Quellen/Build übertragen, `npm ci`, Migrationen mit geschützter Web-Umgebung, Dienste starten. Runner nur neu starten, wenn keine Anmeldung/Produktion läuft. Die Units starten automatisch nach Server-Neustart. Diagnose: `systemctl status artist-studio-{web,worker,runner}`, `journalctl -u artist-studio-worker --since today`, HTTPS `/api/health`.

Diese Skripte sind auf den ausdrücklich beauftragten Host zugeschnitten. Ein Restore von Daten und Schlüsseln wird in `docs/OPERATIONS.md` beschrieben. CLI-Logins werden am Ziel neu verbunden.
