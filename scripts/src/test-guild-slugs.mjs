import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuildFixture } from './guild-fixture.mjs';
import { createGuildManagement } from '../../lib/roster/src/guild-management.js';
import { createGuildRepository, GUILD_TTL_SECONDS } from '../../lib/roster/src/guild-store.js';
import { renameGuildSlug } from '../../lib/roster/src/guild-slug.js';
import { migrateGoodJob, MIGRATION_MARKER } from '../../lib/roster/src/guild-migration.js';
import { verifyGuildCredential } from '../../lib/roster/src/guild-sessions.js';

test('guilds use readable slugs and reject name collisions without replacing another guild', async () => {
  const f = createGuildFixture();
  const management = createGuildManagement(f.redis);
  const first = await management.create({ name: 'Good Job', faction: 'horde' });
  assert.equal(first.meta.slug, 'good-job');
  await assert.rejects(management.create({ name: 'Good Job', faction: 'alliance' }), { status: 409 });
  assert.equal((await createGuildRepository(f.redis).findGuild('good-job')).id, first.meta.id);
  assert.equal((await management.create({ name: 'Café Raiders', faction: 'horde' })).meta.slug, 'cafe-raiders');
});

test('renaming preserves records, credentials, sessions metadata, marker and old-link aliases', async () => {
  const f = createGuildFixture();
  const management = createGuildManagement(f.redis);
  const created = await management.create({ name: 'Legacy Good Job', faction: 'horde' });
  const repo = createGuildRepository(f.redis);
  const store = repo.scope(created.meta);
  await store.put({ id: 'member', name: 'Fixture', main: { class: 'warrior', spec: 'protection', race: 'orc' }, alts: [] });
  await store.splits.put({ id: 'split', name: 'Plan', teams: [] });
  f.strings.set(MIGRATION_MARKER, JSON.stringify({ id: created.meta.id, slug: created.meta.slug }));
  const members = [...f.hashes.get(`guild:${created.meta.id}:members`)];
  const splits = [...f.hashes.get(`guild:${created.meta.id}:splits`)];
  await renameGuildSlug(f.redis, created.meta.id, 'good-job');
  const renamed = await repo.findGuild('good-job');
  assert.equal(renamed.id, created.meta.id);
  assert.equal((await repo.findGuild('legacy-good-job')).id, created.meta.id);
  assert.equal(renamed.keyVersion, created.meta.keyVersion);
  assert.equal(await verifyGuildCredential(created.key, renamed.keyHash, renamed.salt), true);
  assert.deepEqual([...f.hashes.get(`guild:${renamed.id}:members`)], members);
  assert.deepEqual([...f.hashes.get(`guild:${renamed.id}:splits`)], splits);
  assert.equal((await migrateGoodJob(f.redis)).slug, 'good-job');
  f.advance(120);
  await repo.scope(renamed).splits.put({ id: 'split', name: 'Plan', teams: [] });
  assert.equal(f.expires.get('guild:slug:legacy-good-job'), f.now + GUILD_TTL_SECONDS);
  f.advance(120);
  const updated = await management.update(renamed, { donationDismissed: true });
  assert.equal(f.expires.get('guild:slug:legacy-good-job'), f.now + GUILD_TTL_SECONDS);
  await management.remove(updated, { key: created.key, confirmation: updated.name });
  assert.equal(await repo.findGuild('good-job'), null);
  assert.equal(await repo.findGuild('legacy-good-job'), null);
});

test('occupied target slug rejects administrative rename without altering the original guild', async () => {
  const f = createGuildFixture();
  const management = createGuildManagement(f.redis);
  const a = await management.create({ name: 'One', faction: 'horde' });
  await management.create({ name: 'Two', faction: 'alliance' });
  await assert.rejects(renameGuildSlug(f.redis, a.meta.id, 'two'), { status: 409 });
  assert.equal((await createGuildRepository(f.redis).getGuild(a.meta.id)).slug, 'one');
  assert.equal(f.strings.get('guild:slug:one'), a.meta.id);
});