import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseComposition, compositionRoleStatus } from '../../lib/roster/src/composition.js';
import { RAID_SIZES, getFactionData } from '../../lib/roster/src/data.js';

const member = (id, cls, spec, extra = {}) => ({ id, name: id, main: { class: cls, spec }, alts: [], ...extra });

test('composition uses only the supplied team, including undecided and pure DPS defaults', () => {
  const team = [
    member('tank', 'warrior', 'protection'),
    member('healer', 'priest', 'holy'),
    member('dps', 'mage', null),
    member('unknown', 'druid', null),
  ];
  const A = analyseComposition(team);
  assert.equal(A.total, 4);
  assert.deepEqual(Object.fromEntries(Object.entries(A.byRole).map(([r, list]) => [r, list.length])), { tank: 1, healer: 1, dps: 1, none: 1 });
  assert.equal(A.cls.mage.mains.length, 1);
  assert.equal(A.cls.shaman.mains.length, 0);
});

test('unsaved raid-role choices affect counts without changing class or spec', () => {
  const original = member('flex', 'warrior', 'arms');
  const A = analyseComposition([{ ...original, raidRole: 'healer' }]);
  assert.equal(A.byRole.healer.length, 1);
  assert.equal(A.byRole.dps.length, 0);
  assert.equal(A.cls.warrior.specs.arms.mains.length, 1);
  assert.equal(A.cls.priest.mains.length, 0);
  assert.equal(original.main.spec, 'arms');
  assert.equal(Object.hasOwn(original, 'raidRole'), false);
});

test('alternate options are scoped to assigned members and deduplicated by role', () => {
  const A = analyseComposition([member('flex', 'warrior', 'arms', { alts: [
    { class: 'priest', spec: 'holy', will: 'keen' },
    { class: 'paladin', spec: 'holy', will: 'happy' },
    { class: 'mage', spec: 'frost', will: 'ifneeded' },
  ] })]);
  assert.equal(A.flex.healer.length, 1);
  assert.equal(A.flex.dps.length, 0);
  assert.equal(A.cls.priest.alts.length, 1);
  assert.equal(A.cls.paladin.alts.length, 1);
});

test('empty teams and both factions use the same raid target rules', () => {
  for (const faction of ['horde', 'alliance']) {
    const A = analyseComposition([], getFactionData(faction).classes);
    assert.equal(A.total, 0);
    for (const [size, target] of Object.entries(RAID_SIZES)) {
      assert.equal(target.tank + target.healer + target.dps, Number(size));
      for (const role of ['tank', 'healer', 'dps']) {
        assert.deepEqual(compositionRoleStatus(0, target[role], role), { status: `Short ${target[role]}`, className: 'bad' });
      }
    }
  }
});

test('shared status checks agree on shortages, target, bench and DPS-heavy warnings', () => {
  assert.deepEqual(compositionRoleStatus(1, 2, 'tank'), { status: 'Short 1', className: 'bad' });
  assert.deepEqual(compositionRoleStatus(3, 3, 'healer'), { status: 'On target', className: 'good' });
  assert.deepEqual(compositionRoleStatus(4, 3, 'healer'), { status: '+1 bench', className: 'good' });
  assert.deepEqual(compositionRoleStatus(6, 5, 'dps'), { status: '+1 bench', className: 'good' });
  assert.deepEqual(compositionRoleStatus(7, 5, 'dps'), { status: '2 over — DPS heavy', className: 'warn' });
});
