import test from 'node:test';
import assert from 'node:assert/strict';
import { createRedisClient, GuildError } from '../../lib/roster/src/guild-redis.js';
import { createSessionManager, hashGuildCredential, verifyGuildCredential, SESSION_SECONDS } from '../../lib/roster/src/guild-sessions.js';
import { createGuildRepository, GUILD_TTL_SECONDS, publicGuild } from '../../lib/roster/src/guild-store.js';
import { createGuildApi } from '../../lib/roster/src/guild-api.js';
import { createGuildHttpServer, securityHeaders } from '../../lib/roster/src/guild-http.js';
import http from 'node:http';

// Isolated transport fixtures only. No real Redis connection, files, app bypass,
// test guilds in the live database, or environment secrets are involved.
function fixture() {
  const commands = [];
  const values = new Map();
  const guilds = [
    { id: 'guild-a', slug: 'alpha-ab12', name: 'Alpha', faction: 'horde', keyVersion: 1, keyHash: 'private', recoveryHash: 'private', salt: 'private' },
    { id: 'guild-b', slug: 'beta-cd34', name: 'Beta', faction: 'alliance', keyVersion: 1 },
  ];
  for (const guild of guilds) {
    values.set(`guild:${guild.id}:meta`, JSON.stringify(guild));
    values.set(`guild:slug:${guild.slug}`, guild.id);
    values.set(`guild:${guild.id}:members`, [guild.id, JSON.stringify({ id: guild.id, name: guild.name })]);
    values.set(`guild:${guild.id}:splits`, [guild.id, JSON.stringify({ id: guild.id, name: `${guild.name} plan`, teams: [] })]);
  }
  const redis = createRedisClient({
    env: { KV_REST_API_URL: 'https://fixture.invalid', KV_REST_API_TOKEN: 'fixture-only' },
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://fixture.invalid');
      assert.equal(options.headers.Authorization, 'Bearer fixture-only');
      const args = JSON.parse(options.body);
      commands.push(args);
      let result = null;
      if (['GET', 'HGETALL'].includes(args[0])) result = values.get(args[1]) ?? null;
      else if (args[0] === 'HGET') {
        const hash = values.get(args[1]) || [];
        const at = hash.indexOf(args[2]);
        result = at === -1 ? null : hash[at + 1];
      } else if (args[0] === 'EVAL') {
        if (args[1].includes("redis.call('INCR'")) {
          result = (values.get(args[3]) || 0) + 1;
          values.set(args[3], result);
        } else if (!values.has(args[3])) result = -1;
        else {
          const hashKey = args[4];
          const [operation, recordId, raw] = args.slice(8);
          const hash = [...(values.get(hashKey) || [])];
          const at = hash.indexOf(recordId);
          if (operation === 'member' && at === -1 && hash.length / 2 >= 100) result = -2;
          else {
            if (operation === 'remove') { if (at !== -1) hash.splice(at, 2); }
            else if (at === -1) hash.push(recordId, raw);
            else hash[at + 1] = raw;
            values.set(hashKey, hash);
            result = 1;
          }
        }
      }
      else throw new Error('Unexpected fixture command');
      return Response.json({ result });
    },
  });
  return { commands, values, guilds, redis, repository: createGuildRepository(redis) };
}

test('Vercel KV names work without Upstash-prefixed duplicates', async () => {
  const { repository } = fixture();
  assert.equal((await repository.findGuild('alpha-ab12')).id, 'guild-a');
});

test('a complete Upstash pair takes precedence; incomplete pairs are not mixed', async () => {
  let seen;
  const redis = createRedisClient({
    env: { UPSTASH_REDIS_REST_URL: 'https://upstash.invalid', UPSTASH_REDIS_REST_TOKEN: 'upstash-fixture', KV_REST_API_URL: 'https://kv.invalid', KV_REST_API_TOKEN: 'kv-fixture' },
    fetchImpl: async (url, options) => { seen = [url, options.headers.Authorization]; return Response.json({ result: 'PONG' }); },
  });
  assert.equal(await redis.command(['PING']), 'PONG');
  assert.deepEqual(seen, ['https://upstash.invalid', 'Bearer upstash-fixture']);
  const missing = createRedisClient({ env: { UPSTASH_REDIS_REST_URL: 'https://upstash.invalid', KV_REST_API_TOKEN: 'kv-fixture' } });
  assert.equal(missing.configured, false);
  await assert.rejects(missing.command(['PING']), (e) => e instanceof GuildError && e.status === 503);
});

