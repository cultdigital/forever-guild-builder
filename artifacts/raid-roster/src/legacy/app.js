import {
  GUILD_NAME, ROLES, RACES, CLASSES, PURE_DPS, WILLINGNESS, RAID_SIZES, MAX_ALTS, ASSIGNMENTS, PROFESSIONS, MAX_PRIMARY_PROFS,
  getSpec, roleOf, iconUrl,
} from '@workspace/roster/data';
import { createSplits } from './split-controls.js';

const $ = (sel, root = document) => root.querySelector(sel);
const ROLE_ORDER = ['tank', 'healer', 'dps'];
const UTILITY_ICON = {
  warrior: 'ability_warrior_battleshout', paladin: 'spell_magic_greaterblessingofkings',
  hunter: 'ability_trueshot', rogue: 'classicon_rogue', priest: 'spell_holy_wordfortitude',
  shaman: 'spell_nature_windfury', mage: 'spell_holy_magicalsentry',
  warlock: 'spell_shadow_twilight', druid: 'spell_nature_regeneration',
};

// ---------- state ----------
let members = [];
let raidSize = '20';
const filters = { q: '', role: 'all', cls: null };
const blankForm = () => ({ editingId: null, name: '', main: { class: null, spec: null, race: null }, alts: [], professions: [], notes: '' });
let form = blankForm();

// ---------- utils ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, cls = '', alt = '') => `<img class="ico ${cls}" src="${iconUrl(name)}" alt="${esc(alt)}" width="64" height="64" decoding="async">`;
const slug = (n) => n.trim().toLowerCase().replace(/\s+/g, '-');
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const classColor = (c) => CLASSES[c]?.color || '#aaa';
const nameChip = (m) => `<span class="nm" style="--c:${classColor(m.main.class)}">${esc(m.name)}</span>`;

function specLabel(c) {
  const cls = CLASSES[c.class];
  const s = getSpec(c.class, c.spec);
  return s ? `${s.label} ${cls.label}` : cls.label;
}
function charIcons(c, size = '') {
  const s = getSpec(c.class, c.spec);
  return icon(`classicon_${c.class}`, size, CLASSES[c.class].label) + (s ? icon(s.icon, size, s.label) : '');
}

let scopeTarget = '';
const splits = createSplits({
  getMembers: () => members, api, toast, esc, nameChip,
  onScopeChange: (team, quiet) => {
    const key = team ? `${team.id}:${team.size}` : '';
    if (team && (!quiet || key !== scopeTarget) && RAID_SIZES[String(team.size)]) raidSize = String(team.size);
    scopeTarget = key;
    renderComp();
  },
});

