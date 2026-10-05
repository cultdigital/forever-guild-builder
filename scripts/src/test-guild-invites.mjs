import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createGuildApi } from '../../lib/roster/src/guild-api.js';
import { createGuildFixture } from './guild-fixture.mjs';
import { createGuildRepository } from '../../lib/roster/src/guild-store.js';
import { createGuildManagement } from '../../lib/roster/src/guild-management.js';
import { createSessionManager } from '../../lib/roster/src/guild-sessions.js';

const env = {
  SESSION_SECRET: 'invite-fixture-secret-at-least-32-bytes',
  TURNSTILE_SITE_KEY: 'fixture-site', TURNSTILE_SECRET_KEY: 'fixture-secret',
};
test('pasting invite URLs on the home page preserves both new invitations and legacy passphrase links', () => {
  const source = readFileSync(new URL('../../artifacts/raid-roster/public/guild-shell.js', import.meta.url), 'utf8');
  const fn = source.match(/function parseGuildRef\(raw\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(fn);
  const parse = runInNewContext(`${fn}; parseGuildRef`, { URL });
  const token = 'a'.repeat(64);
  assert.equal(parse(`https://fixture.invalid/g/invite-fixture#i=${token}`), `/g/invite-fixture#i=${token}`);
  assert.equal(parse('https://fixture.invalid/g/invite-fixture#k=four-word-guild-passphrase'), '/g/invite-fixture#k=four-word-guild-passphrase');
  assert.equal(parse(' invite-fixture '), '/g/invite-fixture');
  assert.equal(parse('https://fixture.invalid/g/invite-fixture#roster'), '/g/invite-fixture');
  assert.equal(parse('https://fixture.invalid/not-a-guild'), null);
});
function setup() {
  const fixture = createGuildFixture();
  const sessions = createSessionManager({ secret: env.SESSION_SECRET });
  const api = createGuildApi({ env, redis: fixture.redis, sessions,
    fetchImpl: async () => Response.json({ success: true, hostname: 'fixture.invalid', action: 'create-guild' }) });
  const call = (method, pathname, body = {}, cookie) => api({
    req: { method, headers: { origin: 'https://fixture.invalid', cookie }, socket: { remoteAddress: '127.0.0.1' } },
    pathname, body, query: {},
  });
  const create = (name = 'Invite Fixture') => call('POST', '/api/guilds', { name, faction: 'horde', turnstileToken: 'fixture-token' });
  return { ...fixture, sessions, call, create };
}

test('invites require authentication, return their token once, and never store a passphrase or raw token', async () => {
  const f = setup(), guild = await f.create();
  await assert.rejects(f.call('POST', '/api/guild/invite'), { status: 401 });
  assert.equal((await f.call('GET', '/api/guild/invite', {}, guild.cookie)).json.active, false);
  const generated = await f.call('POST', '/api/guild/invite', {}, guild.cookie);
  assert.equal(generated.status, 201);
  assert.equal(generated.json.active, true);
  assert.match(generated.json.token, /^[a-f0-9]{64}$/);
  const status = await f.call('GET', '/api/guild/invite', {}, guild.cookie);
  assert.equal('token' in status.json, false);
  const raw = f.strings.get(`guild:${guild.json.guild.id}:meta`);
  assert.equal(raw.includes(generated.json.token), false);
  assert.equal(raw.includes(guild.json.key), false);
  assert.equal(status.json.id, generated.json.id);
});

test('an independent invite joins only its guild and grants shared editing', async () => {
  const f = setup(), a = await f.create(), b = await f.create('Other Fixture');
  const generated = await f.call('POST', '/api/guild/invite', {}, a.cookie);
  await assert.rejects(f.call('POST', '/api/session', { slug: b.json.guild.slug, inviteToken: generated.json.token }), { status: 401 });
  await assert.rejects(f.call('POST', '/api/session', { slug: a.json.guild.slug, inviteToken: 'invalid' }), { status: 401 });
  const joined = await f.call('POST', '/api/session', { slug: a.json.guild.slug, inviteToken: generated.json.token });
  assert.equal(joined.json.guild.id, a.json.guild.id);
  assert.equal(f.sessions.read(joined.cookie).inviteId, generated.json.id);
  const created = await f.call('POST', '/api/roster', {
    name: 'Invited Player', main: { class: 'warrior', spec: 'arms', race: 'orc' }, alts: [], professions: [], notes: '',
  }, joined.cookie);
  assert.equal(created.status, 200);
  const saved = await f.call('POST', '/api/guild', { name: 'Renamed Invite Guild' }, joined.cookie);
  assert.equal(saved.json.guild.name, 'Renamed Invite Guild');
  assert.equal((await f.call('GET', '/api/guild', {}, b.cookie)).json.guild.name, 'Other Fixture');
});

test('revocation blocks redemption and existing invite sessions but preserves passphrase sessions', async () => {
  const f = setup(), guild = await f.create();
  const invite = await f.call('POST', '/api/guild/invite', {}, guild.cookie);
  const joined = await f.call('POST', '/api/session', { slug: guild.json.guild.slug, inviteToken: invite.json.token });
  const revoked = await f.call('DELETE', '/api/guild/invite', {}, guild.cookie);
  assert.equal(revoked.json.active, false);
  assert.equal(revoked.json.signedOut, false);
  const stored = JSON.parse(f.strings.get(`guild:${guild.json.guild.id}:meta`));
  assert.equal(stored.inviteId === '' && stored.inviteHash === '' && stored.inviteCreatedAt === '', true);
  await assert.rejects(f.call('POST', '/api/session', { slug: guild.json.guild.slug, inviteToken: invite.json.token }), { status: 401 });
  await assert.rejects(f.call('GET', '/api/roster', {}, joined.cookie), { status: 401 });
  assert.equal((await f.call('GET', '/api/guild', {}, guild.cookie)).status, 200);
  assert.equal((await f.call('POST', '/api/session', { slug: guild.json.guild.slug, key: guild.json.key })).status, 200);
});

test('replacement revokes old invite sessions and keeps the generating invite user signed in', async () => {
  const f = setup(), guild = await f.create();
  const first = await f.call('POST', '/api/guild/invite', {}, guild.cookie);
  const joined = await f.call('POST', '/api/session', { slug: guild.json.guild.slug, inviteToken: first.json.token });
  const next = await f.call('POST', '/api/guild/invite', {}, joined.cookie);
  assert.notEqual(next.json.id, first.json.id);
  await assert.rejects(f.call('GET', '/api/guild', {}, joined.cookie), { status: 401 });
  await assert.rejects(f.call('POST', '/api/session', { slug: guild.json.guild.slug, inviteToken: first.json.token }), { status: 401 });
  assert.equal((await f.call('GET', '/api/guild', {}, next.cookie)).status, 200);
  const revoked = await f.call('DELETE', '/api/guild/invite', {}, next.cookie);
  assert.equal(revoked.json.signedOut, true);
  assert.match(revoked.cookie, /Max-Age=0/);
});

test('credential rotation revokes invitations and leaves the new passphrase usable', async () => {
  const f = setup(), guild = await f.create();
  const invite = await f.call('POST', '/api/guild/invite', {}, guild.cookie);
  const rotated = await f.call('POST', '/api/guild/rotate', { key: guild.json.key }, guild.cookie);
  const stored = JSON.parse(f.strings.get(`guild:${guild.json.guild.id}:meta`));
  assert.equal(stored.inviteId === '' && stored.inviteHash === '', true);
  await assert.rejects(f.call('POST', '/api/session', { slug: guild.json.guild.slug, inviteToken: invite.json.token }), { status: 401 });
  assert.equal((await f.call('POST', '/api/session', { slug: guild.json.guild.slug, key: rotated.json.key })).status, 200);
});

test('atomic writes and metadata updates reject an invite revoked after authentication', async () => {
  const f = setup(), guild = await f.create();
  const invite = await f.call('POST', '/api/guild/invite', {}, guild.cookie);
  const joined = await f.call('POST', '/api/session', { slug: guild.json.guild.slug, inviteToken: invite.json.token });
  const repo = createGuildRepository(f.redis);
  const bound = await repo.authenticate(joined.cookie, f.sessions);
  await f.call('DELETE', '/api/guild/invite', {}, guild.cookie);
  await assert.rejects(bound.store.put({ id: 'late-write', name: 'Late Write' }), { status: 401 });
  const management = createGuildManagement(f.redis, { env });
  await assert.rejects(management.update(bound.meta, { name: 'Late Rename' }, bound.session.inviteId), { status: 401 });
});
