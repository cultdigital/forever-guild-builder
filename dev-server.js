// Local preview: serves /public and routes /api/roster to the same handler Vercel runs.
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { handle } from './lib/handler.js';

const PORT = process.env.PORT || 3000;
const ROOT = path.resolve('public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/roster') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    const out = await handle({ method: req.method, query: Object.fromEntries(u.searchParams), body });
    res.writeHead(out.status, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(out.json));
  }
  const file = path.join(ROOT, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(PORT, () => console.log(`Roster running at http://localhost:${PORT}`));
