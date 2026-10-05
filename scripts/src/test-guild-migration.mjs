import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuildFixture } from './guild-fixture.mjs';
import { migrateGoodJob, MIGRATION_MARKER } from '../../lib/roster/src/guild-migration.js';
import { createGuildRepository } from '../../lib/roster/src/guild-store.js';
import { SEED } from '../../lib/roster/src/seed.js';

test('Good Job migration copies all original member and split records without changing source keys', async () => {
  const f = createGuildFixture();
  const member = { ...SEED[0], extraOriginalField: 'preserved exactly' };
  const original = JSON.stringify(member);
  const split = JSON.stringify({ id: 'original-split', name: 'Original Plan', teams: [{ id: 'one', name: 'One', size: 10, memberIds: [member.id] }] });
  f.hashes.set('roster:v1', new Map([[member.id, original]]));
  f.hashes.set('roster:v1:splits', new Map([['original-split', split]]));
  const result = await migrateGoodJob(f.redis, { env: {} });
  assert.equal(result.memberCount, 1);
  assert.equal(result.splitCount, 1);
  assert.equal(f.hashes.get(`guild:${result.guild.id}:members`).get(member.id), original);
  assert.equal(f.hashes.get(`guild:${result.guild.id}:splits`).get('original-split'), split);
  assert.equal(f.hashes.get('roster:v1').get(member.id), original);
  assert.equal(f.hashes.get('roster:v1:splits').get('original-split'), split);
  assert.ok(!f.expires.has('roster:v1'));
  assert.ok(!f.expires.has(MIGRATION_MARKER));
});

test('migration falls back to survey seed only for an empty Redis hash and never returns credentials again', async () => {
  const f = createGuildFixture();
  const first = await migrateGoodJob(f.redis, { env: {} });
  assert.equal(first.memberCount, SEED.length);
  assert.deepEqual(JSON.parse(f.hashes.get(`guild:${first.guild.id}:members`).get(SEED[0].id)), SEED[0]);
  const second = await migrateGoodJob(f.redis, { env: {} });
  assert.equal(second.alreadyMigrated, true);
  assert.equal(second.id, first.guild.id);
  assert.equal(Object.hasOwn(second, 'key'), false);
  assert.equal(Object.hasOwn(second, 'recoveryCode'), false);
  assert.equal(f.strings.has('roster:v1'), false);
});

test('a stale roster write cannot silently overwrite a concurrent edit on another server instance', async () => {
  const f = createGuildFixture(), migrated = await migrateGoodJob(f.redis, { env: {} });
  const repository = createGuildRepository(f.redis);
  const store = repository.scope(await repository.getGuild(migrated.guild.id));
  const stale = await store.get(SEED[0].id);
  await store.put({ ...stale, notes: 'Concurrent edit' }, { expectedRevision: stale._revision || 0 });
  await assert.rejects(store.put({ ...stale, name: 'Stale Rename' }, { expectedRevision: stale._revision || 0 }), { status: 409 });
  assert.equal((await store.get(stale.id)).notes, 'Concurrent edit');
  const fresh = await store.get(stale.id);
  await store.put({ ...fresh, name: 'Fresh Rename' }, { expectedRevision: fresh._revision });
  assert.equal((await store.get(stale.id)).notes, 'Concurrent edit');
});