// Explicit offline API fixture for browser tests only. Never loaded by the app.
if(new URL(process.env.DATABASE_URL||'http://invalid').pathname!=='/artist_studio_test')throw new Error('Suno test fixture requires isolated test database.');
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=typeof input==='string'?input:input instanceof URL?input.toString():input.url;
 if(!url.startsWith('https://api.sunoapi.org/'))return originalFetch(input,init);
 const auth=new Headers(init?.headers).get('authorization');
 if(auth!=='Bearer studio-test-key')return Response.json({code:401,msg:'Mock: invalid test key'});
 if(url.endsWith('/api/v1/generate/credit'))return Response.json({code:200,data:125});
 if(url.includes('/api/v1/generate/record-info'))return Response.json({code:200,data:{taskId:new URL(url).searchParams.get('taskId'),status:'PENDING',response:null}});
 if(url.endsWith('/api/v1/generate')&&init?.method==='POST')return Response.json({code:200,data:{taskId:'offline-browser-task'}});
 throw new Error('Undocumented API request in Suno fixture');
};
