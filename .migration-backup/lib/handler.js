import { randomUUID } from 'node:crypto';
import { CLASSES, WILLINGNESS, MAX_ALTS, ASSIGNMENTS, PROFESSIONS, MAX_PRIMARY_PROFS } from '../public/data.js';
import * as store from './store.js';
import { SEED } from './seed.js';

const MAX_MEMBERS = 300;
const NAME_RE = /^\p{L}[\p{L}' -]{1,23}$/u;

const slug = (name) => String(name).trim().toLowerCase().replace(/\s+/g, '-');

// Drop fields left over from the old ownership model.
function strip(m) {
  const { tokenHash, source, claimed, ...rest } = m;
  return { professions: [], ...rest };
}

function bad(message, status = 400) {
  return { status, json: { error: message } };
}

function validChar(c) {
  if (!c || typeof c !== 'object') return 'Pick a class.';
  const cls = CLASSES[c.class];
  if (!cls) return 'Pick a valid class.';
  if (c.spec && !cls.specs.some((s) => s[0] === c.spec)) return `${c.spec} isn't a ${cls.label} spec.`;
  if (c.race && !cls.races.includes(c.race)) return `${cls.label} isn't available to that race on the Horde.`;
  return null;
}

function clean(body) {
  const name = String(body.name || '').trim();
  if (!NAME_RE.test(name)) return { error: 'Name must be 2–24 letters.' };

  const main = body.main || {};
  const mainErr = validChar(main);
  if (mainErr) return { error: mainErr };

  const altsIn = Array.isArray(body.alts) ? body.alts : [];
  if (altsIn.length > MAX_ALTS) return { error: `Up to ${MAX_ALTS} alternates.` };
  const alts = [];
  for (const a of altsIn) {
    const err = validChar(a);
    if (err) return { error: `Alternate: ${err}` };
    if (!WILLINGNESS[a.will]) return { error: 'Alternate: choose how keen you are.' };
    alts.push({ class: a.class, spec: a.spec || null, will: a.will });
  }

  const professions = [...new Set((Array.isArray(body.professions) ? body.professions : []).filter((p) => PROFESSIONS[p]))];
  if (professions.filter((p) => PROFESSIONS[p].primary).length > MAX_PRIMARY_PROFS) {
    return { error: `Pick up to ${MAX_PRIMARY_PROFS} primary professions.` };
  }

  return {
    value: {
      name,
      main: { class: main.class, spec: main.spec || null, race: main.race || null },
      alts,
      professions,
      notes: String(body.notes || '').trim().slice(0, 200),
      assignment: ASSIGNMENTS[body.assignment] ? body.assignment : null,
    },
  };
}

const findByName = (all, name, exceptId) => all.find((m) => m.id !== exceptId && slug(m.name) === slug(name));

export async function handle({ method, query = {}, body = {} }) {
  try {
    if (store.storageMissing) {
      if (method !== 'GET') return bad("Storage isn't connected yet — add Upstash Redis to the Vercel project.", 503);
      return { status: 200, json: { members: SEED.map(strip), storage: 'missing' } };
    }

    // Seed on every request, not just reads, so an edit never lands on an empty store.
    await store.seedOnce(SEED);

    if (method === 'GET') {
      const members = (await store.getAll()).map(strip);
      members.sort((a, b) => a.name.localeCompare(b.name));
      return { status: 200, json: { members, storage: store.usingRedis ? 'redis' : 'local' } };
    }

    if (method === 'POST') {
      body = body || {};
      const all = await store.getAll();

      // Edit: merge only the fields sent onto the stored entry, so concurrent edits to
      // different fields don't overwrite each other.
      if (body.id) {
        const existing = all.find((m) => m.id === String(body.id));
        if (!existing) return bad('That entry was removed by someone else — the roster has been refreshed.', 404);
        const { id, ...changes } = body;
        const merged = { ...strip(existing), ...changes, main: { ...existing.main, ...(changes.main || {}) } };
        const { value, error } = clean(merged);
        if (error) return bad(error);
        const clash = findByName(all, value.name, existing.id);
        if (clash) return bad(`${clash.name} is already on the roster.`, 409);
        const member = { ...value, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
        await store.put(member);
        return { status: 200, json: { member } };
      }

      // New sign-up.
      const { value, error } = clean(body);
      if (error) return bad(error);
      const clash = findByName(all, value.name);
      if (clash) return bad(`${clash.name} is already on the roster — use the pencil icons to edit them.`, 409);
      if (all.length >= MAX_MEMBERS) return bad('Roster is full.', 403);
      // A renamed entry may still hold this slug as its id, so fall back to a unique one.
      const base = slug(value.name);
      const id = all.some((m) => m.id === base) ? `${base}-${randomUUID().slice(0, 6)}` : base;
      const now = new Date().toISOString();
      const member = { ...value, id, createdAt: now, updatedAt: now };
      await store.put(member);
      return { status: 200, json: { member } };
    }

    if (method === 'DELETE') {
      const id = String(query.id || '');
      if (!(await store.get(id))) return bad('That entry was already removed.', 404);
      await store.remove(id);
      return { status: 200, json: { ok: true } };
    }

    return bad('Method not allowed.', 405);
  } catch (e) {
    console.error(e);
    return bad('Server error — try again shortly.', 500);
  }
}
