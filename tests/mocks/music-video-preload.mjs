// Explicitly synthetic full-song browser fixture. Never loaded in production.
if(new URL(process.env.DATABASE_URL||'http://invalid').pathname!=='/artist_studio_test')throw Error('Isolated test database required');
const original=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.toString():input.url;
  if(url.endsWith('/run')&&init?.method==='POST'){
    const body=JSON.parse(String(init.body));
    if(body.prompt?.includes('SYNTHETIC FULL-SONG BROWSER TEST')&&body.prompt?.includes('Regisseur und Art Director')){
      const context=JSON.parse(body.prompt.split('\nDATA:\n')[1].split('\nENDE DATA')[0]);
      return Response.json({result:{treatment:'Synthetisches Storyboard mit vier eigenständigen filmischen Bildern, ausschließlich für diesen Browsertest.',visual_style:'Warme grafische Testflächen. Gleicher virtueller Artist, unterschiedliche Bildkompositionen.',caption:'Synthetisches Test-Musikvideo, virtueller KI-gestützter Artist. Keine echte Providerproduktion.',hashtags:'#Softwaretest',scenes:context.lyrics.lyrics.split('\n').map((lyric_excerpt,i)=>({title:'Testszene '+(i+1),lyric_excerpt,prompt:`Synthetisches Motiv ${i+1} mit einer anderen Farbe, filmischem Licht und bewusst geänderter Komposition.`,camera:['push_in','pan_left','pull_out','pan_right'][i],weight:1}))},usage:{fixture:true}});
    }
  }
  return original(input,init);
};
