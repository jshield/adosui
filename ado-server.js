#!/usr/bin/env node
/**
 * ado-server.js
 * Optional static file server for ADO SuperUI (SPA).
 *
 * NOTE: The proxy routes below are deprecated. The SPA now calls Azure DevOps
 * directly from the browser (CORS is allowed by dev.azure.com).
 *
 * This server remains useful only for:
 *   - Serving the built SPA from a local directory (e.g. for self-hosting)
 *
 * Routes:
 *   OPTIONS  *               CORS preflight (still enabled)
 *   POST     /ado-proxy      [DEPRECATED] Proxy a request to Azure DevOps
 *   GET      /health         Liveness check
 *   GET      /               Static SPA files + SPA fallback
 */

import http   from 'node:http';
import https  from 'node:https';
import path   from 'node:path';
import fs     from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3000', 10);
const DIST_PATH = process.env.DIST_PATH || path.join(__dirname, 'dist');
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost:5173',
     'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];

const MIME_TYPES = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
  '.eot':  'application/vnd.ms-fontobject',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function setCors(res, origin) {
  if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Authorization, Content-Type, Accept, X-Target-URL');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function json(res, status, body, origin) {
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function serveStatic(req, res) {
  let filePath = path.join(DIST_PATH, req.url.split('?')[0]);

  if (!fs.existsSync(filePath)) return null;

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    if (!fs.existsSync(filePath)) return null;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
    res.end(content);
    return true;
  } catch (err) {
    console.error(`[static] Error serving ${filePath}: ${err.message}`);
    return false;
  }
}

function serveSpa(res, origin) {
  const indexPath = path.join(DIST_PATH, 'index.html');

  if (!fs.existsSync(indexPath)) {
    return json(res, 500, { error: 'SPA index not found. Run npm run build first.' }, origin);
  }

  try {
    const content = fs.readFileSync(indexPath);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
    return true;
  } catch (err) {
    console.error(`[spa] Error serving index.html: ${err.message}`);
    return json(res, 500, { error: 'Failed to serve SPA' }, origin);
  }
}

// ── ADO proxy handler ─────────────────────────────────────────────────────────

// ── Main request router ───────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  setCors(res, origin);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split('?')[0];

  // Health check
  if (url === '/health' && req.method === 'GET') {
    return json(res, 200, { ok: true, ts: new Date().toISOString() }, origin);
  }



  // Try static files first
  if (serveStatic(req, res)) return;

  // SPA fallback for client-side routing
  if (serveSpa(res, origin)) return;

  return json(res, 404, { error: 'Not found' }, origin);
});

server.on('listening', () => {
  console.log(`ADO SuperUI server running on http://127.0.0.1:${PORT}`);
  console.log(`  Static:  GET / (serves SPA from ${DIST_PATH})`);
  console.log(`  Health:  GET /health`);
  console.log(`  Origins: ${ALLOWED_ORIGINS.join(', ')}`);
});

server.on('error', (err) => {
  console.error(`[server] Error: ${err.message}`);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1');
