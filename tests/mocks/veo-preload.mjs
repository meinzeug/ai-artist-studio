// Offline Google fixture. Only the isolated browser-test process loads this file.
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { readFile } from 'node:fs/promises';
if (new URL(process.env.DATABASE_URL || 'http://invalid').pathname !== '/artist_studio_test') throw new Error('Veo fixture requires test DB.');
const nativeFetch = globalThis.fetch;
const model = 'veo-3.1-fast-generate-preview';
const operation = `models/${model}/operations/offline-browser-veo`;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith('https://generativelanguage.googleapis.com/')) return nativeFetch(input, init);
  if (new Headers(init?.headers).get('x-goog-api-key') !== 'veo-browser-test-key') return new Response('offline unauthorized', {status:403});
  if (url.endsWith('/models/' + model)) return Response.json({name:'models/'+model, supportedGenerationMethods:['predictLongRunning']});
  if (url.endsWith(':predictLongRunning') && init?.method === 'POST') return Response.json({name:operation});
  if (url.endsWith('/' + operation)) return Response.json({name:operation, done:true, response:{generateVideoResponse:{generatedSamples:[{video:{uri:'https://generativelanguage.googleapis.com/v1beta/files/offline-test:download?alt=media'}}]}}});
  throw new Error('Unexpected Google API path in offline fixture');
};
const nativeGet = https.get;
https.get = function(url, options, callback) {
  if (String(url) !== 'https://generativelanguage.googleapis.com/v1beta/files/offline-test:download?alt=media') return nativeGet.call(this,url,options,callback);
  const req = new EventEmitter();
  req.setTimeout = () => req;
  req.destroy = e => { if(e) req.emit('error',e); return req; };
  readFile('.local/fixtures/SYNTHETIC-VEO.mp4').then(bytes => {
    const res = new PassThrough(); res.statusCode=200; res.headers={'content-length':String(bytes.length)};
    callback(res); res.end(bytes);
  }).catch(e => req.destroy(e));
  return req;
};
