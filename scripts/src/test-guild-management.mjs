import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuildApi } from '../../lib/roster/src/guild-api.js';
import { createGuildManagement, GUILD_INDEX } from '../../lib/roster/src/guild-management.js';
import { createGuildRepository, GUILD_TTL_SECONDS } from '../../lib/roster/src/guild-store.js';
import { createSessionManager, verifyGuildCredential } from '../../lib/roster/src/guild-sessions.js';
import { generateGuildCredential } from '../../lib/roster/src/guild-credentials.js';
import { createGuildFixture } from './guild-fixture.mjs';

const environment = {
  SESSION_SECRET: 'test-fixture-session-secret-32-bytes-minimum',
  TURNSTILE_SITE_KEY: 'test-fixture-site-key',
  TURNSTILE_SECRET_KEY: 'test-fixture-secret-key',
};
const char = { class: 'warrior', spec: 'protection', race: 'orc' };
function setup(extra = {}) {
  const fixture = createGuildFixture();
  const env = { ...environment, ...extra };
  const sessions = createSessionManager({ secret: env.SESSION_SECRET });
  const api = createGuildApi({ env, redis: fixture.redis, sessions, fetchImpl: async () => Response.json({ success: true, hostname: 'fixture.invalid', action: 'create-guild' }) });
  const call = (method, pathname, body = {}, cookie, ip = '127.0.0.1', query = {}) => api({
    req: { method, headers: { origin: 'https://fixture.invalid', cookie }, socket: { remoteAddress: ip } },
    pathname, body, query,
  });
  const create = (name = 'Fixture Guild', ip) => call('POST', '/api/guilds', { name, faction: 'horde', turnstileToken: 'test-fixture-token' }, undefined, ip);
  return { ...fixture, env, sessions, call, create };
}

test('generated guild credentials contain exactly four words and are independently random', () => {
  const keys = Array.from({ length: 100 }, generateGuildCredential);
  assert.equal(new Set(keys).size, 100);
  keys.forEach((key) => assert.match(key, /^[a-z]+(?:-[a-z]+){3}$/));
});

test('creation returns credentials once but stores only salted hashes and independent namespaces', async () => {
  const f = setup();
  const a = await f.create('Alpha');
  const b = await f.create('Beta');
  assert.equal(a.status, 201);
  assert.equal(a.json.guild.slug, 'alpha');
  assert.equal(b.json.guild.slug, 'beta');
  assert.notEqual(a.json.guild.slug, b.json.guild.slug);
  assert.notEqual(a.json.key, a.json.recoveryCode);
  const meta = JSON.parse(f.strings.get(`guild:${a.json.guild.id}:meta`));
  assert.equal(await verifyGuildCredential(a.json.key, meta.keyHash, meta.salt), true);
  assert.equal(await verifyGuildCredential(a.json.recoveryCode, meta.recoveryHash, meta.salt), true);
  assert.ok(!JSON.stringify(meta).includes(a.json.key));
  assert.ok(!JSON.stringify(meta).includes(a.json.recoveryCode));
  assert.equal(f.expires.get(`guild:${meta.id}:meta`) - f.now, GUILD_TTL_SECONDS);
  const data = await f.call('GET', '/api/guild', {}, a.cookie);
  assert.equal(Object.hasOwn(data.json.guild, 'keyHash'), false);
});

test('missing, invalid, wrong-hostname or wrong-action Turnstile cannot create a guild', async () => {
  const f = setup();
  await assert.rejects(f.call('POST', '/api/guilds', { name: 'Bot Guild', faction: 'horde' }), { status: 400 });
  for (const result of [{ success: false }, { success: true, hostname: 'other.invalid', action: 'create-guild' }, { success: true, hostname: 'fixture.invalid', action: 'other' }]) {
    const g = createGuildFixture();
    const api = createGuildApi({ env: environment, redis: g.redis, fetchImpl: async () => Response.json(result) });
    await assert.rejects(api({ req: { method: 'POST', headers: { origin: 'https://fixture.invalid' }, socket: { remoteAddress: '127.0.0.1' } }, pathname: '/api/guilds', body: { name: 'Blocked', faction: 'horde', turnstileToken: 'fixture' } }), { status: 400 });
    assert.equal(g.indexes.get(GUILD_INDEX)?.size || 0, 0);
  }
});

test('fourth creation per IP is rate limited and configured global capacity blocks only creation', async () => {
  const f = setup();
  await f.create('One'); await f.create('Two'); await f.create('Three');
  await assert.rejects(f.create('Four'), { status: 429 });
  const limited = setup({ MAX_GUILDS: '1' });
  const guild = await limited.create('Only Guild');
  await assert.rejects(limited.create('Another', '127.0.0.2'), { status: 503 });
  assert.equal((await limited.call('GET', '/api/roster', {}, guild.cookie)).status, 200);
});