// ---------- API ----------
async function api(method, { body, query = '', path = '' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const res = await fetch(`/api/roster${path}${query}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({ error: 'Unexpected response' }));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

async function load() {
  closePop();
  try {
    const data = await api('GET');
    members = data.members;
    $('#storage-note').textContent = { local: 'Local preview — data saved on this machine only.', missing: 'Read-only: storage not connected yet. Showing survey data.' }[data.storage] || '';
  } catch (e) {
    $('#headline-stats').textContent = `Couldn't reach the roster: ${e.message}`;
    return;
  }
  renderAll();
  splits.load();
}

// ---------- composition maths ----------
function analyse(list = members) {
  const total = list.length;
  const byRole = { tank: [], healer: [], dps: [], none: [] };
  const flex = { tank: [], healer: [], dps: [] };
  const cls = {};
  for (const c of Object.keys(CLASSES)) {
    cls[c] = { mains: [], alts: [], noSpec: [], specs: {} };
    for (const [sid] of CLASSES[c].specs) cls[c].specs[sid] = { mains: [], alts: [] };
  }
  const races = {};

  for (const m of list) {
    const r = roleOf(m.main.class, m.main.spec);
    byRole[r || 'none'].push(m);
    const C = cls[m.main.class];
    if (C) {
      C.mains.push(m);
      if (m.main.spec && C.specs[m.main.spec]) C.specs[m.main.spec].mains.push(m);
      else C.noSpec.push(m);
    }
    races[m.main.race || 'none'] = (races[m.main.race || 'none'] || 0) + 1;

    const seenRole = new Set();
    for (const a of m.alts || []) {
      const A = cls[a.class];
      if (!A) continue;
      A.alts.push({ m, a });
      if (a.spec && A.specs[a.spec]) A.specs[a.spec].alts.push({ m, a });
      const ar = roleOf(a.class, a.spec);
      if (ar && ar !== r && !seenRole.has(ar)) { seenRole.add(ar); flex[ar].push({ m, a }); }
    }
  }
  return { total, byRole, flex, cls, races };
}

const willRank = { keen: 0, happy: 1, ifneeded: 2 };
const byWill = (x, y) => willRank[x.a.will] - willRank[y.a.will];
function flexNames(list, max = 6) {
  const sorted = [...list].sort(byWill);
  const shown = sorted.slice(0, max).map(({ m, a }) =>
    `<span class="flex-name w-${a.will}" data-tip="${esc(`${WILLINGNESS[a.will].long} play ${specLabel(a)}`)}">${esc(m.name)}</span>`).join('');
  return shown + (sorted.length > max ? `<span class="muted"> +${sorted.length - max} more</span>` : '');
}

// ---------- header ----------
function renderHeader(A) {
  $('#guild-name').textContent = `<${GUILD_NAME}>`;
  const t = A.byRole.tank.length, h = A.byRole.healer.length, d = A.byRole.dps.length;
  $('#headline-stats').innerHTML = `<b>${A.total}</b> signed up · <span class="r-tank">${t} tanks</span> · <span class="r-healer">${h} healers</span> · <span class="r-dps">${d} DPS</span>${A.byRole.none.length ? ` · <span class="muted">${A.byRole.none.length} undecided</span>` : ''}`;
}

// ---------- composition tab ----------
function assignLine() {
  const who = (k) => splits.scopeMembers().filter((m) => m.assignment === k);
  return `<div class="rc-assign">${['mt', 'ot', 'flex'].map((k) => `<span><span class="asg asg-${k}">${ASSIGNMENTS[k].short}</span> ${who(k).length ? who(k).map(nameChip).join(', ') : '<span class="muted">unassigned</span>'}</span>`).join('')}</div>`;
}

function renderComp() {
  const A = analyse(splits.scopeMembers());
  const target = RAID_SIZES[raidSize];

  $('#raid-size').innerHTML = Object.entries(RAID_SIZES).map(([k, v]) =>
    `<button type="button" role="radio" aria-checked="${k === raidSize}" data-size="${k}">${esc(v.label)}</button>`).join('');

  // Role cards
  $('#role-cards').innerHTML = ROLE_ORDER.map((r) => {
    const have = A.byRole[r].length, want = target[r];
    const diff = have - want;
    let status, cls;
    if (diff < 0) { status = `Short ${-diff}`; cls = 'bad'; }
    else if (r === 'dps' && have > want * 1.3) { status = `${diff} over — DPS heavy`; cls = 'warn'; }
    else if (diff > 0) { status = `+${diff} bench`; cls = 'good'; }
    else { status = 'On target'; cls = 'good'; }
    const fl = A.flex[r];
    return `<div class="role-card ${cls}" style="--rc:${ROLES[r].color}">
      <div class="rc-top">${icon(ROLES[r].icon, 'lg', ROLES[r].label)}<div><div class="rc-label">${r === 'dps' ? 'DPS' : ROLES[r].label + 's'}</div><div class="rc-status">${status}</div></div></div>
      <div class="rc-num"><b>${have}</b><span>/ ${want} for ${raidSize}</span></div>
      <div class="meter"><i style="width:${Math.min(100, pct(have, want))}%"></i></div>
      ${r === 'tank' ? assignLine() : ''}
      <div class="rc-flex">${fl.length ? `<span class="muted">+${fl.length} could flex:</span> ${flexNames(fl, 4)}` : '<span class="muted">No alternates in this role yet</span>'}</div>
    </div>`;
  }).join('') + (A.byRole.none.length ? `<div class="role-card undecided">
      <div class="rc-top">${icon('inv_misc_questionmark', 'lg', '')}<div><div class="rc-label">Undecided</div><div class="rc-status">Hybrid, no spec yet</div></div></div>
      <div class="rc-num"><b>${A.byRole.none.length}</b><span>members</span></div>
      <div class="rc-flex">${A.byRole.none.map(nameChip).join(' ')}</div>
    </div>` : '');

  // Role bar: guild vs target
  const seg = (counts, totalN) => ROLE_ORDER.concat('none').filter((r) => counts[r]).map((r) => {
    const n = counts[r];
    const lab = r === 'none' ? 'Undecided' : ROLES[r].label;
    return `<span class="seg-${r}" style="flex:${n}" data-tip="${esc(`${lab}: ${n} (${pct(n, totalN)}%)`)}">${pct(n, totalN) >= 8 ? `${n}` : ''}</span>`;
  }).join('');
  const gc = Object.fromEntries(Object.entries(A.byRole).map(([k, v]) => [k, v.length]));
  $('#role-bar').innerHTML = `
    <div class="bar-row"><span class="bar-label">${esc(splits.scopeTeam()?.name || 'Guild')}</span><div class="bar">${seg(gc, A.total) || '<span class="seg-none" style="flex:1">No members assigned</span>'}</div></div>
    <div class="bar-row"><span class="bar-label">${raidSize}-man target</span><div class="bar target">${seg({ tank: target.tank, healer: target.healer, dps: target.dps }, Number(raidSize))}</div></div>`;
  $('#role-legend').innerHTML = ROLE_ORDER.map((r) => `<span><i class="sw seg-${r}"></i>${ROLES[r].label} ${pct(gc[r], A.total)}% <span class="muted">(target ${pct(target[r], Number(raidSize))}%)</span></span>`).join('') +
    (gc.none ? `<span><i class="sw seg-none"></i>Undecided ${pct(gc.none, A.total)}%</span>` : '');

  renderTankFrames();
  renderInsights(A, target);
  renderClassGrid(A);
  renderUtility(A);
  renderRaces(A);
  renderProfessions();
  splits.renderScopeBar();
}

function renderInsights(A, target) {
  const items = [];
  const add = (sev, html) => items.push({ sev, html });

  for (const r of ROLE_ORDER) {
    const have = A.byRole[r].length, want = target[r];
    if (have < want) {
      const fl = A.flex[r];
      add('gap', `<b>Short ${plural(want - have, ROLES[r].label.toLowerCase())}</b> for a ${raidSize}-man (${have}/${want}).${fl.length ? ` Could flex: ${flexNames(fl)}` : ' Nobody has listed this role as an alternate.'}`);
    }
  }

  const missingClasses = Object.keys(CLASSES).filter((c) => !A.cls[c].mains.length);
  for (const c of missingClasses) {
    const alts = A.cls[c].alts;
    add('gap', `${icon(`classicon_${c}`, 'sm')} <b>No ${CLASSES[c].label} mains</b> — lose ${esc(CLASSES[c].utility)}.${alts.length ? ` Willing alts: ${flexNames(alts)}` : ''}`);
  }

  // Hybrid spec gaps (pure DPS classes' specs are interchangeable for comp purposes).
  const specGaps = [];
  for (const [c, def] of Object.entries(CLASSES)) {
    if (PURE_DPS.includes(c) || missingClasses.includes(c)) continue;
    for (const [sid, label, , ic] of def.specs) {
      const S = A.cls[c].specs[sid];
      if (!S.mains.length) specGaps.push({ c, label, ic, n: S.alts.length });
    }
  }
  if (specGaps.length) {
    add('warn', `<b>Specs with no mains:</b><span class="chips">${specGaps.map((g) =>
      `<span class="chip" style="--c:${classColor(g.c)}" data-tip="${g.n ? `${g.n} listed as alternate` : 'Nobody has listed this'}">${icon(g.ic, 'xs')}${esc(g.label)} ${esc(CLASSES[g.c].label)}${g.n ? ` <em>${g.n} alt</em>` : ''}</span>`).join('')}</span>`);
  }

  // Stacking
  if (A.total >= 6) {
    for (const [c, C] of Object.entries(A.cls)) {
      const n = C.mains.length;
      if (n >= 4 && n / A.total > 0.2) add('warn', `${icon(`classicon_${c}`, 'sm')} <b>Stacked: ${n} ${CLASSES[c].label}s</b> (${pct(n, A.total)}% of the roster) — gear competition likely.`);
      for (const [sid, S] of Object.entries(C.specs)) {
        const k = S.mains.length;
        if (k >= 3 && k / A.total > 0.15) {
          const s = getSpec(c, sid);
          add('warn', `${icon(s.icon, 'sm')} <b>Crowded: ${k} ${s.label} ${CLASSES[c].label}s</b> (${pct(k, A.total)}%). Their alternates: ${S.mains.flatMap((m) => m.alts.map((a) => ({ m, a }))).length ? flexNames(S.mains.flatMap((m) => m.alts.map((a) => ({ m, a })))) : '<span class="muted">none listed</span>'}`);
        }
      }
    }
  }

  const undecided = A.byRole.none;
  if (undecided.length) add('info', `<b>${plural(undecided.length, 'hybrid')} without a spec:</b> ${undecided.map((m) => `${nameChip(m)} <span class="muted">(${CLASSES[m.main.class].label})</span>`).join(', ')}. Their role isn't counted until they choose.`);

  const noAlts = splits.scopeMembers().filter((m) => !m.alts?.length).length;
  if (noAlts) add('info', `<b>${noAlts} of ${A.total}</b> haven't listed any alternates — flex options above may be understated.`);

  if (!items.some((i) => i.sev === 'gap')) add('ok', `<b>Core roles covered</b> for a ${raidSize}-man and every class is represented.`);

  const order = { gap: 0, warn: 1, info: 2, ok: 3 };
  items.sort((a, b) => order[a.sev] - order[b.sev]);
  $('#insights').innerHTML = items.map((i) => `<li class="ins ${i.sev}"><span class="ins-tag">${{ gap: 'Gap', warn: 'Watch', info: 'Note', ok: 'Good' }[i.sev]}</span><div>${i.html}</div></li>`).join('');
}

function pips(mains, alts, color) {
  const a = [...alts].sort(byWill);
  return `<span class="pips">${mains.map((m) => `<i class="pip main" style="--c:${color}" data-tip="${esc(m.name)} (main)"></i>`).join('')}${a.map(({ m, a: x }) => `<i class="pip ${x.will}" data-tip="${esc(`${m.name} — ${WILLINGNESS[x.will].label} alt`)}"></i>`).join('')}</span>`;
}

function renderClassGrid(A) {
  const max = Math.max(1, ...Object.values(A.cls).map((C) => C.mains.length));
  $('#class-grid').innerHTML = Object.entries(CLASSES).map(([c, def]) => {
    const C = A.cls[c];
    const n = C.mains.length;
    const tag = !n ? '<span class="tag gap">Gap</span>' : (A.total >= 6 && n >= 4 && n / A.total > 0.2) ? '<span class="tag warn">Stacked</span>' : '';
    const specRows = def.specs.map(([sid, label, role, ic]) => {
      const S = C.specs[sid];
      const gap = !S.mains.length && !PURE_DPS.includes(c);
      return `<li class="${gap ? 'is-gap' : ''}">
        ${icon(ic, 'sm', label)}
        <span class="sp-name">${esc(label)}</span>
        ${icon(ROLES[role].icon, 'xs role-ico', ROLES[role].label)}
        ${pips(S.mains, S.alts, def.color)}
        <span class="sp-count">${S.mains.length || (gap ? '<span class="gap-dash">0</span>' : '0')}</span>
      </li>`;
    }).join('');
    const noSpec = C.noSpec.length ? `<li class="nospec">${icon('inv_misc_questionmark', 'sm')}<span class="sp-name">Spec TBD</span><span></span>${pips(C.noSpec, [], def.color)}<span class="sp-count">${C.noSpec.length}</span></li>` : '';
    return `<article class="class-card" style="--c:${def.color}">
      <header>${icon(`classicon_${c}`, 'md', def.label)}<div class="cc-title"><h3>${def.label}</h3><span class="muted">${C.alts.length ? `+${C.alts.length} as alt` : 'no alts'}</span></div><div class="cc-count">${n}</div>${tag}</header>
      <div class="cc-bar"><i style="width:${pct(n, max)}%"></i></div>
      <ul class="spec-list">${specRows}${noSpec}</ul>
      <footer>${C.mains.length ? C.mains.map((m) => `<button type="button" class="nm nm-btn" data-pen="classspec" data-id="${esc(m.id)}" style="--c:${def.color}" data-tip="Edit class & spec">${esc(m.name)}</button>`).join('') : '<span class="muted">Nobody yet</span>'}</footer>
    </article>`;
  }).join('');
}

function renderUtility(A) {
  $('#utility').innerHTML = Object.entries(CLASSES).map(([c, def]) => {
    const n = A.cls[c].mains.length, alts = A.cls[c].alts.length;
    const st = n ? 'have' : alts ? 'flex' : 'miss';
    const label = n ? `${n} main${n > 1 ? 's' : ''}` : alts ? `alts only (${alts})` : 'missing';
    return `<li class="util ${st}">${icon(UTILITY_ICON[c], 'sm')}<div><b style="color:${def.color}">${esc(def.utility)}</b><span class="muted">${def.label}</span></div><span class="util-st">${label}</span></li>`;
  }).join('');
}

function renderRaces(A) {
  const max = Math.max(1, ...Object.values(A.races));
  const rows = Object.entries(RACES).map(([r, def]) => [r, def.label, def.icon, A.races[r] || 0]);
  if (A.races.none) rows.push(['none', 'Not chosen', 'inv_misc_questionmark', A.races.none]);
  $('#races').innerHTML = rows.map(([r, label, ic, n]) => `<div class="race-row">${icon(ic, 'sm', label)}<span class="race-name">${esc(label)}${RACES[r]?.isNew ? ' <span class="new">New</span>' : ''}</span><div class="hbar"><i style="width:${pct(n, max)}%"></i></div><b>${n}</b></div>`).join('');
}

function renderProfessions() {
  const scoped = splits.scopeMembers();
  $('#professions').innerHTML = Object.entries(PROFESSIONS).map(([k, p]) => {
    const who = scoped.filter((m) => (m.professions || []).includes(k));
    return `<div class="prof-card ${who.length ? '' : 'empty-prof'}">
      <div class="prof-top">${icon(p.icon, 'sm', p.label)}<b>${p.label}</b>${p.primary ? '' : '<span class="muted">secondary</span>'}<span class="prof-count">${who.length}</span></div>
      <div class="prof-names">${who.length ? who.map((m) => `<button type="button" class="nm nm-btn" data-pen="prof" data-id="${esc(m.id)}" style="--c:${classColor(m.main.class)}">${esc(m.name)}</button>`).join('') : '<span class="muted">Nobody yet</span>'}</div>
    </div>`;
  }).join('');
}

// ---------- nameplates (raid-frame style) ----------
const PEN = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path fill="currentColor" d="M11.6 1.2a1.2 1.2 0 0 1 1.7 0l1.5 1.5a1.2 1.2 0 0 1 0 1.7L5.4 13.8l-3.9.7.7-3.9z"/></svg>';
const pen = (m, field, label) => `<button type="button" class="pen" data-pen="${field}" data-id="${esc(m.id)}" aria-label="Edit ${label} for ${esc(m.name)}" data-tip="Edit ${label}">${PEN}</button>`;
const ASSIGN_ORDER = Object.keys(ASSIGNMENTS);
const asgIdx = (m) => (m.assignment ? ASSIGN_ORDER.indexOf(m.assignment) : 99);
const CLASS_ORDER = Object.keys(CLASSES);
const plateSort = (a, b) => asgIdx(a) - asgIdx(b) || CLASS_ORDER.indexOf(a.main.class) - CLASS_ORDER.indexOf(b.main.class) || a.name.localeCompare(b.name);

function plate(m) {
  const r = roleOf(m.main.class, m.main.spec);
  const race = RACES[m.main.race];
  const asg = ASSIGNMENTS[m.assignment];
  const spec = getSpec(m.main.class, m.main.spec);
  const alts = m.alts.map((a, i) => `<span class="alt-chip w-${a.will}" data-tip="${esc(`Alt ${i + 1}: ${specLabel(a)} — ${WILLINGNESS[a.will].long}`)}">${charIcons(a, 'xs')}<span>${esc(getSpec(a.class, a.spec)?.label || CLASSES[a.class].label)}</span></span>`).join('');
  return `<article class="plate" style="--c:${classColor(m.main.class)}">
    <div class="plate-bar">
      ${icon(r ? ROLES[r].icon : 'inv_misc_questionmark', 'xs plate-role', r ? ROLES[r].label : 'Undecided')}
      <span class="plate-name">${esc(m.name)}</span>${pen(m, 'name', 'name')}
      <span class="plate-asg">${asg ? `<span class="asg asg-${m.assignment}" data-tip="${esc(asg.label)}">${asg.short}</span>` : ''}${pen(m, 'assign', 'raid assignment')}</span>
    </div>
    <div class="plate-body">
      <div class="plate-line main-line">
        <span class="pl-item">${icon(`classicon_${m.main.class}`, 'sm', CLASSES[m.main.class].label)}<span class="pl-spec">${CLASSES[m.main.class].label}</span>${pen(m, 'class', 'class')}</span>
        <span class="pl-item">${spec ? `${icon(spec.icon, 'sm', spec.label)}<span class="pl-spec">${esc(spec.label)}</span>` : '<span class="muted">No spec</span>'}${pen(m, 'spec', 'spec')}</span>
        <span class="pl-item">${race ? `${icon(race.icon, 'sm', race.label)}${esc(race.label)}` : '<span class="muted">No race</span>'}${pen(m, 'race', 'race')}</span>
      </div>
      <div class="plate-line">
        <span class="pl-label">Alts</span><span class="alt-list">${alts || '<span class="muted">none</span>'}</span>${pen(m, 'alts', 'alternates')}
      </div>
      <div class="plate-line">
        <span class="pl-label">Profs</span><span class="prof-list">${(m.professions || []).length ? m.professions.map((p) => `<span class="prof-chip" data-tip="${PROFESSIONS[p].label}">${icon(PROFESSIONS[p].icon, 'xs', PROFESSIONS[p].label)}${PROFESSIONS[p].label}</span>`).join('') : '<span class="muted">none</span>'}</span>${pen(m, 'prof', 'professions')}
      </div>
      ${m.notes ? `<div class="note">${esc(m.notes)}</div>` : ''}
    </div>
  </article>`;
}

function renderTankFrames() {
  const tanks = splits.scopeMembers().filter((m) => roleOf(m.main.class, m.main.spec) === 'tank' || ['mt', 'ot', 'flex'].includes(m.assignment)).sort(plateSort);
  $('#tank-frames').innerHTML = tanks.length ? tanks.map(plate).join('') : '<p class="empty">No tanks yet.</p>';
}

// ---------- roster tab ----------
function renderRoster() {
  $('#role-filter').innerHTML = [['all', 'All'], ['tank', 'Tanks'], ['healer', 'Healers'], ['dps', 'DPS'], ['none', 'Undecided']]
    .map(([k, l]) => `<button type="button" aria-checked="${filters.role === k}" role="radio" data-role="${k}">${l}</button>`).join('');
  $('#class-filter').innerHTML = Object.entries(CLASSES).map(([c, def]) =>
    `<button type="button" class="cf ${filters.cls === c ? 'on' : ''}" data-cls="${c}" style="--c:${def.color}" aria-pressed="${filters.cls === c}" data-tip="${def.label}">${icon(`classicon_${c}`, 'sm', def.label)}</button>`).join('');

  const q = filters.q.toLowerCase();
  const rows = members.filter((m) => {
    if (q && !m.name.toLowerCase().includes(q)) return false;
    const r = roleOf(m.main.class, m.main.spec) || 'none';
    if (filters.role !== 'all' && r !== filters.role) return false;
    if (filters.cls && m.main.class !== filters.cls && !m.alts.some((a) => a.class === filters.cls)) return false;
    return true;
  });

  const groups = [['tank', 'Tanks'], ['healer', 'Healers'], ['dps', 'Damage'], ['none', 'Undecided']];
  $('#raid-frames').innerHTML = groups.map(([g, label]) => {
    const list = rows.filter((m) => (roleOf(m.main.class, m.main.spec) || 'none') === g).sort(plateSort);
    if (!list.length) return '';
    return `<section class="raid-group g-${g}">
      <header class="rg-head">${icon(g === 'none' ? 'inv_misc_questionmark' : ROLES[g].icon, 'sm')}<h3>${label}</h3><span class="rg-count">${list.length}</span></header>
      <div class="frames">${list.map(plate).join('')}</div>
    </section>`;
  }).join('');
  $('#roster-empty').hidden = rows.length > 0;
}

// ---------- inline editing ----------
let pop = null; // { id, field, cls, anchor }
const FIELD_LABEL = { name: 'Name', class: 'Class', spec: 'Spec', classspec: 'Class & spec', race: 'Race', assign: 'Raid assignment', prof: 'Professions' };

function openPop(btn) {
  const m = members.find((x) => x.id === btn.dataset.id);
  if (!m) return;
  if (btn.dataset.pen === 'alts') { closePop(); startEdit(m.id); return; }
  pop = { id: m.id, field: btn.dataset.pen, cls: m.main.class, anchor: btn };
  renderPop();
}

function renderPop() {
  const m = members.find((x) => x.id === pop.id);
  const el = $('#editpop');
  let body = '';
  if (pop.field === 'name') {
    body = `<form id="pop-name-form" class="pop-name"><input id="pop-name" value="${esc(m.name)}" maxlength="24" aria-label="Name"><button class="btn primary small">Save</button></form>`;
  } else if (pop.field === 'class') {
    body = `<div class="tile-grid mini pop-classes">${classTiles(m.main.class, 'data-pop-set-class', true)}</div><p class="hint pop-hint">Changing class clears the spec.</p>`;
  } else if (pop.field === 'spec') {
    body = `<div class="tile-row mini">${specTiles(m.main.class, m.main.spec, 'data-pop-spec', true)}</div>`;
  } else if (pop.field === 'classspec') {
    body = `<div class="label">Class</div><div class="tile-grid mini">${classTiles(pop.cls, 'data-pop-class', true)}</div>
      <div class="label">Spec</div><div class="tile-row mini">${specTiles(pop.cls, pop.cls === m.main.class ? m.main.spec : '__none', 'data-pop-spec', true)}</div>`;
  } else if (pop.field === 'race') {
    const allowed = CLASSES[m.main.class].races;
    body = `<div class="tile-row mini">${allowed.map((r) => `<button type="button" class="tile mini pop-opt" data-pop-race="${r}" aria-checked="${m.main.race === r}">${icon(RACES[r].icon, 'xs')}<span>${RACES[r].label}</span></button>`).join('')}
      <button type="button" class="tile mini pop-opt" data-pop-race="" aria-checked="${!m.main.race}">${icon('inv_misc_questionmark', 'xs')}<span>Not set</span></button></div>`;
  } else if (pop.field === 'prof') {
    body = `<div class="pop-profs">${profTiles(m.professions || [], 'data-pop-prof')}</div>`;
  } else if (pop.field === 'assign') {
    body = `<div class="pop-list">${Object.entries(ASSIGNMENTS).map(([k, a]) => `<button type="button" class="pop-row" data-pop-assign="${k}" aria-checked="${m.assignment === k}"><span class="asg asg-${k}">${a.short}</span>${esc(a.label)}</button>`).join('')}
      <button type="button" class="pop-row" data-pop-assign="" aria-checked="${!m.assignment}"><span class="asg none">—</span>No assignment</button></div>`;
  }
  el.innerHTML = `<div class="pop-head"><span class="nm" style="--c:${classColor(m.main.class)}">${esc(m.name)}</span><span class="muted">${FIELD_LABEL[pop.field]}</span><button type="button" class="x" data-pop-close aria-label="Close">✕</button></div>${body}`;
  el.hidden = false;
  const r = pop.anchor.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, r.left + window.scrollX - 24))}px`;
  el.style.top = `${r.bottom + window.scrollY + 6}px`;
  if (pop.field === 'name') { const i = $('#pop-name'); i.focus(); i.select(); }
}

function closePop() {
  pop = null;
  $('#editpop').hidden = true;
}

async function patch(id, changes) {
  const m = members.find((x) => x.id === id);
  if (!m) return;
  try {
    const { member } = await api('POST', { body: { id, ...changes } });
    members = members.map((x) => (x.id === id ? member : x));
    closePop();
    renderAll();
    toast(`Saved ${member.name} — composition updated`);
  } catch (err) {
    toast(err.message, true);
    if (err.status === 404) load();
  }
}

let toastTimer;
function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${isError ? 'error' : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

// ---------- sign-up form ----------
function classTiles(selected, attr, mini = false) {
  return Object.entries(CLASSES).map(([c, def]) => {
    const note = def.races.length === 1 ? `<small>${RACES[def.races[0]].label} only</small>` : '';
    return `<button type="button" role="radio" class="tile class-tile ${mini ? 'mini' : ''}" ${attr}="${c}" aria-checked="${selected === c}" style="--c:${def.color}" ${mini ? `data-tip="${def.label}"` : ''}>
      ${icon(`classicon_${c}`, mini ? 'sm' : 'md', def.label)}${mini ? '' : `<span>${def.label}</span>${note}`}</button>`;
  }).join('');
}

function specTiles(classId, selected, attr, mini = false) {
  const def = CLASSES[classId];
  const tiles = def.specs.map(([sid, label, role, ic]) => `<button type="button" role="radio" class="tile spec-tile ${mini ? 'mini' : ''}" ${attr}="${sid}" aria-checked="${selected === sid}" style="--c:${def.color}">
      ${icon(ic, mini ? 'xs' : 'md', label)}<span>${esc(label)}</span><span class="role-mini r-${role}">${icon(ROLES[role].icon, 'xs', ROLES[role].label)}${mini ? '' : ROLES[role].label}</span></button>`).join('');
  return tiles + `<button type="button" role="radio" class="tile spec-tile undecided ${mini ? 'mini' : ''}" ${attr}="" aria-checked="${!selected}">${icon('inv_misc_questionmark', mini ? 'xs' : 'md', '')}<span>${mini ? 'Any' : 'Not sure yet'}</span></button>`;
}

function profTiles(selected, attr) {
  const tile = ([k, p]) => `<button type="button" class="tile mini prof-tile" ${attr}="${k}" aria-pressed="${selected.includes(k)}">${icon(p.icon, 'xs', p.label)}<span>${p.label}</span></button>`;
  const list = Object.entries(PROFESSIONS);
  return `<div class="prof-group"><span class="pl-label">Primary · up to ${MAX_PRIMARY_PROFS}</span><div class="tile-row mini">${list.filter(([, p]) => p.primary).map(tile).join('')}</div></div>
    <div class="prof-group"><span class="pl-label">Secondary</span><div class="tile-row mini">${list.filter(([, p]) => !p.primary).map(tile).join('')}</div></div>`;
}

// Returns the new list, or null (with a message) if it would exceed the primary cap.
function toggleProf(list, key) {
  if (list.includes(key)) return list.filter((p) => p !== key);
  if (PROFESSIONS[key].primary && list.filter((p) => PROFESSIONS[p].primary).length >= MAX_PRIMARY_PROFS) {
    toast(`Up to ${MAX_PRIMARY_PROFS} primary professions — remove one first.`, true);
    return null;
  }
  return [...list, key];
}

function renderForm() {
  const f = form;
  $('#f-name').value = f.name;
  $('#f-notes').value = f.notes;
  $('#form-title').textContent = f.editingId ? `Editing ${f.name || 'entry'}` : '';
  $('#form-title').hidden = !f.editingId;
  $('#submit-btn').textContent = f.editingId ? 'Save changes' : 'Sign up';
  $('#cancel-edit').hidden = !f.editingId;
  const full = !f.editingId && members.length >= splits.MAX_ROSTER;
  $('#submit-btn').disabled = full;
  if (full) setMsg(`Roster full (${splits.MAX_ROSTER}/${splits.MAX_ROSTER}) - new sign-ups are closed. Editing and removing still work.`, 'error');
  else if ($('#form-msg').dataset.kind === 'error' && $('#form-msg').textContent.startsWith('Roster full')) setMsg('', '');
  $('#delete-btn').hidden = !f.editingId;

  $('#main-class').innerHTML = classTiles(f.main.class, 'data-main-class');
  $('#main-spec-wrap').hidden = !f.main.class;
  $('#main-race-wrap').hidden = !f.main.class;
  if (f.main.class) {
    $('#main-spec').innerHTML = specTiles(f.main.class, f.main.spec, 'data-main-spec');
    const allowed = CLASSES[f.main.class].races;
    $('#race-note').textContent = allowed.length === 1 ? `— Horde ${CLASSES[f.main.class].label}s must be ${RACES[allowed[0]].label}` : '';
    $('#main-race').innerHTML = Object.entries(RACES).map(([r, def]) => {
      const ok = allowed.includes(r);
      return `<button type="button" role="radio" class="tile race-tile" data-main-race="${r}" aria-checked="${f.main.race === r}" ${ok ? '' : `disabled data-tip="${esc(`${CLASSES[f.main.class].label} isn't available to ${def.label}`)}"`}>
        ${icon(def.icon, 'md', def.label)}<span>${def.label}</span>${def.isNew ? '<small class="new">New</small>' : ''}</button>`;
    }).join('');
  }

  $('#alts').innerHTML = f.alts.map((a, i) => `<div class="alt-row" data-alt="${i}">
      <div class="alt-head">
        <span class="alt-rank">Alternate ${i + 1}</span>
        <div class="seg will" role="radiogroup" aria-label="How keen">
          ${Object.entries(WILLINGNESS).map(([k, w]) => `<button type="button" role="radio" class="w-${k}" data-will="${k}" aria-checked="${a.will === k}" data-tip="${esc(w.long)}">${w.label}</button>`).join('')}
        </div>
        <button type="button" class="x" data-remove-alt="${i}" aria-label="Remove alternate">✕</button>
      </div>
      <div class="tile-grid mini" role="radiogroup" aria-label="Alternate class">${classTiles(a.class, 'data-alt-class', true)}</div>
      ${a.class ? `<div class="tile-row mini">${specTiles(a.class, a.spec, 'data-alt-spec', true)}</div>` : '<p class="hint">Pick a class.</p>'}
    </div>`).join('');
  $('#add-alt').hidden = f.alts.length >= MAX_ALTS;
  $('#form-profs').innerHTML = profTiles(f.professions, 'data-form-prof');
  nameHint();
}

function nameHint() {
  const msg = $('#form-msg');
  const clear = () => { if (msg.dataset.kind === 'hint') { msg.textContent = ''; msg.dataset.kind = ''; } };
  if (form.editingId || !form.name.trim()) return clear();
  const hit = members.find((m) => slug(m.name) === slug(form.name));
  if (!hit) return clear();
  msg.dataset.kind = 'hint';
  msg.className = 'form-msg info';
  msg.innerHTML = `${esc(hit.name)} is already on the roster. <button type="button" class="btn ghost small" data-edit="${esc(hit.id)}">Edit ${esc(hit.name)}</button>`;
}

function startEdit(id) {
  const m = members.find((x) => x.id === id);
  if (!m) return;
  form = { editingId: m.id, name: m.name, main: { ...m.main }, alts: m.alts.map((a) => ({ ...a })), professions: [...(m.professions || [])], notes: m.notes || '' };
  $('#form-msg').textContent = '';
  location.hash = '#signup';
  renderForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setMsg(text, kind) {
  const el = $('#form-msg');
  el.textContent = text;
  el.className = `form-msg ${kind}`;
  el.dataset.kind = kind;
}

async function submit(e) {
  e.preventDefault();
  form.name = $('#f-name').value.trim();
  form.notes = $('#f-notes').value.trim();
  if (form.name.length < 2) return setMsg('Enter your character name.', 'error');
  if (!form.main.class) return setMsg('Pick your main class.', 'error');
  const incomplete = form.alts.findIndex((a) => !a.class);
  if (incomplete >= 0) return setMsg(`Alternate ${incomplete + 1} needs a class (or remove it).`, 'error');
  const keyOf = (c) => `${c.class}:${c.spec || ''}`;
  const keys = [keyOf(form.main), ...form.alts.map(keyOf)];
  if (new Set(keys).size !== keys.length) return setMsg('You have the same class/spec listed twice.', 'error');

  if (!form.editingId && members.length >= splits.MAX_ROSTER) return setMsg(`The roster is full (${splits.MAX_ROSTER}/${splits.MAX_ROSTER}). Remove someone before signing up.`, 'error');
  const btn = $('#submit-btn');
  btn.disabled = true;
  try {
    const { member } = await api('POST', {
      body: { id: form.editingId || undefined, name: form.name, main: form.main, alts: form.alts, professions: form.professions, notes: form.notes },
    });
    const wasEdit = Boolean(form.editingId);
    form.editingId = member.id;
    await load();
    setMsg(wasEdit ? `Saved — ${member.name} updated.` : `Lok'tar! ${member.name} is on the roster.`, 'success');
  } catch (err) {
    setMsg(err.message, 'error');
    if (err.status === 404) { form = blankForm(); load(); }
  } finally {
    btn.disabled = false;
  }
}

