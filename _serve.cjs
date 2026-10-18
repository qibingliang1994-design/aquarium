const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const pub = path.join(root, 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.glb': 'model/gltf-binary' };

// 只允许读 base 目录内的文件：拒绝 ../ 与编码过的穿越（%2e%2e%2f）以及绝对路径
function within(base, rel) {
  const p = path.resolve(base, '.' + path.sep + rel);
  return p === base || p.startsWith(base + path.sep) ? p : null;
}

const port = Number(process.env.PORT) || 8791;

http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent((req.url || '/').split('?')[0]); }
  catch { res.writeHead(400); res.end('bad request'); return; }   // 畸形 %xx 不能让进程崩掉
  if (rel === '/') rel = '/index.html';
  if (rel.includes('\0')) { res.writeHead(400); res.end('bad request'); return; }
  const p = within(root, rel), pp = within(pub, rel);
  if (!p) { res.writeHead(403); res.end('forbidden'); return; }
  const send = (file, data) => {
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.end(data);
  };
  fs.readFile(p, (err, data) => {
    if (!err) { send(p, data); return; }
    if (!pp) { res.writeHead(404); res.end('not found'); return; }
    fs.readFile(pp, (err2, data2) => {
      if (err2) { res.writeHead(404); res.end('not found'); return; }
      send(pp, data2);
    });
  });
}).listen(port, '127.0.0.1', () => console.log(`serving http://127.0.0.1:${port}/`));
