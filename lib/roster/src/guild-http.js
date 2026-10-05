import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGuildApi } from './guild-api.js';
import { GuildError } from './guild-redis.js';

const workspace = fileURLToPath(new URL('../../../', import.meta.url));
const publicDir = path.join(workspace, 'artifacts/raid-roster/public');
const sourceDir = path.join(workspace, 'artifacts/raid-roster/src');
const GUILD_ROBOTS = 'noindex, nofollow, noarchive, nosnippet, noimageindex';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
const assets = {
  '/styles.css': path.join(sourceDir, 'index.css'),
  '/assets/roster.html': path.join(sourceDir, 'legacy/roster.html'),
  '/assets/app.js': path.join(sourceDir, 'legacy/app.js'),
  '/assets/split-controls.js': path.join(sourceDir, 'legacy/split-controls.js'),
  '/assets/data.js': path.join(workspace, 'lib/roster/src/data.js'),
};

export function securityHeaders(production = false) {
  // Existing roster HTML uses safe, generated style attributes for class colours
  // and meter widths. This exception does not permit inline scripts or handlers.
  const framing = production ? "'none'" : "'self' https://*.replit.com https://*.replit.dev";
  return {
    'Content-Security-Policy': [
      "default-src 'self'", "script-src 'self' https://challenges.cloudflare.com",
      "style-src 'self' https://fonts.googleapis.com", "style-src-attr 'unsafe-inline'",
      "font-src 'self' https://fonts.gstatic.com", "img-src 'self'",
      "connect-src 'self' https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com", `frame-ancestors ${framing}`,
      "object-src 'none'", "base-uri 'self'", "form-action 'self'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  };
}

export function readJson(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new GuildError('Send writes as application/json.', 415);
  }
  if (Number(req.headers['content-length']) > 8192) {
    req.resume();
    throw new GuildError('Request too large. The maximum is 8 KB.', 413);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > 8192) {
        settled = true;
        chunks.length = 0;
        reject(new GuildError('Request too large. The maximum is 8 KB.', 413));
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
        resolve(body);
      } catch { reject(new GuildError('Send a valid JSON object.', 400)); }
    });
    req.on('error', () => reject(new GuildError('The request could not be read.', 400)));
    req.on('aborted', () => reject(new GuildError('The request was interrupted.', 400)));
  });
}

export function createGuildHttpServer({ env = process.env, api = createGuildApi({ env }) } = {}) {
  return http.createServer({ maxHeaderSize: 16384, requestTimeout: 15000 }, async (req, res) => {
    for (const [header, value] of Object.entries(securityHeaders(env.NODE_ENV === 'production'))) res.setHeader(header, value);
    function json(status, value) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(value));
    }
    try {
      const url = new URL(req.url, 'http://internal.invalid');
      let decodedPath = url.pathname;
      try { decodedPath = decodeURIComponent(decodedPath); } catch { /* retain the raw path for malformed URLs */ }
      const privateGuildPath = /^\/g(?:\/|$)/i.test(decodedPath);
      // Set before routing so login pages, assets, HEAD and error responses are covered.
      if (privateGuildPath) res.setHeader('X-Robots-Tag', GUILD_ROBOTS);
      if (url.pathname.startsWith('/api/')) {
        const writing = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
        if (writing) {
          let origin;
          try { origin = new URL(req.headers.origin); } catch { /* rejected below */ }
          const trustProxy = env.TRUST_PROXY === '1' || (env.TRUST_PROXY !== '0' && Boolean(env.REPL_ID));
          const forwarded = trustProxy && req.headers['x-forwarded-host'];
          const siteHost = typeof forwarded === 'string' ? forwarded.split(',').at(-1).trim() : req.headers.host;
          if (!origin || origin.host !== siteHost || !['http:', 'https:'].includes(origin.protocol) ||
              (env.NODE_ENV === 'production' && origin.protocol !== 'https:')) {
            throw new GuildError('This write must come from this site. Reload the page and try again.', 403);
          }
        }
        const body = writing ? await readJson(req) : {};
        const result = await api({ req, pathname: url.pathname, body, query: Object.fromEntries(url.searchParams) });
        if (result.cookie) res.setHeader('Set-Cookie', result.cookie);
        json(result.status, result.json);
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new GuildError('Method not allowed.', 405);
      let target;
      if (url.pathname === '/' || url.pathname === '/privacy' || /^\/g\/[a-z0-9-]+\/?$/.test(url.pathname)) {
        target = path.join(publicDir, 'index.html');
      } else if (assets[url.pathname]) target = assets[url.pathname];
      else {
        const decoded = decodeURIComponent(url.pathname);
        if (decoded.split('/').some((part) => part.startsWith('.'))) throw new GuildError('Not found.', 404);
        target = path.resolve(publicDir, `.${decoded}`);
        if (!target.startsWith(`${publicDir}${path.sep}`)) throw new GuildError('Not found.', 404);
      }
      const type = MIME[path.extname(target)];
      if (!type) throw new GuildError('Not found.', 404);
      let contents = await readFile(target);
      if (privateGuildPath && path.extname(target) === '.html') {
        contents = Buffer.from(contents.toString('utf8').replace('</head>', `<meta name="robots" content="${GUILD_ROBOTS}">\n</head>`));
      }
      res.writeHead(200, { 'Content-Type': type });
      res.end(req.method === 'HEAD' ? undefined : contents);
    } catch (error) {
      const status = error instanceof GuildError ? error.status : error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500;
      if (status === 413) res.setHeader('Connection', 'close');
      json(status, { error: error instanceof GuildError ? error.message : status === 404 ? 'Not found.' : 'The server could not complete the request. Please try again shortly.' });
    }
  });
}