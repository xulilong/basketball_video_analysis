import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createShareProxy } from './share-local-proxy.mjs';

test('share gateway protects all routes, checks origins, preserves uploads and ranges', async () => {
  const upstream = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    if (req.headers.range) { res.writeHead(206, {'content-range':'bytes 0-2/3'}); res.end('abc'); return; }
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({ path:req.url, origin:req.headers.origin, auth:req.headers.authorization, host:req.headers.host, forwarded:req.headers['x-forwarded-host'], data:Buffer.concat(chunks).toString() }));
  });
  await new Promise(resolve => upstream.listen(0,'127.0.0.1',resolve));
  const port=upstream.address().port;
  const proxy=createShareProxy({username:'trial',password:'test-only',getOrigin:()=> 'https://trial.example',targetPort:port});
  await new Promise(resolve => proxy.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${proxy.address().port}`;
  const authorization='Basic '+Buffer.from('trial:test-only').toString('base64');
  try {
    for (const path of ['/', '/api/players','/api/player-photos/a.jpg','/api/videos/v/media']) assert.equal((await fetch(url+path)).status,401);
    assert.equal((await fetch(url+'/', {headers:{authorization:'wrong'}})).status,401);
    assert.equal((await fetch(url+'/api/local-sample',{headers:{authorization}})).status,404);
    assert.equal((await fetch(url+'/api/videos',{method:'POST',headers:{authorization,origin:'https://evil.example'},body:'x'})).status,403);
    const response=await fetch(url+'/api/videos',{method:'POST',headers:{authorization,origin:'https://trial.example','x-forwarded-host':'evil.example'},body:'video-bytes'});
    assert.equal(response.status,200);
    assert.match(response.headers.get('cache-control'),/no-store/);
    const data=await response.json();
    assert.equal(data.data,'video-bytes');assert.equal(data.auth,undefined);assert.equal(data.forwarded,undefined);
    assert.equal(data.origin,`https://127.0.0.1:${port}`);
    const range=await fetch(url+'/api/videos/v/media',{headers:{authorization,range:'bytes=0-2'}});
    assert.equal(range.status,206);assert.equal(await range.text(),'abc');
    const rejected=await new Promise((resolve,reject)=>{
      const req=http.request(url+'/api/videos',{method:'POST',headers:{authorization,'content-length':100*1024*1024}},res=>{res.resume();resolve(res.statusCode)});
      req.on('error',reject);req.end();
    });
    assert.equal(rejected,413);
  } finally { proxy.closeAllConnections();upstream.closeAllConnections();await Promise.all([new Promise(r=>proxy.close(r)),new Promise(r=>upstream.close(r))]); }
});