test('missing Redis fails explicitly, with no development file fallback', async () => {
  const redis = createRedisClient({ env: {}, fetchImpl: () => { throw new Error('Must not fetch'); } });
  assert.equal(redis.configured, false);
  await assert.rejects(redis.command(['HGETALL', 'guild:any:members']), { status: 503 });
});

test('network, HTTP, malformed JSON and Redis errors are safely reported', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('sensitive upstream text'); },
    async () => new Response('sensitive upstream text', { status: 401 }),
    async () => new Response('not JSON'),
    async () => Response.json({ error: 'sensitive upstream text' }),
    async () => Response.json({ unexpected: 'sensitive upstream text' }),
  ]) {
    const redis = createRedisClient({ env: { KV_REST_API_URL: 'https://fixture.invalid', KV_REST_API_TOKEN: 'fixture' }, fetchImpl });
    await assert.rejects(redis.command(['PING']), (e) => e.status === 503 && !e.message.includes('sensitive'));
  }
});

test('salted scrypt hashes verify keys and recovery codes without storing plaintext', async () => {
  const credential = 'test-only-not-a-real-guild-key';
  const first = await hashGuildCredential(credential);
  const second = await hashGuildCredential(credential);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(await verifyGuildCredential(credential, first.hash, first.salt), true);
  assert.equal(await verifyGuildCredential('wrong', first.hash, first.salt), false);
  assert.equal(await verifyGuildCredential(credential, 'malformed', first.salt), false);
  assert.equal(await verifyGuildCredential(null, first.hash, first.salt), false);
});

test('session cookie is signed, secure, HttpOnly and valid for exactly 30 days', () => {
  const time = 1_800_000_000_000;
  const sessions = createSessionManager({ secret: 'fixture-session-secret-at-least-32-bytes', now: () => time });
  const cookie = sessions.issue({ id: 'guild-a', keyVersion: 3 });
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', `Max-Age=${SESSION_SECONDS}`]) assert.ok(cookie.includes(flag));
  const payload = sessions.read(`other=hello; ${cookie.split(';')[0]}`);
  assert.deepEqual(payload, { guildId: 'guild-a', keyVersion: 3, exp: time / 1000 + SESSION_SECONDS });
  assert.match(sessions.clear(), /Max-Age=0/);
});

test('tampered, duplicate, malformed, wrong-secret and expired cookies fail closed', () => {
  const time = 1_800_000_000_000;
  const secret = 'fixture-session-secret-at-least-32-bytes';
  const sessions = createSessionManager({ secret, now: () => time });
  const cookie = sessions.issue({ id: 'guild-a', keyVersion: 1 }).split(';')[0];
  const [encoded, signature] = cookie.split('=')[1].split('.');
  const forged = Buffer.from(JSON.stringify({ guildId: 'guild-b', keyVersion: 1, exp: time / 1000 + 1000 })).toString('base64url');
  for (const invalid of ['', 'fgb_session=bad', 'fgb_session=x.y.z', `${cookie}; ${cookie}`, `fgb_session=${forged}.${signature}`, `fgb_session=${encoded}.invalid`]) {
    assert.equal(sessions.read(invalid), null);
  }
  assert.equal(createSessionManager({ secret: 'different-fixture-secret-at-least-32-bytes', now: () => time }).read(cookie), null);
  assert.equal(createSessionManager({ secret, now: () => time + SESSION_SECONDS * 1000 }).read(cookie), null);
  assert.throws(() => createSessionManager({ secret: 'short' }).issue({ id: 'guild-a', keyVersion: 1 }), { status: 503 });
});

test('two verified sessions bind independent member and split repositories', async () => {
  const { repository, commands } = fixture();
  const sessions = createSessionManager({ secret: 'fixture-session-secret-at-least-32-bytes' });
  const first = await repository.authenticate(sessions.issue({ id: 'guild-a', keyVersion: 1 }), sessions);
  const second = await repository.authenticate(sessions.issue({ id: 'guild-b', keyVersion: 1 }), sessions);
  assert.equal((await first.store.getAll())[0].name, 'Alpha');
  assert.equal((await second.store.getAll())[0].name, 'Beta');
  assert.equal((await first.store.splits.getAll())[0].name, 'Alpha plan');
  assert.equal((await second.store.splits.getAll())[0].name, 'Beta plan');
  // An attacker-controlled field on a record does not influence the bound key.
  await first.store.put({ id: 'attack', guildId: 'guild-b', name: 'Tampered target' });
  const write = commands.at(-1);
  assert.equal(write[0], 'EVAL');
  assert.deepEqual(write.slice(3, 7), ['guild:guild-a:meta', 'guild:guild-a:members', 'guild:guild-a:splits', 'guild:slug:alpha-ab12']);
  assert.equal(write[11], GUILD_TTL_SECONDS);
  await first.store.splits.put({ id: 'split', guildId: 'guild-b', name: 'Tampered split' });
  assert.equal(commands.at(-1)[4], 'guild:guild-a:splits');
  assert.ok(commands.every((command) => !command.includes('roster:v1') && !command.includes('roster:v1:splits')));
});

