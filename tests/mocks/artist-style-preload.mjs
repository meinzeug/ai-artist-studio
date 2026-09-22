// Explicit synthetic provider responses, isolated test database only.
if (
  new URL(process.env.DATABASE_URL || "http://invalid").pathname !==
  "/artist_studio_test"
)
  throw Error("Isolated test DB required");
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  if (
    (url.endsWith("/run") || url.endsWith("/audio")) &&
    init?.method === "POST"
  ) {
    const b = JSON.parse(String(init.body));
    if (b.prompt?.includes("SYNTHETIC STYLE BROWSER")) {
      if (b.web_search)
        return Response.json({
          research: { executed: true, calls: 1 },
          result: {
            summary:
              "Synthetische Stilrecherche für eine ausdrücklich erfundene Testband.",
            musical_traits: ["Trockene Drums", "Warme Synthesizer"],
            creative_direction:
              "Eigenständige musikalische Testentwicklung anhand klarer Referenzmerkmale.",
            style_prompt: "Dry drums and warm analog synthesizers",
            uncertainty: "Explizite Testantwort, keine echte Webrecherche.",
            sources: [
              {
                title: "Synthetische Musikquelle",
                url: "https://example.invalid/music",
                finding: "Testbeobachtung: trockene Drumcomputer.",
              },
            ],
          },
        });
      if (url.endsWith("/audio"))
        return Response.json({
          audio_input: true,
          result: {
            heard_audio: true,
            summary:
              "Synthetische simulierte Höranalyse der hochgeladenen Testdatei.",
            genres: ["Test"],
            tempo_bpm: null,
            rhythm: "Kein messbarer Beat",
            instruments: ["Testton"],
            vocals: "Kein Gesang",
            production: "Synthetischer gleichmäßiger Ton",
            style_prompt: "Sustained synthetic tone with dry drums",
            uncertainty: "Explizite Testantwort; kein echter Audioprovider.",
          },
        });
      if (
        b.prompt.includes(
          "Entwickle einen vollständigen eigenständigen virtuellen Musikkünstler",
        )
      ) {
        if (
          !b.prompt.includes("Synthetische simulierte Höranalyse") ||
          !b.prompt.includes("Synthetische Stilrecherche")
        )
          throw Error("Style context missing");
        return Response.json({
          result: {
            name: "SYNTHETIC STYLE BROWSER",
            bio: "Virtueller Testcharakter für die Browserabnahme.",
            genre: "Synthpop aus Stilreferenz",
            identity: {
              instrumentation:
                "Drumcomputer und warme Synthesizer aus der Stilrecherche",
              rhythm: "Eigenständige synkopierte Rhythmen",
              voice: "Eigener Stimmcharakter",
            },
          },
        });
      }
    }
  }
  return original(input, init);
};
