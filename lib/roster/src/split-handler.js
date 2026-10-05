import { randomUUID } from 'node:crypto';
import * as legacyRoster from './store.js';
import * as legacySplits from './split-store.js';
import { SEED } from './seed.js';

const bad = (error, status = 400) => ({ status, json: { error } });
const nameKey = (name) => name.toLowerCase().replace(/\s+/g, ' ');

export async function handleSplits({ method, query = {}, body = {}, roster = legacyRoster, splits = legacySplits }) {
  try {
    if (roster.storageMissing) {
      return method === 'GET'
        ? { status: 200, json: { setups: [], storage: 'missing' } }
        : bad("Storage isn't connected yet — configure Redis before saving a published roster.", 503);
    }
    await roster.seedOnce(SEED);
    const members = new Set((await roster.getAll()).map((member) => member.id));
    const all = await splits.getAll();
    if (method === 'GET') {
      // Removed members do not consume capacity or leak into team analysis.
      const setups = all.map((setup) => ({
        ...setup,
        teams: setup.teams.map((team) => ({ ...team, memberIds: team.memberIds.filter((id) => members.has(id)) })),
      })).sort((a, b) => a.name.localeCompare(b.name));
      return { status: 200, json: { setups, storage: roster.usingRedis ? 'redis' : 'local' } };
    }
    if (method === 'DELETE') {
      const id = String(query.id || '');
      if (!all.some((setup) => setup.id === id)) return bad('That setup was already removed.', 404);
      await splits.remove(id);
      return { status: 200, json: { ok: true } };
    }
    if (method !== 'POST') return bad('Method not allowed.', 405);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('Invalid setup.');
    const existing = body.id ? all.find((setup) => setup.id === body.id) : null;
    if (body.id && !existing) return bad('That setup was removed — refresh the saved setups.', 404);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 60) return bad('Setup name must be 1–60 characters.');
    if (all.some((setup) => setup.id !== existing?.id && nameKey(setup.name) === nameKey(name))) {
      return bad('A setup with that name already exists.', 409);
    }
    if (!Array.isArray(body.teams) || body.teams.length < 1 || body.teams.length > 10) return bad('Choose 1–10 teams.');
    const teamIds = new Set();
    const assigned = new Set();
    const teams = [];
    let capacity = 0;
    for (const team of body.teams) {
      if (!team || typeof team !== 'object') return bad('Invalid team.');
      const teamName = typeof team.name === 'string' ? team.name.trim() : '';
      if (!teamName || teamName.length > 40) return bad('Team names must be 1–40 characters.');
      if (typeof team.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(team.id) || teamIds.has(team.id)) return bad('Each team needs a unique valid ID.');
      teamIds.add(team.id);
      if (![10, 20, 40].includes(team.size)) return bad('Team sizes must be 10, 20, or 40.');
      capacity += team.size;
      if (capacity > 100) return bad('Total team capacity cannot exceed 100 members.');
      if (!Array.isArray(team.memberIds) || team.memberIds.length > team.size) return bad(`${teamName} exceeds its ${team.size}-member capacity.`);
      for (const id of team.memberIds) {
        if (typeof id !== 'string' || !members.has(id)) return bad('A selected member no longer exists — refresh the roster.');
        if (assigned.has(id)) return bad('A member can belong to only one team in this setup.');
        assigned.add(id);
      }
      teams.push({ id: team.id, name: teamName, size: team.size, memberIds: [...team.memberIds] });
    }
    const now = new Date().toISOString();
    const setup = { id: existing?.id || randomUUID(), name, teams, createdAt: existing?.createdAt || now, updatedAt: now };
    await splits.put(setup);
    return { status: 200, json: { setup } };
  } catch (error) {
    if (roster !== legacyRoster && error.status) return bad(error.message, error.status);
    if (roster === legacyRoster) console.error('Split setup request failed', error);
    return bad('Could not access saved setups — try again shortly.', 500);
  }
}