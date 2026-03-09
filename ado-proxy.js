#!/usr/bin/env node

const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3131;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) 
  : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];

const proxy = http.createServer((req, res) => {
  const origin = req.headers.origin;
  
  if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-Target-URL');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const targetUrl = req.headers['x-target-url'];
  
  if (!targetUrl) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing X-Target-URL header' }));
    return;
  }

  const isHttps = targetUrl.startsWith('https://');
  const client = isHttps ? https : http;

  const options = {
    method: req.method,
    headers: {
      ...req.headers,
      host: undefined,
      origin: undefined,
      referer: undefined,
    },
  };

  const proxyReq = client.request(targetUrl, options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-Target-URL',
      'Access-Control-Allow-Credentials': 'true',
    });

    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[proxy] Request error: ${err.message}`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad gateway', message: err.message }));
  });

  req.pipe(proxyReq);
});

proxy.on('listening', () => {
  console.log(`ADO Proxy running on http://127.0.0.1:${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});

proxy.on('error', (err) => {
  console.error(`[proxy] Server error: ${err.message}`);
  process.exit(1);
});

proxy.listen(PORT, '127.0.0.1');