async function removeEntry() {
  const id = form.editingId;
  const m = members.find((x) => x.id === id);
  if (!m || !confirm(`Remove ${m.name} from the roster?`)) return;
  try {
    await api('DELETE', { query: `?id=${encodeURIComponent(id)}` });
    form = blankForm();
    await load();
    setMsg(`${m.name} removed.`, 'success');
  } catch (err) {
    setMsg(err.message, 'error');
    if (err.status === 404) { form = blankForm(); load(); }
  }
}

// ---------- CSV ----------
function exportCsv() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Name', 'Class', 'Spec', 'Race', 'Role', 'Assignment', 'Alt 1', 'Alt 2', 'Alt 3', 'Professions', 'Notes', 'Updated'];
  const lines = members.map((m) => [
    m.name, CLASSES[m.main.class]?.label, getSpec(m.main.class, m.main.spec)?.label || '', RACES[m.main.race]?.label || '',
    ROLES[roleOf(m.main.class, m.main.spec)]?.label || 'Undecided',
    ASSIGNMENTS[m.assignment]?.label || '',
    ...[0, 1, 2].map((i) => (m.alts[i] ? `${specLabel(m.alts[i])} (${WILLINGNESS[m.alts[i].will].label})` : '')),
    (m.professions || []).map((p) => PROFESSIONS[p]?.label).join(', '),
    m.notes, m.updatedAt?.slice(0, 10),
  ].map(q).join(','));
  const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'horde-roster.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- tabs ----------