test('settings and persisted donation dismissal merge without accepting protected metadata fields', async () => {
  const f = setup(), a = await f.create('Alpha');
  const out = await f.call('PATCH', '/api/guild', { name: 'Renamed', guildId: 'other', keyVersion: 999, keyHash: 'hostile', donationDismissed: true }, a.cookie);
  assert.equal(out.json.guild.name, 'Renamed');
  assert.equal(out.json.guild.donationDismissed, true);
  const meta = JSON.parse(f.strings.get(`guild:${a.json.guild.id}:meta`));
  assert.equal(meta.keyVersion, 1);
  assert.notEqual(meta.keyHash, 'hostile');
});

test('rotation requires a real credential, revokes all old sessions, and leaves recovery usable', async () => {
  const f = setup(), a = await f.create('Alpha');
  await assert.rejects(f.call('POST', '/api/guild/rotate', { key: 'wrong' }, a.cookie), { status: 401 });
  const rotated = await f.call('POST', '/api/guild/rotate', { key: a.json.key }, a.cookie);
  assert.notEqual(rotated.json.key, a.json.key);
  assert.match(rotated.cookie, /Max-Age=0/);
  await assert.rejects(f.call('GET', '/api/roster', {}, a.cookie), { status: 401 });
  const recovered = await f.call('POST', '/api/guild/recover', { slug: a.json.guild.slug, recoveryCode: a.json.recoveryCode }, undefined, '127.0.0.2');
  assert.equal(recovered.status, 200);
  assert.notEqual(recovered.json.key, rotated.json.key);
  assert.equal((await f.call('GET', '/api/roster', {}, recovered.cookie)).status, 200);
});

test('delete requires the current key and exact guild-name confirmation; another guild stays intact', async () => {
  const f = setup(), a = await f.create('Alpha'), b = await f.create('Beta');
  await assert.rejects(f.call('DELETE', '/api/guild', { key: a.json.key, confirmation: 'DELETE' }, a.cookie), { status: 400 });
  await assert.rejects(f.call('DELETE', '/api/guild', { key: 'wrong', confirmation: 'Alpha' }, a.cookie), { status: 401 });
  assert.equal((await f.call('DELETE', '/api/guild', { key: a.json.key, confirmation: 'Alpha', guildId: b.json.guild.id }, a.cookie)).status, 200);
  assert.equal(f.strings.has(`guild:${a.json.guild.id}:meta`), false);
  assert.equal(f.indexes.get(GUILD_INDEX).has(a.json.guild.id), false);
  assert.equal((await f.call('GET', '/api/guild', {}, b.cookie)).json.guild.name, 'Beta');
});

test('POST settings saves faction changes and rejects a stale guild context', async () => {
  const f = setup(), a = await f.create('Post Settings');
  const id = a.json.guild.id;
  const saved = await f.call('POST', '/api/guild', { name: 'Post Settings', faction: 'alliance', expectedGuildId: id }, a.cookie);
  assert.equal(saved.status, 200);
  assert.equal(saved.json.guild.faction, 'alliance');
  await assert.rejects(f.call('POST', '/api/guild', { faction: 'horde', expectedGuildId: 'other-guild' }, a.cookie), { status: 409 });
  assert.equal((await f.call('GET', '/api/guild', {}, a.cookie)).json.guild.faction, 'alliance');
  await assert.rejects(f.call('POST', '/api/guild', { faction: 'horde' }), { status: 401 });
});

test('100-member ceiling remains atomic; existing edits and deletes remain available at capacity', async () => {
  const f = setup(), a = await f.create('Full Guild');
  const repository = createGuildRepository(f.redis);
  const meta = await repository.getGuild(a.json.guild.id);
  const store = repository.scope(meta);
  for (let n = 0; n < 100; n++) await store.put({ id: `member-${n}`, name: `Member ${n}`, main: char });
  await assert.rejects(store.put({ id: 'extra', main: char }), { status: 403 });
  await store.put({ id: 'member-0', name: 'Edited', main: char });
  assert.equal((await store.get('member-0')).name, 'Edited');
  await store.remove('member-0');
  await store.put({ id: 'extra', main: char });
  assert.equal((await store.getAll()).length, 100);
});

test('reads do not extend expiry; writes refresh all tenant keys and the global expiry index', async () => {
  const f = setup(), a = await f.create('TTL Guild');
  const repository = createGuildRepository(f.redis), meta = await repository.getGuild(a.json.guild.id);
  const store = repository.scope(meta);
  const expiry = f.expires.get(`guild:${meta.id}:meta`);
  await store.getAll();
  assert.equal(f.expires.get(`guild:${meta.id}:meta`), expiry);
  await store.put({ id: 'one', name: 'One', main: char });
  assert.ok(f.expires.has(`guild:${meta.id}:members`));
  assert.ok(f.expires.has(`guild:slug:${meta.slug}`));
  assert.ok(f.indexes.get(GUILD_INDEX).has(meta.id));
  f.advance(GUILD_TTL_SECONDS + 1);
  assert.equal(await repository.getGuild(meta.id), null);
  assert.equal(await repository.findGuild(meta.slug), null);
  await assert.rejects(store.put({ id: 'zombie' }), { status: 401 });
});