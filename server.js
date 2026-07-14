import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

/** Backend origin for API + Socket.IO proxy (e.g. https://mip-backend.onrender.com). */
function getBackendOrigin() {
  const fallback = (process.env.BACKEND_PUBLIC_URL || 'https://venmai-api.onrender.com').replace(/\/$/, '');
  const raw = (process.env.BACKEND_URL || process.env.API_PROXY_TARGET || '').trim();
  if (!raw) return fallback;

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProtocol);
    // Internal Render hosts like "mip-backend-x9n2" have no dot and do not resolve publicly.
    if (!u.hostname.includes('.')) return fallback;
    return `${u.protocol}//${u.host}`.replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.eot':  'application/vnd.ms-fontobject',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4':  'video/mp4',
  '.csv':  'text/csv',
};

function shouldProxy(urlPath) {
  return urlPath.startsWith('/api') || urlPath.startsWith('/socket.io') || urlPath === '/health';
}

function proxyRequest(clientReq, clientRes, backendOrigin) {
  const target = new URL(clientReq.url, backendOrigin);
  const lib = target.protocol === 'https:' ? https : http;
  const headers = { ...clientReq.headers, host: target.host };

  const proxyReq = lib.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: target.pathname + target.search,
      method: clientReq.method,
      headers,
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(clientRes);
    },
  );

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { 'Content-Type': 'application/json' });
    }
    clientRes.end(JSON.stringify({ error: 'Bad gateway', detail: err.message }));
  });

  clientReq.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const backendOrigin = getBackendOrigin();

  if (backendOrigin && shouldProxy(urlPath)) {
    proxyRequest(req, res, backendOrigin);
    return;
  }

  let filePath = path.join(DIST_DIR, urlPath);

  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    const indexPath = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(indexPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }
});

server.on('upgrade', (req, socket, head) => {
  const backendOrigin = getBackendOrigin();
  const urlPath = (req.url || '').split('?')[0];
  if (!backendOrigin || !urlPath.startsWith('/socket.io')) {
    socket.destroy();
    return;
  }

  const target = new URL(req.url, backendOrigin);
  const lib = target.protocol === 'https:' ? https : http;
  const headers = { ...req.headers, host: target.host };

  const proxyReq = lib.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: target.pathname + target.search,
    method: 'GET',
    headers,
  });

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(proxyRes.headers)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join('\r\n') +
        '\r\n\r\n',
    );
    if (proxyHead?.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  proxyReq.on('error', () => socket.destroy());
  proxyReq.end();
});

server.listen(PORT, HOST, () => {
  const backend = getBackendOrigin();
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log(backend ? `API proxy → ${backend}` : 'API proxy disabled (set BACKEND_URL)');
});
