// Synthetic text provider only for the explicitly named isolated browser fixture.
if (new URL(process.env.DATABASE_URL || 'http://invalid').pathname !== '/artist_studio_test') throw Error('Isolated test database required');
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.endsWith('/run') && init?.method === 'POST') {
    const body = JSON.parse(String(init.body));
    if (body.prompt?.includes('SYNTHETIC MANUAL START ARTIST') && body.prompt?.includes('Plane die heutige vollständige Produktion'))
      return Response.json({ result: {
        idea: { title: 'SYNTHETIC · Neue Wege', premise: 'Ein erster Schritt in einen neuen Morgen', conflict: 'Aufbruch und Zweifel', hook: 'Die Tür steht offen', direction: 'Indiepop', video_idea: 'Licht im Fenster', rationale: 'Neue kreative Testidee ohne behauptete Messdaten' },
        lyrics: { title: 'SYNTHETIC · Neue Wege', lyrics: '[Verse]\nIch öffne meine Tür\n[Chorus]\nDer Morgen steht schon hier', style_prompt: 'Warm indie pop, 96 BPM' },
        scene_prompt: 'Synthetischer virtueller Charakter vor einem hellen Fenster, reine Testproduktion.',
        clips: ['opening','middle','ending'].map((segment,i) => ({ title: 'Testclip '+i, caption: 'Synthetischer virtueller KI-Musikcharakter, Softwaretest.', hashtags: '#Test', overlay: 'Neuer Morgen', segment })),
      }, usage: { synthetic_fixture: true } });
  }
  return original(input, init);
};
