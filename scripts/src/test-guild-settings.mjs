import test from 'node:test';
import assert from 'node:assert/strict';
import { saveGuildDetails } from '../../artifacts/raid-roster/public/guild-settings.js';

const guild = { id: 'fixture', name: 'Fixture Guild', faction: 'alliance' };
const details = { name: guild.name, faction: 'horde' };
const saved = { ...guild, ...details };

test('guild details use authenticated POST with an expected-guild guard', async () => {
  const result = await saveGuildDetails(async (path, options) => {
    assert.equal(path, '/api/guild');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { ...details, expectedGuildId: guild.id });
    return { guild: saved, invalidRaces: [] };
  }, guild, details);
  assert.equal(result.guild.faction, 'horde');
});

test('lost save responses are confirmed by reading actual server state', async () => {
  const methods = [];
  const result = await saveGuildDetails(async (_path, options) => {
    methods.push(options?.method || 'GET');
    if (options) throw new TypeError('Failed to fetch');
    return { guild: saved };
  }, guild, details);
  assert.deepEqual(methods, ['POST', 'GET']);
  assert.equal(result.confirmedAfterReconnect, true);
  assert.deepEqual(result.guild, saved);
});

test('an unapplied interrupted update is retried once', async () => {
  const methods = [];
  const result = await saveGuildDetails(async (_path, options) => {
    methods.push(options?.method || 'GET');
    if (!options) return { guild };
    if (methods.length === 1) throw new TypeError('Failed to fetch');
    return { guild: saved, invalidRaces: [] };
  }, guild, details);
  assert.deepEqual(methods, ['POST', 'GET', 'POST']);
  assert.equal(result.guild.faction, 'horde');
});

test('persistent network failure reports an unconfirmed save, not success', async () => {
  let writes = 0;
  await assert.rejects(saveGuildDetails(async (_path, options) => {
    if (!options) return { guild };
    writes++;
    throw new TypeError('Failed to fetch');
  }, guild, details), /Could not confirm the save/);
  assert.equal(writes, 2);
});

test('validation failures are not retried', async () => {
  let requests = 0;
  const error = Object.assign(new Error('Invalid faction'), { status: 400 });
  await assert.rejects(saveGuildDetails(async () => {
    requests++;
    throw error;
  }, guild, details), (e) => e === error);
  assert.equal(requests, 1);
});

test('a changed signed-in guild prevents retrying into another guild', async () => {
  let writes = 0;
  await assert.rejects(saveGuildDetails(async (_path, options) => {
    if (!options) return { guild: { ...saved, id: 'other-fixture' } };
    writes++;
    throw new TypeError('Failed to fetch');
  }, guild, details), /different guild/);
  assert.equal(writes, 1);
});

test('expired sessions during confirmation remain explicit authentication errors', async () => {
  const error = Object.assign(new Error('Sign in again'), { status: 401 });
  await assert.rejects(saveGuildDetails(async (_path, options) => {
    if (options) throw new TypeError('Failed to fetch');
    throw error;
  }, guild, details), (e) => e === error);
});
