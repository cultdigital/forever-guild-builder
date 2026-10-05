import { CLASSES, roleOf } from './data.js';
import { memberRole } from './member-sort.js';

// Shared by whole-roster composition, saved scopes and unsaved split previews.
export function analyseComposition(list, classes = CLASSES) {
  const byRole = { tank: [], healer: [], dps: [], none: [] };
  const flex = { tank: [], healer: [], dps: [] };
  const cls = {};
  for (const [id, def] of Object.entries(classes)) {
    cls[id] = { mains: [], alts: [], noSpec: [], specs: {} };
    for (const [sid] of def.specs) cls[id].specs[sid] = { mains: [], alts: [] };
  }
  const races = {};
  for (const member of list) {
    const role = memberRole(member);
    byRole[role || 'none'].push(member);
    const main = member.main || {};
    const C = cls[main.class];
    if (C) {
      C.mains.push(member);
      if (main.spec && C.specs[main.spec]) C.specs[main.spec].mains.push(member);
      else C.noSpec.push(member);
    }
    const race = main.race || 'none';
    races[race] = (races[race] || 0) + 1;
    const seen = new Set();
    for (const alt of member.alts || []) {
      const A = cls[alt.class];
      if (!A) continue;
      A.alts.push({ m: member, a: alt });
      if (alt.spec && A.specs[alt.spec]) A.specs[alt.spec].alts.push({ m: member, a: alt });
      const alternateRole = roleOf(alt.class, alt.spec);
      if (alternateRole && alternateRole !== role && !seen.has(alternateRole)) {
        seen.add(alternateRole);
        flex[alternateRole].push({ m: member, a: alt });
      }
    }
  }
  return { total: list.length, byRole, flex, cls, races };
}

export function compositionRoleStatus(have, want, role) {
  const diff = have - want;
  if (diff < 0) return { status: `Short ${-diff}`, className: 'bad' };
  if (role === 'dps' && have > want * 1.3) return { status: `${diff} over — DPS heavy`, className: 'warn' };
  if (diff > 0) return { status: `+${diff} bench`, className: 'good' };
  return { status: 'On target', className: 'good' };
}
