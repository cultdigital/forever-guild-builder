import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMembersByRoleClass } from '../../lib/roster/src/member-sort.js';

const member = (id, name, cls, spec) => ({ id, name, main: { class: cls, spec }, alts: [] });

test('split members sort by Tank, Healer, DPS, then class and alphabetical name', () => {
  const members = [
    member('mage', 'A Mage', 'mage', 'frost'),
    member('priest', 'A Priest', 'priest', 'holy'),
    member('warrior-z', 'Zulu', 'warrior', 'protection'),
    member('warrior-a', 'alpha', 'warrior', 'protection'),
    member('druid-tank', 'Z Druid', 'druid', 'feralbear'),
    member('druid-healer', 'Z Healer', 'druid', 'restoration'),
    member('hunter', 'Z Hunter', 'hunter', 'marksmanship'),
    member('druid-dps', 'Z Balance', 'druid', 'balance'),
  ];
  assert.deepEqual([...members].sort(compareMembersByRoleClass).map((m) => m.id), [
    'druid-tank', 'warrior-a', 'warrior-z', 'druid-healer', 'priest', 'druid-dps', 'hunter', 'mage',
  ]);
  assert.equal(members[0].id, 'mage');
});

test('pure DPS without a spec sorts as DPS, while undecided roles come last', () => {
  const members = [
    member('undecided', 'A Undecided', 'warrior', ''),
    { id: 'missing', name: 'Missing' },
    member('mage', 'Z Mage', 'mage', ''),
    member('paladin', 'Holy', 'paladin', 'holy'),
  ];
  assert.deepEqual([...members].sort(compareMembersByRoleClass).slice(0, 2).map((m) => m.id), ['paladin', 'mage']);
});

test('sorting uses main character roles, not alternates or assignment labels', () => {
  const dps = { ...member('dps', 'A DPS', 'warrior', 'arms'), assignment: 'mt',
    alts: [{ class: 'priest', spec: 'holy' }] };
  const tank = member('tank', 'Z Tank', 'warrior', 'protection');
  assert.deepEqual([dps, tank].sort(compareMembersByRoleClass).map((m) => m.id), ['tank', 'dps']);
});
