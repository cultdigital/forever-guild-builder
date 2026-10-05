import test from 'node:test';
import assert from 'node:assert/strict';
import { moveSplitMember } from '../../artifacts/raid-roster/public/split-drag.js';

const setup = () => ({
  teams: [{ id: 'a', name: 'A', size: 10, memberIds: ['player'] }, { id: 'b', name: 'B', size: 10, memberIds: [] }],
  memberRoles: { player: 'healer' },
});

test('dropping onto another team moves the player without duplicating them or clearing their role', () => {
  const draft = setup();
  assert.equal(moveSplitMember(draft, 'player', 'b'), '');
  assert.deepEqual(draft.teams.map(t => t.memberIds), [[], ['player']]);
  assert.equal(draft.memberRoles.player, 'healer');
});

test('dropping into a role column moves the player and sets their setup role', () => {
  const draft = setup();
  assert.equal(moveSplitMember(draft, 'player', 'b', 'tank', 'dps'), '');
  assert.equal(draft.memberRoles.player, 'tank');
  assert.deepEqual(draft.teams[1].memberIds, ['player']);
});

test('dropping back into unassigned removes assignment and retains the chosen role', () => {
  const draft = setup();
  assert.equal(moveSplitMember(draft, 'player', ''), '');
  assert.deepEqual(draft.teams.map(t => t.memberIds), [[], []]);
  assert.equal(draft.memberRoles.player, 'healer');
});

test('full teams reject the entire move without changing the source or raid role', () => {
  const draft = setup();
  draft.teams[1].memberIds = Array.from({ length: 10 }, (_, i) => `full-${i}`);
  const before = structuredClone(draft);
  assert.match(moveSplitMember(draft, 'player', 'b', 'tank', 'dps'), /is full/);
  assert.deepEqual(draft, before);
});

test('changing role inside a full team is allowed and selecting the main role clears the override', () => {
  const draft = setup();
  draft.teams[0].memberIds.push(...Array.from({ length: 9 }, (_, i) => `full-${i}`));
  assert.equal(moveSplitMember(draft, 'player', 'a', 'tank', 'dps'), '');
  assert.equal(draft.memberRoles.player, 'tank');
  assert.equal(draft.teams[0].memberIds.length, 10);
  assert.equal(moveSplitMember(draft, 'player', 'a', 'dps', 'dps'), '');
  assert.equal(Object.hasOwn(draft.memberRoles, 'player'), false);
  assert.equal(draft.teams[0].memberIds[0], 'player');
});

test('unknown teams and invalid roles do not mutate the draft', () => {
  for (const [team, role] of [['removed', 'tank'], ['b', 'invalid']]) {
    const draft = setup(), before = structuredClone(draft);
    assert.ok(moveSplitMember(draft, 'player', team, role, 'dps'));
    assert.deepEqual(draft, before);
  }
});
