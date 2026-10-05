import test from 'node:test';
import assert from 'node:assert/strict';
import { attachSplitDrag, moveSplitMember } from '../../artifacts/raid-roster/public/split-drag.js';

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

test('blocked drop targets explain capacity on hover without repeated warnings', () => {
  const oldDocument = globalThis.document, oldCancel = globalThis.cancelAnimationFrame;
  globalThis.document = { addEventListener() {} };
  globalThis.cancelAnimationFrame = () => {};
  const events = {}, messages = [];
  const classes = { add() {}, remove() {} };
  const root = { addEventListener: (type, fn) => { events[type] = fn; }, contains: () => true, querySelectorAll: () => [], classList: classes };
  const row = { dataset: { spMember: 'player' }, classList: classes, closest: () => row };
  const target = { dataset: { spDropTeam: 'raid', spDropParty: '0' }, classList: classes,
    hasAttribute: () => true, closest: (selector) => selector === '[data-team-id]' ? { querySelector: () => ({ value: 'Main raid' }) } : target };
  try {
    attachSplitDrag({ root, canEdit: () => true, canDrop: () => false, onMove: () => assert.fail('A hover must not move players'), onBlocked: (message) => messages.push(message) });
    events.dragstart({ target: row, preventDefault() {}, dataTransfer: { setData() {}, setDragImage() {} } });
    const hover = { target, preventDefault() {}, dataTransfer: {} };
    events.dragover(hover);
    events.dragover(hover);
    assert.deepEqual(messages, ['Party 1 is full (5 players). Choose another party.']);
    assert.equal(hover.dataTransfer.dropEffect, 'none');
  } finally {
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldCancel === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = oldCancel;
  }
});
