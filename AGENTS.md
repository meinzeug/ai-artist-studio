# AI Artist Studio – Arbeitsregeln
Lies docs/IMPLEMENTATION_PLAN.md, docs/ARCHITECTURE.md und docs/HANDOVER.md vor Fortsetzung. Anforderungen und Nachweise stehen in docs/PRODUCT_SPEC.md und docs/TEST_REPORT.md.
- Bestehende Änderungen erhalten. Keine Zugangsdaten oder Auth-Dateien ausgeben/committen.
- Deutsch in der Oberfläche, Europe/Berlin als Standard. Keine Demodaten in Produktionsdatenbank.
- Datenbank ist fachliche Wahrheit; lange Aufgaben im Worker, CLI ausschließlich im Runner.
- Externe Fähigkeiten dokumentiert/implementiert/konfiguriert/live getestet unterscheiden.
- Öffentliche Aktionen und bezahlte Generierungen benötigen reale Berechtigung und Freigabe.
- Jede schreibende Operation prüft Session, Eigentümer, Schema und Objektversion.
- Sichere spawn-Aufrufe, kein shell:true, keine YOLO-Flags. Originaldateien unverändert.
- Tests: npm run typecheck, npm test, npm run test:e2e, npm run build. Neue Tests müssen echte Risiken prüfen.
- Fortschritt und verbleibende Einschränkungen ehrlich dauerhaft dokumentieren.
- Künstlerautomatik: `auto_*` nur über den dedizierten Freigabeweg; feste Hauptporträt-Referenz und Provider-Versionen erhalten. Bei unklarem externem Zustand nie erneut generieren. Manuelle Audioimporte müssen denselben Lauf fortsetzen.

- Vollständige Musikvideos: Lyrics-/Audio-/Porträtsnapshot erhalten, einzelne Szenen wiederaufnehmen, keine unklaren Bildaufträge erneut senden und keine Budgetgrenzen für eine Vollversion erhöhen. Details: docs/FULL_MUSIC_VIDEOS.md.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

- Neue Vollvideo-Produktionen: reale Audiodauer bestimmt die Bildanzahl (höchstens fünf Sekunden je neuem Motiv); persistente Storyboard-Teilaufträge, bestehende Snapshots/Budgets erhalten.
- Stilrecherche nur als dedizierter `auto_style_*`-Auftrag mit echten Suchereignissen. Audio nur an ausdrücklich bestätigten Gemini-Weg; aktueller dorfspy-Zugang meldet UNSUPPORTED_CLIENT. Keine vorgetäuschte Höranalyse und kein bezahlter Fallback.
- TikTok-Captions thematisieren Musik statt KI/Virtualität; separate Plattformkennzeichnungen und Rechteprüfung bleiben bestehen.