function showTab() {
  let tab = location.hash.slice(1);
  if (!['signup', 'comp', 'roster', 'splits'].includes(tab)) tab = 'signup';
  for (const p of document.querySelectorAll('.tab-panel')) p.hidden = p.id !== `tab-${tab}`;
  for (const a of document.querySelectorAll('.tabs a')) a.setAttribute('aria-selected', a.dataset.tab === tab);
}

function renderAll() {
  $('#tooltip').hidden = true;
  const A = analyse();
  renderHeader(A);
  renderComp();
  renderRoster();
  renderForm();
  splits.render();
  showTab();
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  if (pop && !e.target.closest('#editpop, .pen, .nm-btn')) closePop();
  const t = e.target.closest('button, [data-edit]');
  if (!t) return;
  const d = t.dataset;

  // Inline edit popover
  if (d.pen) return openPop(t);
  if ('popClose' in d) return closePop();
  if (pop) {
    if (d.popClass) { pop.cls = d.popClass; return renderPop(); }
    if (d.popSetClass) {
      const m = members.find((x) => x.id === pop.id);
      if (d.popSetClass === m.main.class) return closePop();
      const allowed = CLASSES[d.popSetClass].races;
      const race = allowed.includes(m.main.race) ? m.main.race : allowed.length === 1 ? allowed[0] : null;
      return patch(pop.id, { main: { class: d.popSetClass, spec: null, race } });
    }
    if ('popSpec' in d) {
      const m = members.find((x) => x.id === pop.id);
      const allowed = CLASSES[pop.cls].races;
      const race = allowed.includes(m.main.race) ? m.main.race : allowed.length === 1 ? allowed[0] : null;
      return patch(pop.id, { main: { class: pop.cls, spec: d.popSpec || null, race } });
    }
    if ('popRace' in d) return patch(pop.id, { main: { race: d.popRace || null } });
    if ('popAssign' in d) return patch(pop.id, { assignment: d.popAssign || null });
    if (d.popProf) {
      const m = members.find((x) => x.id === pop.id);
      const next = toggleProf(m.professions || [], d.popProf);
      if (next) return patch(pop.id, { professions: next });
      return;
    }
  }

  if (d.mainClass) {
    const allowed = CLASSES[d.mainClass].races;
    form.main = { class: d.mainClass, spec: form.main.class === d.mainClass ? form.main.spec : null, race: allowed.includes(form.main.race) ? form.main.race : allowed.length === 1 ? allowed[0] : null };
    return renderForm();
  }
  if ('mainSpec' in d) { form.main.spec = d.mainSpec || null; return renderForm(); }
  if (d.mainRace) { form.main.race = form.main.race === d.mainRace ? null : d.mainRace; return renderForm(); }

  const altRow = t.closest('[data-alt]');
  if (altRow) {
    const a = form.alts[Number(altRow.dataset.alt)];
    if (d.altClass) { if (a.class !== d.altClass) { a.class = d.altClass; a.spec = null; } return renderForm(); }
    if ('altSpec' in d) { a.spec = d.altSpec || null; return renderForm(); }
    if (d.will) { a.will = d.will; return renderForm(); }
    if ('removeAlt' in d) { form.alts.splice(Number(d.removeAlt), 1); return renderForm(); }
  }
  if (d.formProf) { const next = toggleProf(form.professions, d.formProf); if (next) { form.professions = next; renderForm(); } return; }
  if (t.id === 'add-alt' && form.alts.length < MAX_ALTS) { form.alts.push({ class: null, spec: null, will: 'happy' }); return renderForm(); }
  if (t.id === 'cancel-edit') { form = blankForm(); $('#form-msg').textContent = ''; return renderForm(); }
  if (t.id === 'delete-btn') return removeEntry();
  if (d.edit) return startEdit(d.edit);

  if (d.size) { raidSize = d.size; return renderComp(); }
  if (d.role) { filters.role = d.role; return renderRoster(); }
  if (d.cls) { filters.cls = filters.cls === d.cls ? null : d.cls; return renderRoster(); }
  if (t.id === 'export-csv') return exportCsv();
});

$('#signup-form').addEventListener('submit', submit);
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'pop-name-form') return;
  e.preventDefault();
  const name = $('#pop-name').value.trim();
  if (name) patch(pop.id, { name });
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop) closePop(); });
$('#f-name').addEventListener('input', (e) => {
  form.name = e.target.value;
  nameHint();
});
$('#f-notes').addEventListener('input', (e) => { form.notes = e.target.value; });
$('#search').addEventListener('input', (e) => { filters.q = e.target.value; renderRoster(); });
let lastTab = location.hash.slice(1);
window.addEventListener('hashchange', () => {
  const next = location.hash.slice(1);
  if (lastTab === 'splits' && next !== 'splits' && !splits.confirmDiscard()) { location.hash = '#splits'; return; }
  lastTab = next;
  closePop(); showTab();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });

// Tooltips
const tip = $('#tooltip');
document.addEventListener('mouseover', (e) => {
  const el = e.target.closest('[data-tip]');
  if (!el) { tip.hidden = true; return; }
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  const r = el.getBoundingClientRect();
  const w = tip.offsetWidth;
  tip.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  tip.style.top = `${r.top + window.scrollY - tip.offsetHeight - 8}px`;
});

load();
