#!/usr/bin/env node
/**
 * ado-server.js
 * Unified server for ADO SuperUI:
 *   - Proxies ADO API requests on behalf of the browser (replaces ado-proxy.js)
 *   - Persists user collections server-side, keyed by ADO profile ID
 *
 * Routes:
 *   OPTIONS  *               CORS preflight
 *   POST     /ado-proxy      Proxy a request to Azure DevOps (X-Target-URL header)
 *   GET      /collections    Fetch stored collections for the authenticated user
 *   PUT      /collections    Save collections for the authenticated user
 *   GET      /health         Liveness check
 */

import http   from 'node:http';
import https  from 'node:https';
import crypto from 'node:crypto';
import path   from 'node:path';
import fs     from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3000', 10);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'ado-superui.db');
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

// ── SQLite setup (node:sqlite — built-in since Node 22, stable in Node 24) ───

let db;
try {
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      profile_id  TEXT PRIMARY KEY,
      pat_hash    TEXT NOT NULL,
      collections TEXT NOT NULL DEFAULT '[]',
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  console.log(`[db] SQLite database at ${DB_PATH}`);
} catch (err) {
  console.error(`[db] Failed to open SQLite database: ${err.message}`);
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function setCors(res, origin) {
  if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Authorization, Content-Type, Accept, X-Target-URL, X-Profile-Id, X-Pat-Hash');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function json(res, status, body, origin) {
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function serveStatic(req, res, origin) {
  let filePath = path.join(DIST_PATH, req.url.split('?')[0]);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    if (!fs.existsSync(filePath)) {
      return null;
    }
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(content);
    return true;
  } catch (err) {
    console.error(`[static] Error serving ${filePath}: ${err.message}`);
    return false;
  }
}

function serveSpa(req, res, origin) {
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

// ── Persistence handlers ──────────────────────────────────────────────────────

function handleGetCollections(req, res, origin) {
  const profileId = req.headers['x-profile-id'];
  if (!profileId) return json(res, 400, { error: 'Missing X-Profile-Id header' }, origin);

  try {
    const stmt = db.prepare('SELECT collections FROM users WHERE profile_id = ?');
    const row  = stmt.get(profileId);
    if (!row) return json(res, 200, { collections: [] }, origin);
    return json(res, 200, { collections: JSON.parse(row.collections) }, origin);
  } catch (err) {
    console.error('[db] GET collections error:', err.message);
    return json(res, 500, { error: 'Database error' }, origin);
  }
}

async function handlePutCollections(req, res, origin) {
  const profileId = req.headers['x-profile-id'];
  const patHash   = req.headers['x-pat-hash'];

  if (!profileId) return json(res, 400, { error: 'Missing X-Profile-Id header' }, origin);
  if (!patHash)   return json(res, 400, { error: 'Missing X-Pat-Hash header' }, origin);

  let body;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    return json(res, 400, { error: 'Invalid JSON body' }, origin);
  }

  const collections = body.collections;
  if (!Array.isArray(collections)) {
    return json(res, 400, { error: 'Body must have a "collections" array' }, origin);
  }

  try {
    const collectionsJson = JSON.stringify(collections);
    // Upsert: profile ID is the key; update pat_hash silently on rotation
    const stmt = db.prepare(`
      INSERT INTO users (profile_id, pat_hash, collections, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(profile_id) DO UPDATE SET
        pat_hash    = excluded.pat_hash,
        collections = excluded.collections,
        updated_at  = datetime('now')
    `);
    stmt.run(profileId, patHash, collectionsJson);
    return json(res, 200, { ok: true }, origin);
  } catch (err) {
    console.error('[db] PUT collections error:', err.message);
    return json(res, 500, { error: 'Database error' }, origin);
  }
}

async function handleCollectionsAction(req, res, origin, action) {
  const profileId = req.headers['x-profile-id'];
  const patHash   = req.headers['x-pat-hash'];

  if (action === 'get-collections') {
    if (!profileId) return json(res, 400, { error: 'Missing X-Profile-Id header' }, origin);
    try {
      const stmt = db.prepare('SELECT collections FROM users WHERE profile_id = ?');
      const row  = stmt.get(profileId);
      if (!row) return json(res, 200, { collections: [] }, origin);
      return json(res, 200, { collections: JSON.parse(row.collections) }, origin);
    } catch (err) {
      console.error('[db] get-collections error:', err.message);
      return json(res, 500, { error: 'Database error' }, origin);
    }
  }

  if (action === 'save-collections') {
    if (!profileId) return json(res, 400, { error: 'Missing X-Profile-Id header' }, origin);
    if (!patHash)   return json(res, 400, { error: 'Missing X-Pat-Hash header' }, origin);

    let body;
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw);
    } catch {
      return json(res, 400, { error: 'Invalid JSON body' }, origin);
    }

    const collections = body.collections;
    if (!Array.isArray(collections)) {
      return json(res, 400, { error: 'Body must have a "collections" array' }, origin);
    }

    try {
      const collectionsJson = JSON.stringify(collections);
      const stmt = db.prepare(`
        INSERT INTO users (profile_id, pat_hash, collections, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(profile_id) DO UPDATE SET
          pat_hash    = excluded.pat_hash,
          collections = excluded.collections,
          updated_at  = datetime('now')
      `);
      stmt.run(profileId, patHash, collectionsJson);
      return json(res, 200, { ok: true }, origin);
    } catch (err) {
      console.error('[db] save-collections error:', err.message);
      return json(res, 500, { error: 'Database error' }, origin);
    }
  }

  return json(res, 404, { error: 'Unknown action' }, origin);
}

