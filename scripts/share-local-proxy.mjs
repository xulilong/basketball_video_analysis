import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const digest = (value) => createHash('sha256').update(value).digest();
const MAX_UPLOAD = 90 * 1024 * 1024;
const legacy = new Set(['/api/local-sample', '/api/sample-review', '/api/automatic-scores']);

export function createShareProxy({ username, password, getOrigin, targetPort = 3001, requirePassword = true }) {
  if (!username || !password) throw new Error('Share credentials are required');
  const expected = digest('Basic ' + Buffer.from(`${username}:${password}`).toString('base64'));
  return http.createServer((req, res) => {
    const reply = (status, message) => {
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
      res.end(JSON.stringify({ error: message }));
    };
    if (requirePassword && !timingSafeEqual(digest(req.headers.authorization || ''), expected)) {
      res.setHeader('www-authenticate', 'Basic realm="MT Trial", charset="UTF-8"');
      reply(401, '请输入试用用户名和密码');
      return;
    }
    let origin;
    try { origin = getOrigin(); } catch { reply(503, '公网连接正在准备'); return; }
    // Reject cross-site requests before translating the trusted public origin.
    if (req.headers.origin && req.headers.origin !== origin) {
      reply(403, '不接受其他网站发起的请求'); return;
    }
    if (!['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'].includes(req.method)) {
      reply(405, '请求方法不支持'); return;
    }
    const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '') || '/';
    if (legacy.has(pathname)) { reply(404, '该样例接口未开放'); return; }
    if (Number(req.headers['content-length']) > MAX_UPLOAD) {
      reply(413, '公网试用上传请控制在 90 MB 以内；较大视频可由管理员在本机上传'); return;
    }
    const headers = { ...req.headers, host: `127.0.0.1:${targetPort}` };
    for (const key of Object.keys(headers)) {
      if (key === 'authorization' || key === 'forwarded' || key.startsWith('x-forwarded-') || key.startsWith('cf-') || key === 'connection' || key === 'upgrade') delete headers[key];
    }
    headers['x-forwarded-proto'] = 'https';
    if (headers.origin) headers.origin = `https://127.0.0.1:${targetPort}`;
    const upstream = http.request({ hostname: '127.0.0.1', port: targetPort, path: req.url, method: req.method, headers }, (response) => {
      if (res.writableEnded) { response.destroy(); return; }
      const responseHeaders = { ...response.headers, 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' };
      res.writeHead(response.statusCode, responseHeaders);
      response.on('error', () => res.destroy());
      response.pipe(res);
    });
    upstream.on('error', () => { if (!res.writableEnded) reply(502, '本机工作台暂时不可用，请稍后重试'); });
    let received = 0;
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > MAX_UPLOAD && !res.writableEnded) {
        req.unpipe(upstream);
        reply(413, '公网试用上传请控制在 90 MB 以内');
        upstream.destroy();
      }
    });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
    req.pipe(upstream);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const filename = process.argv[2];
  if (!filename) throw new Error('Pass the private access configuration path');
  const credentials = JSON.parse(readFileSync(filename, 'utf8'));
  const server = createShareProxy({ ...credentials, requirePassword: credentials.accountMode !== true, getOrigin: () => JSON.parse(readFileSync(filename, 'utf8')).origin });
  server.listen(3004, '127.0.0.1', () => console.log('Protected sharing gateway listening on 127.0.0.1:3004'));
}
