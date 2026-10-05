import test from 'node:test';
import assert from 'node:assert/strict';
import { getFactionData, FACTION_CLASSES } from '../../lib/roster/src/data.js';
import { createGuildManagement } from '../../lib/roster/src/guild-management.js';
import { createGuildRepository } from '../../lib/roster/src/guild-store.js';
import { handle } from '../../lib/roster/src/handler.js';
import { createGuildFixture } from './guild-fixture.mjs';

test('every supplied faction race/class combination is represented exactly', () => {
  for (const [faction, combos] of Object.entries(FACTION_CLASSES)) {
    const { classes, races } = getFactionData(faction);
    assert.deepEqual(Object.keys(races), Object.keys(combos));
    for (const [race, allowed] of Object.entries(combos)) {
      assert.deepEqual(Object.keys(classes).filter((id) => classes[id].races.includes(race)).sort(), [...allowed].sort());
    }
  }
  assert.ok(getFactionData('horde').classes.shaman.races.includes('skyborne'));
  assert.ok(!getFactionData('horde').classes.mage.races.includes('skyborne'));
  assert.ok(getFactionData('alliance').classes.mage.races.includes('skyborne'));
  assert.ok(!getFactionData('alliance').classes.shaman.races.includes('skyborne'));
});

test('server rejects cross-faction races and enforces the Skyborne class difference', async () => {
  for (const faction of ['horde', 'alliance']) {
    const f = createGuildFixture();
    const management = createGuildManagement(f.redis, { env: {} });
    const { meta } = await management.create({ name: 'Fixture Guild', faction });
    const store = createGuildRepository(f.redis).scope(meta);
    for (const race of faction === 'alliance' ? ['tauren', 'orc'] : ['human']) {
      assert.equal((await handle({ method: 'POST', store, body: { name: 'Rejected', main: { class: 'warrior', race } } })).status, 400);
    }
    const validClass = faction === 'alliance' ? 'mage' : 'shaman';
    const invalidClass = faction === 'alliance' ? 'shaman' : 'mage';
    assert.equal((await handle({ method: 'POST', store, body: { name: 'Sky Valid', main: { class: validClass, race: 'skyborne' } } })).status, 200);
    assert.equal((await handle({ method: 'POST', store, body: { name: 'Sky Invalid', main: { class: invalidClass, race: 'skyborne' } } })).status, 400);
    assert.equal((await handle({ method: 'POST', store, body: { name: 'Bad Class', main: { class: '__proto__' } } })).status, 400);
    assert.equal((await handle({ method: 'POST', store, body: { name: 'Long Notes', main: { class: 'warrior' }, notes: 'x'.repeat(201) } })).status, 400);
  }
});