test('ordinary reads do not refresh inactivity expiry and public metadata excludes credentials', async () => {
  const { repository, commands, guilds } = fixture();
  const scope = repository.scope(await repository.getGuild('guild-a'));
  await scope.getAll();
  await scope.splits.getAll();
  assert.ok(commands.every((cmd) => !['EXPIRE', 'EVAL'].includes(cmd[0])));
  assert.deepEqual(Object.keys(publicGuild(guilds[0])).sort(), ['donationDismissed', 'faction', 'id', 'name', 'slug']);
});

test('key rotation, deletion and expired guilds invalidate existing signed sessions', async () => {
  const { repository, values, guilds } = fixture();
  const sessions = createSessionManager({ secret: 'fixture-session-secret-at-least-32-bytes' });
  const cookie = sessions.issue({ id: 'guild-a', keyVersion: 1 });
  values.set('guild:guild-a:meta', JSON.stringify({ ...guilds[0], keyVersion: 2 }));
  await assert.rejects(repository.authenticate(cookie, sessions), { status: 401 });
  values.delete('guild:guild-a:meta');
  await assert.rejects(repository.authenticate(cookie, sessions), { status: 401 });
  assert.equal(await repository.findGuild('alpha-ab12'), null);
  await assert.rejects(repository.scope(guilds[0]).put({ id: 'stale' }), { status: 401 });
});

test('protected API ignores hostile guild IDs for roster reads, writes, deletes and splits', async () => {
  const { redis, guilds, values } = fixture();
  const env = { SESSION_SECRET: 'fixture-session-secret-at-least-32-bytes' };
  const sessions = createSessionManager({ secret: env.SESSION_SECRET });
  const api = createGuildApi({ env, redis, sessions });
  const request = (id, method, pathname, body = {}, query = {}) => api({
    req: { method, headers: { cookie: sessions.issue({ id, keyVersion: 1 }) }, socket: { remoteAddress: '127.0.0.1' } },
    pathname, body, query,
  });
  const bBefore = values.get('guild:guild-b:members');
  const added = await request('guild-a', 'POST', '/api/roster', {
    guildId: 'guild-b', store: 'guild-b', name: 'Test Tank',
    main: { class: 'warrior', spec: 'protection', race: 'tauren' },
  });
  assert.equal(added.status, 200);
  assert.equal(values.get('guild:guild-b:members'), bBefore);
  const read = await request('guild-a', 'GET', '/api/roster', {}, { guildId: 'guild-b' });
  assert.equal(read.json.guild.id, 'guild-a');
  assert.equal(read.json.members.some((m) => m.name === 'Test Tank'), true);
  assert.equal((await request('guild-a', 'DELETE', '/api/roster', {}, { id: 'guild-b', guildId: 'guild-b' })).status, 404);
  const setup = await request('guild-a', 'POST', '/api/roster/splits', {
    guildId: 'guild-b', name: 'Raid Test', teams: [{ id: 'one', name: 'One', size: 10, memberIds: [added.json.member.id] }],
  });
  assert.equal(setup.status, 200);
  assert.equal((await request('guild-b', 'GET', '/api/roster/splits')).json.setups.some((s) => s.name === 'Raid Test'), false);
  assert.equal((await request('guild-a', 'DELETE', '/api/roster', {}, { id: added.json.member.id })).status, 200);
  assert.deepEqual(publicGuild(guilds[0]), read.json.guild);
  await assert.rejects(api({ req: { method: 'GET', headers: {}, socket: {} }, pathname: '/api/roster' }), { status: 401 });
});

