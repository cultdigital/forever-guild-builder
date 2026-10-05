import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSplits } from '../../lib/roster/src/split-handler.js';
import { partyGroups } from '../../lib/roster/src/raid-parties.js';
import { moveSplitMember } from '../../artifacts/raid-roster/public/split-drag.js';

const ids = Array.from({ length: 12 }, (_, i) => `member-${i}`);
const makeTeam = (members = ids.slice(0, 6)) => ({ id: 'raid-a', name: 'Main raid', size: 10, memberIds: members, parties: [members.slice(0, 5), members.slice(5)] });
function fixture() {
  const records = new Map();
  const roster = { storageMissing: false, seedOnce: async () => {}, getAll: async () => ids.map((id) => ({ id })) };
  const splits = { getAll: async () => [...records.values()], put: async (s) => records.set(s.id, structuredClone(s)), remove: async (id) => records.delete(id) };
  return { records, request: (method, body = {}, query = {}) => handleSplits({ method, body, query, roster, splits }) };
}

test('single main raid and five-player parties persist and load', async () => {
  const f = fixture();
  const result = await f.request('POST', { name: 'Main composition', mainTeamId: 'raid-a', teams: [makeTeam()], memberRoles: { [ids[0]]: 'healer' } });
  assert.equal(result.status, 200);
  const loaded = await f.request('GET');
  assert.equal(loaded.json.setups[0].mainTeamId, 'raid-a');
  assert.deepEqual(loaded.json.setups[0].teams[0].parties, [ids.slice(0, 5), [ids[5]]]);
  assert.equal(loaded.json.setups[0].memberRoles[ids[0]], 'healer');
});

test('invalid, full, duplicate, unassigned and missing party placements cannot save', async () => {
  const f = fixture();
  const invalid = [
    [ids.slice(0, 6), []],
    [[ids[0]], [ids[0], ...ids.slice(1, 6)]],
    [[...ids.slice(0, 4), ids[8]], [ids[4], ids[5]]],
    [ids.slice(0, 4), [ids[5]]],
    [ids.slice(0, 5)],
  ];
  for (const parties of invalid) {
    const result = await f.request('POST', { name: 'Invalid grouping', teams: [{ ...makeTeam(), parties }] });
    assert.equal(result.status, 400);
    assert.equal(f.records.size, 0);
  }
  assert.equal((await f.request('POST', { name: 'Bad primary', mainTeamId: 'missing', teams: [makeTeam()] })).status, 400);
});

test('legacy setups infer parties; old clients preserve existing party placements', async () => {
  const f = fixture();
  const legacy = { id: 'legacy', name: 'Existing raid', teams: [{ id: 'raid-a', name: 'Existing team', size: 10, memberIds: ids.slice(0, 6) }], createdAt: 'original-date' };
  f.records.set(legacy.id, legacy);
  const loaded = (await f.request('GET')).json.setups[0];
  assert.deepEqual(loaded.teams[0].parties, [ids.slice(0, 5), [ids[5]]]);
  assert.equal(loaded.mainTeamId, 'raid-a');
  assert.equal(Object.hasOwn(f.records.get(legacy.id).teams[0], 'parties'), false);
  const custom = [[ids[1], ids[3], ids[5]], [ids[0], ids[2], ids[4]]];
  await f.request('POST', { ...loaded, teams: [{ ...loaded.teams[0], parties: custom }] });
  const edited = await f.request('POST', legacy);
  assert.deepEqual(edited.json.setup.teams[0].parties, custom);
  assert.equal(edited.json.setup.createdAt, 'original-date');
});

test('main raid can change within a multi-raid setup', async () => {
  const f = fixture();
  const b = { ...makeTeam(ids.slice(6, 12)), id: 'raid-b', name: 'Second raid' };
  const first = await f.request('POST', { name: 'Two raids', teams: [makeTeam(), b] });
  const changed = await f.request('POST', { ...first.json.setup, mainTeamId: b.id });
  assert.equal(changed.json.setup.mainTeamId, 'raid-b');
  assert.deepEqual(changed.json.setup.teams[0].parties, first.json.setup.teams[0].parties);
});

test('raid resizing keeps groups where possible and reseats only removed groups', () => {
  const large = { id: 'a', size: 40, memberIds: ids.slice(0, 3), parties: [[ids[0]], [], [], [], [], [], [], [ids[1], ids[2]]] };
  assert.deepEqual(partyGroups(large, 10), [[ids[0], ids[1], ids[2]], []]);
  const increased = partyGroups({ ...large, size: 10, parties: [[ids[1]], [ids[0], ids[2]]] }, 20);
  assert.deepEqual(increased, [[ids[1]], [ids[0], ids[2]], [], []]);
});

test('party moves change grouping without changing raid membership or role', () => {
  const draft = { teams: [makeTeam()], memberRoles: { [ids[0]]: 'tank' } };
  assert.equal(moveSplitMember(draft, ids[0], 'raid-a', undefined, 'dps', 1), '');
  assert.deepEqual(draft.teams[0].memberIds, ids.slice(0, 6));
  assert.deepEqual(draft.teams[0].parties, [ids.slice(1, 5), [ids[5], ids[0]]]);
  assert.equal(draft.memberRoles[ids[0]], 'tank');
  const before = structuredClone(draft);
  assert.equal(moveSplitMember(draft, ids[0], 'raid-a', undefined, undefined, 1), '');
  assert.deepEqual(draft, before);
});

test('full party rejection is atomic even when the raid has space', () => {
  const draft = { teams: [makeTeam()], memberRoles: { [ids[5]]: 'healer' } };
  const before = structuredClone(draft);
  assert.match(moveSplitMember(draft, ids[5], 'raid-a', 'tank', 'dps', 0), /full/);
  assert.deepEqual(draft, before);
  assert.match(moveSplitMember(draft, ids[5], 'raid-a', undefined, undefined, 8), /no longer/);
  assert.deepEqual(draft, before);
});

test('cross-raid moves and unassignment clean old party membership', () => {
  const draft = { teams: [makeTeam(), { id: 'raid-b', name: 'Other raid', size: 10, memberIds: [], parties: [[], []] }], memberRoles: { [ids[0]]: 'tank' } };
  assert.equal(moveSplitMember(draft, ids[0], 'raid-b', undefined, undefined, 1), '');
  assert.equal(draft.teams[0].parties.flat().includes(ids[0]), false);
  assert.deepEqual(draft.teams[1].parties, [[], [ids[0]]]);
  assert.equal(moveSplitMember(draft, ids[0], ''), '');
  assert.equal(draft.teams.some((t) => t.parties.flat().includes(ids[0])), false);
  assert.equal(draft.memberRoles[ids[0]], 'tank');
});