// ── ADO proxy handler ─────────────────────────────────────────────────────────

async function handleProxy(req, res, origin) {
  const targetUrl = req.headers['x-target-url'];
  if (!targetUrl) {
    return json(res, 400, { error: 'Missing X-Target-URL header' }, origin);
  }

  // Check for internal actions first
  if (targetUrl.includes('save-collections') || targetUrl.includes('get-collections')) {
    const action = targetUrl.includes('save-collections') ? 'save-collections' : 'get-collections';
    return handleCollectionsAction(req, res, origin, action);
  }

  const isHttps  = targetUrl.startsWith('https://');
  const upstream = isHttps ? https : http;

  // Forward everything except hop-by-hop / routing headers
  // Strip accept-encoding so ADO returns plain JSON (not gzip) — the proxy
  // pipes the body as-is and drops Content-Encoding, which would cause the
  // browser to receive compressed bytes it can't decode.
  const forwardHeaders = { ...req.headers };
  delete forwardHeaders['host'];
  delete forwardHeaders['origin'];
  delete forwardHeaders['referer'];
  delete forwardHeaders['x-target-url'];
  delete forwardHeaders['x-profile-id'];
  delete forwardHeaders['x-pat-hash'];
  delete forwardHeaders['accept-encoding'];

  const options = { method: req.method, headers: forwardHeaders };

  const proxyReq = upstream.request(targetUrl, options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':
        'Authorization, Content-Type, Accept, X-Target-URL, X-Profile-Id, X-Pat-Hash',
      'Access-Control-Allow-Credentials': 'true',
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[proxy] Upstream error: ${err.message}`);
    json(res, 502, { error: 'Bad gateway', message: err.message }, origin);
  });

  req.pipe(proxyReq);
}

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

  // Persistence routes
  if (url === '/collections') {
    if (req.method === 'GET') return handleGetCollections(req, res, origin);
    if (req.method === 'PUT') return handlePutCollections(req, res, origin);
    return json(res, 405, { error: 'Method not allowed' }, origin);
  }

  // ADO proxy route — explicit path
  if (url === '/ado-proxy') {
    return handleProxy(req, res, origin);
  }

  // Legacy fallback: old proxy used root path with X-Target-URL header
  if (req.headers['x-target-url']) {
    return handleProxy(req, res, origin);
  }

  // Try static files first
  if (serveStatic(req, res, origin)) {
    return;
  }

  // SPA fallback for client-side routing
  if (serveSpa(req, res, origin)) {
    return;
  }

  return json(res, 404, { error: 'Not found' }, origin);
});

server.on('listening', () => {
  console.log(`ADO Server running on http://127.0.0.1:${PORT}`);
  console.log(`  Proxy:       POST /ado-proxy  (legacy: any path with X-Target-URL)`);
  console.log(`  Collections: GET|PUT /collections`);
  console.log(`  Health:      GET /health`);
  console.log(`  Static:      GET / (serves SPA from ${DIST_PATH})`);
  console.log(`  DB:          ${DB_PATH}`);
  console.log(`  Origins:     ${ALLOWED_ORIGINS.join(', ')}`);
});

server.on('error', (err) => {
  console.error(`[server] Error: ${err.message}`);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1');