test('login requires the correct key, returns a cookie and throttles the sixth attempt', async () => {
  const { redis, values, guilds } = fixture();
  const env = { SESSION_SECRET: 'fixture-session-secret-at-least-32-bytes' };
  const credential = 'test-only-never-a-real-key';
  const hashed = await hashGuildCredential(credential);
  values.set('guild:guild-a:meta', JSON.stringify({ ...guilds[0], keyHash: hashed.hash, salt: hashed.salt }));
  const api = createGuildApi({ env, redis });
  const login = (key) => api({ req: { method: 'POST', headers: {}, socket: { remoteAddress: '127.0.0.1' } }, pathname: '/api/session', body: { slug: 'alpha-ab12', key } });
  const out = await login(credential);
  assert.equal(out.status, 200);
  assert.match(out.cookie, /HttpOnly; Secure; SameSite=Lax/);
  assert.ok(!JSON.stringify(out.json).includes(hashed.hash));
  for (let n = 0; n < 4; n++) await assert.rejects(login('wrong'), { status: 401 });
  await assert.rejects(login('wrong'), { status: 429 });
});

test('new multi-guild creation stays closed without bot-protection setup', async () => {
  const api = createGuildApi({ env: {} });
  const req = { method: 'POST', headers: {}, socket: {} };
  await assert.rejects(api({ req, pathname: '/api/guilds', body: { name: 'No bypass', turnstileToken: 'fake' } }), { status: 503 });
  assert.equal((await api({ req: { ...req, method: 'GET' }, pathname: '/api/config' })).json.creationEnabled, false);
});

test('all guild URLs are non-indexable without blocking indexing of public pages', async (t) => {
  const server = createGuildHttpServer({ env: { NODE_ENV: 'production' }, api: async () => ({ status: 200, json: {} }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const pathname of ['/g', '/g/', '/g/good-job', '/g/good-job/', '/g/good-job?view=composition',
    '/g/good-job-0cba3d', '/g/unknown-guild', '/g/good-job/splits', '/g/good-job/asset.png',
    '/%67/good-job', '/g%2Fgood-job', '/g/%invalid']) {
    const res = await fetch(base + pathname);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive, nosnippet, noimageindex', pathname);
    const body = await res.text();
    if (res.headers.get('content-type')?.startsWith('text/html')) {
      assert.match(body, /<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">/, pathname);
      assert.ok(body.indexOf('name="robots"') < body.indexOf('</head>'), pathname);
    }
  }
  for (const method of ['HEAD', 'POST']) {
    const res = await fetch(base + '/g/good-job', { method });
    assert.match(res.headers.get('x-robots-tag'), /\bnoindex\b/);
    assert.equal(res.status, method === 'HEAD' ? 200 : 405);
    if (method === 'HEAD') assert.equal(await res.text(), '');
  }
  for (const pathname of ['/', '/privacy', '/gossip']) {
    const res = await fetch(base + pathname);
    assert.equal(res.headers.get('x-robots-tag'), null, pathname);
    assert.doesNotMatch(await res.text(), /name="robots" content="noindex/);
  }
  const robots = await (await fetch(base + '/robots.txt')).text();
  assert.match(robots, /^Allow: \/$/m);
  assert.doesNotMatch(robots, /^Disallow: \/g/m);
});

test('HTTP enforces same origin, JSON, streamed 8 KB limit and production framing', async (t) => {
  const server = createGuildHttpServer({ env: {}, api: async () => ({ status: 200, json: { ok: true } }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const port = server.address().port;
  const host = `127.0.0.1:${port}`;
  const send = (headers, chunks = ['{}']) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: '/api/roster', method: 'POST', headers }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(text) }));
    });
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
  assert.equal((await send({ Origin: 'https://other.invalid', 'Content-Type': 'application/json' })).status, 403);
  assert.equal((await send({ Origin: `http://${host}`, 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await send({ Origin: `http://${host}`, 'Content-Type': 'application/json' }, ['{bad'])).status, 400);
  assert.equal((await send({ Origin: `http://${host}`, 'Content-Type': 'application/json' }, ['[]'])).status, 400);
  const big = await send({ Origin: `http://${host}`, 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' }, ['{"notes":"', 'x'.repeat(8192), '"}']);
  assert.equal(big.status, 413);
  const good = await send({ Origin: `http://${host}`, 'Content-Type': 'application/json' });
  assert.equal(good.status, 200);
  assert.equal(good.headers['x-content-type-options'], 'nosniff');
  assert.equal(good.headers['referrer-policy'], 'no-referrer');
  assert.ok(good.headers['content-security-policy'].includes("script-src 'self' https://challenges.cloudflare.com"));
  assert.ok(securityHeaders(true)['Content-Security-Policy'].includes("frame-ancestors 'none'"));
});