// Build Raid: one workspace of 10/20/40 compositions, a shared Unassigned pool, saved as one setup.
import { compareMembersByRoleClass, memberRole } from './member-sort.js';
import { ROLES, roleOf, iconUrl } from './data.js';
import { attachSplitDrag, moveSplitMember } from '/split-drag.js';
import { partyGroups } from './raid-parties.js';

const MAX_ROSTER = 100;
const MAX_TEAMS = 10;
const SIZES = [10, 20, 40];
const PICK_ROLES = ['tank', 'healer', 'dps'];
const SCOPE_KEY = `raid-roster-scope:${window.guildContext?.id || 'legacy'}`;
const $ = (s) => document.querySelector(s);

export function createSplits({ getMembers, api, toast, esc, nameChip, onScopeChange, teamComposition }) {
  let setups = [];
  let storage = '';
  let loadError = '';
  let loaded = false;
  let draft = null;
  let baseline = '';
  let saveError = '';
  let notice = '';
  let saving = false;
  let poolQ = '';
  const expandedComposition = new Map();
  let scope = readScope();

  function readScope() {
    try { return JSON.parse(localStorage.getItem(SCOPE_KEY)) || { setupId: '', teamId: '' }; } catch { return { setupId: '', teamId: '' }; }
  }
  function writeScope() { try { localStorage.setItem(SCOPE_KEY, JSON.stringify(scope)); } catch { /* ignore */ } }

  const uid = () => `t-${Math.random().toString(36).slice(2, 9)}`;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const snap = (d) => JSON.stringify({ name: d.name, mainTeamId: d.mainTeamId,
    teams: d.teams.map((t) => ({ name: t.name, size: t.size, memberIds: t.memberIds, parties: t.parties })),
    memberRoles: Object.fromEntries(Object.entries(d.memberRoles || {}).sort(([a], [b]) => a.localeCompare(b))) });
  const readOnly = () => storage === 'missing' || !window.guildEditing;
  const locked = () => readOnly() || saving || !loaded || Boolean(loadError);
  const memberMap = () => new Map(getMembers().map((m) => [m.id, m]));
  const isDirty = () => Boolean(draft) && snap(draft) !== baseline;
  const findTeam = (id) => draft.teams.find((t) => t.id === id);

  function uniqueName(base) {
    const taken = new Set(setups.map((s) => s.name.toLowerCase().replace(/\s+/g, ' ')));
    let name = base, n = 1;
    while (taken.has(name.toLowerCase())) name = `${base} ${++n}`;
    return name;
  }
  function blankDraft() {
    poolQ = '';
    const team = { id: uid(), name: 'Raid 1', size: 10, memberIds: [], parties: [[], []] };
    draft = { name: uniqueName('Raid build'), mainTeamId: team.id, memberRoles: {}, teams: [team] };
    baseline = snap(draft);
    saveError = ''; notice = '';
  }
  function draftFrom(s) {
    draft = clone({ id: s.id, name: s.name, teams: s.teams.map((t) => ({ ...t, parties: partyGroups(t) })),
      mainTeamId: s.mainTeamId || s.teams[0]?.id, memberRoles: s.memberRoles || {} });
    baseline = snap(draft);
    saveError = ''; notice = '';
    pruneDraft(false);
  }
  // Restore the explicitly saved selection, otherwise start blank.
  function discardDraft() {
    const s = setups.find((x) => x.id === draft?.id);
    if (s) draftFrom(s); else blankDraft();
  }
  blankDraft();

  function confirmDiscard() {
    if (!isDirty()) return true;
    if (!confirm('You have unsaved changes to this build. Discard them?')) return false;
    discardDraft();
    render();
    return true;
  }

  // ---------- scope (composition) ----------
  function currentScope() {
    const s = setups.find((x) => x.id === scope.setupId);
    const t = s?.teams.find((x) => x.id === scope.teamId);
    return s && t ? { setup: s, team: t } : null;
  }
  function scopeMembers() {
    const sc = currentScope();
    if (!sc) return getMembers();
    const ids = new Set(sc.team.memberIds);
    return getMembers().filter((m) => ids.has(m.id)).map((m) => ({ ...m, raidRole: sc.setup.memberRoles?.[m.id] }));
  }
  function scopeTeam() { return currentScope()?.team || null; }

  function renderScopeBar() {
    const el = $('#comp-scope');
    if (!el) return;
    const sc = currentScope();
    if (loaded && !loadError && !sc && scope.teamId) { scope = { setupId: '', teamId: '' }; writeScope(); }
    const setupOpts = `<option value="">Whole roster</option>${setups.map((s) => `<option value="${esc(s.id)}" ${s.id === scope.setupId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}`;
    const cur = setups.find((s) => s.id === scope.setupId);
    const teamOpts = cur ? cur.teams.map((t) => `<option value="${esc(t.id)}" ${t.id === scope.teamId ? 'selected' : ''}>${esc(t.name)} (${t.size})</option>`).join('') : '';
    el.innerHTML = `<select id="scope-setup" aria-label="Composition scope setup">${setupOpts}</select>
      <select id="scope-team" aria-label="Composition scope team" ${cur ? '' : 'hidden'}>${teamOpts}</select>`;
    const list = scopeMembers();
    $('#scope-note').textContent = sc ? `Scoped to ${sc.team.name}: ${list.length} of ${getMembers().length} members` : '';
  }

  function applyScope(setupId, teamId) {
    const s = setups.find((x) => x.id === setupId);
    scope = s ? { setupId, teamId: teamId || s.mainTeamId || s.teams[0]?.id || '' } : { setupId: '', teamId: '' };
    writeScope();
    onScopeChange(scopeTeam());
  }

  // ---------- load ----------
  async function load() {
    const firstLoad = !loaded;
    try {
      const data = await api('GET', { path: '/splits' });
      setups = data.setups || [];
      storage = data.storage || '';
      loadError = '';
    } catch (e) {
      loadError = e.message || 'Could not load raid setups';
    }
    loaded = true;
    if (!loadError && !isDirty() && !saving) {
      const s = setups.find((x) => x.id === (firstLoad ? scope.setupId : draft?.id));
      if (s) draftFrom(s);
      else if (firstLoad) blankDraft();
      else if (draft?.id) {
        delete draft.id;
        notice = 'This saved build was removed. Your layout is still here; save it as a new build.';
      }
    } else if (draft && isDirty()) pruneDraft(true);
    render();
    renderScopeBar();
    onScopeChange(scopeTeam(), true);
  }

  function pruneDraft(silent) {
    if (!getMembers().length && !loaded) return;
    const ids = memberMap();
    const removed = new Set();
    for (const t of draft.teams) {
      t.memberIds = t.memberIds.filter((id) => { if (ids.has(id)) return true; removed.add(id); return false; });
      t.parties = partyGroups(t);
    }
    for (const id of Object.keys(draft.memberRoles)) {
      if (!ids.has(id)) { delete draft.memberRoles[id]; removed.add(id); }
    }
    if (removed.size) notice = `${removed.size} player${removed.size === 1 ? ' was' : 's were'} removed from the roster and dropped from this build. Save to apply.`;
  }

  // ---------- draft ops ----------
  function startNew() {
    if (isDirty() && !confirm('Start a new build? Unsaved changes will be discarded.')) return;
    blankDraft();
    render();
  }
  function openSetup(id) {
    const s = setups.find((x) => x.id === id);
    if (!s) return;
    if (isDirty() && !confirm('Open this composition? Unsaved changes to the current build will be discarded.')) return;
    draftFrom(s);
    render();
  }
  function assign(memberId, teamId, role, partyIndex) {
    if (!draft || locked()) return false;
    const member = memberMap().get(memberId);
    if (!member) { toast('That player no longer exists. Refresh the roster.', true); return false; }
    const error = moveSplitMember(draft, memberId, teamId, role, roleOf(member.main?.class, member.main?.spec), partyIndex);
    if (error) { toast(error, true); return false; }
    render();
    return true;
  }
  function addTeam() {
    if (draft.teams.length >= MAX_TEAMS) return toast(`Up to ${MAX_TEAMS} compositions per build.`, true);
    let n = draft.teams.length + 1;
    while (draft.teams.some((t) => t.name === `Raid ${n}`)) n++;
    const team = { id: uid(), name: `Raid ${n}`, size: 10, memberIds: [], parties: [[], []] };
    draft.teams.push(team);
    render();
    document.querySelector(`[data-team-id="${CSS.escape(team.id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function setSize(teamId, size) {
    const t = findTeam(teamId);
    if (!t || t.size === size || !SIZES.includes(size)) return;
    if (t.memberIds.length > size) { toast(`${t.name} has ${t.memberIds.length} players. Unassign some before shrinking to ${size}.`, true); return render(); }
    t.parties = partyGroups(t, size);
    t.size = size;
    render();
  }
  function removeTeam(teamId) {
    if (draft.teams.length === 1) return toast('Keep at least one composition.', true);
    const t = findTeam(teamId);
    if (t.memberIds.length && !confirm(`Remove ${t.name}? Its ${t.memberIds.length} players become unassigned.`)) return;
    draft.teams = draft.teams.filter((x) => x.id !== teamId);
    if (draft.mainTeamId === teamId) draft.mainTeamId = draft.teams[0].id;
    render();
  }

  async function save() {
    if (!draft || locked()) return;
    saveError = '';
    if (!draft.name.trim() || draft.teams.some((t) => !t.name.trim())) {
      saveError = 'Give the build and each composition a name before saving.';
      render();
      return;
    }
    saving = true; render();
    try {
      const body = { name: draft.name.trim(), mainTeamId: draft.mainTeamId, memberRoles: draft.memberRoles,
        teams: draft.teams.map((t) => ({ id: t.id, name: t.name.trim(), size: t.size, memberIds: t.memberIds, parties: t.parties })) };
      if (draft.id) body.id = draft.id;
      const { setup } = await api('POST', { path: '/splits', body });
      const i = setups.findIndex((s) => s.id === setup.id);
      if (i >= 0) setups[i] = setup; else setups.push(setup);
      draftFrom(setup);
      toast(`Saved ${setup.name}`);
      scope = { setupId: setup.id, teamId: setup.mainTeamId };
      writeScope();
      renderScopeBar();
      onScopeChange(scopeTeam());
    } catch (e) {
      saveError = e.message;
    } finally {
      saving = false; render();
    }
  }

  async function remove(id) {
    const s = setups.find((x) => x.id === id);
    if (!s || readOnly() || !confirm(`Delete saved composition "${s.name}"? This cannot be undone.`)) return false;
    try {
      await api('DELETE', { path: '/splits', query: `?id=${encodeURIComponent(id)}` });
      setups = setups.filter((x) => x.id !== id);
      if (draft?.id === id) blankDraft();
      if (scope.setupId === id) applyScope('', '');
      toast(`Deleted ${s.name}`);
      saveError = '';
      render(); renderScopeBar();
      return true;
    } catch (e) {
      saveError = e.message;
      toast(e.message, true);
      if (e.status === 404) load();
      render();
      return false;
    }
  }

  // ---------- render ----------
  const withRole = (m) => ({ ...m, raidRole: draft.memberRoles[m.id] });

  function memberRow(m) {
    const role = memberRole(m);
    const info = ROLES[role];
    const off = locked();
    const icon = info
      ? `<img class="sp-role-icon" src="${iconUrl(info.icon)}" alt="" width="18" height="18">`
      : '<span class="sp-role-icon sp-role-unknown" aria-hidden="true">?</span>';
    return `<li class="sp-member" data-sp-member="${esc(m.id)}" data-role="${role || 'none'}" draggable="${off ? 'false' : 'true'}">
      <button type="button" class="sp-grip" data-sp-drag-handle ${off ? 'disabled' : ''} aria-label="Move ${esc(m.name)}. Press Space or Enter to pick up." title="Drag to move">⠿</button>
      ${icon}<span class="sp-member-name" title="${esc(m.name)}">${nameChip(m)}</span><span class="sp-role-text">${info ? info.label : 'Undecided'}</span>
      <button type="button" class="sp-edit" data-sp-edit-role="${esc(m.id)}" ${off ? 'disabled' : ''} aria-label="Edit raid role for ${esc(m.name)} (currently ${info ? info.label : 'undecided'})" title="Edit role">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M11.6 1.2a1.2 1.2 0 0 1 1.7 0l1.5 1.5a1.2 1.2 0 0 1 0 1.7L5.4 13.8l-3.9.7.7-3.9z"/></svg></button>
    </li>`;
  }

  function partyHtml(list, team) {
    const mm = new Map(list.map((m) => [m.id, m]));
    return `<div class="sp-party-grid">${team.parties.map((group, i) => {
      const players = group.map((id) => mm.get(id)).filter(Boolean).sort(compareMembersByRoleClass);
      return `<section class="sp-party ${players.length >= 5 ? 'full' : ''}" data-sp-drop-team="${esc(team.id)}" data-sp-drop-party="${i}" aria-label="${esc(team.name)} party ${i + 1}">
        <h4 class="sp-party-heading"><span>Party ${i + 1}</span><span>${players.length}/5</span></h4>
        <ul class="sp-members">${players.map(memberRow).join('')}${Array.from({ length: 5 - players.length }, () => '<li class="sp-empty-slot" aria-hidden="true"></li>').join('')}</ul>
      </section>`;
    }).join('')}</div>`;
  }

  function poolList() {
    const ids = new Set(draft.teams.flatMap((t) => t.memberIds));
    const all = getMembers().filter((m) => !ids.has(m.id));
    const q = poolQ.trim().toLowerCase();
    const shown = all.filter((m) => !q || m.name.toLowerCase().includes(q)).map(withRole).sort(compareMembersByRoleClass);
    if (!all.length) return { count: 0, html: `<p class="sp-note">${getMembers().length ? 'Everyone is seated. Drop a player here to unassign.' : 'No sign-ups yet.'}</p>` };
    if (!shown.length) return { count: all.length, html: `<p class="sp-note">No unassigned player matches “${esc(poolQ.trim())}”.</p>` };
    const label = { tank: 'Tanks', healer: 'Healers', dps: 'DPS', none: 'Undecided' };
    return { count: all.length, html: ['tank', 'healer', 'dps', 'none'].map((r) => {
      const g = shown.filter((m) => (memberRole(m) || 'none') === r);
      return g.length ? `<div class="sp-pool-group"><h4>${label[r]} <span>${g.length}</span></h4><ul class="sp-members">${g.map(memberRow).join('')}</ul></div>` : '';
    }).join('') };
  }

  function teamHtml(t, mm, multi) {
    const list = t.memberIds.map((id) => mm.get(id)).filter(Boolean).map(withRole).sort(compareMembersByRoleClass);
    const off = locked();
    const isMain = draft.mainTeamId === t.id;
    return `<section class="sp-team ${t.memberIds.length >= t.size ? 'full' : ''}" data-team-id="${esc(t.id)}" data-sp-drop-team="${esc(t.id)}">
      <header class="sp-team-head">
        <input class="sp-team-name" data-sp-team-name="${esc(t.id)}" maxlength="40" value="${esc(t.name)}" aria-label="Composition name" ${off ? 'disabled' : ''}>
        <div class="seg sp-size" role="radiogroup" aria-label="${esc(t.name)} size">${SIZES.map((s) => `<button type="button" role="radio" aria-checked="${s === t.size}" data-sp-size-team="${esc(t.id)}" data-size="${s}" ${off ? 'disabled' : ''}>${s}</button>`).join('')}</div>
        <span class="sp-team-count" data-sp-count>${t.memberIds.length}/${t.size}</span>
        ${multi && isMain ? '<span class="sp-main-badge">Main</span>' : ''}
        <details class="sp-menu"><summary aria-label="Options for ${esc(t.name)}" title="Options">⋯</summary>
          <div class="sp-menu-pop">
            ${multi && !isMain ? `<button type="button" data-sp-main-team="${esc(t.id)}" ${off ? 'disabled' : ''}>Set as main raid</button>` : ''}
            <button type="button" class="danger" data-sp-remove-team="${esc(t.id)}" ${off || !multi ? 'disabled' : ''}>Remove composition</button>
          </div></details>
      </header>
      ${teamComposition(list, t)}
      ${partyHtml(list, t)}
    </section>`;
  }

  function render() {
    drag.cancel();
    const root = $('#splits-root');
    if (!root) return;
    const active = document.activeElement;
    const refocus = active && root.contains(active) ? (active.dataset.spEditRole ? `[data-sp-edit-role="${CSS.escape(active.dataset.spEditRole)}"]` : active.id ? `#${CSS.escape(active.id)}` : '') : '';
    root.querySelectorAll('[data-comp-details]').forEach((d) => {
      expandedComposition.set(`${d.closest('[data-team-id]').dataset.teamId}:${d.dataset.compDetails}`, d.open);
    });
    const off = locked();
    const mm = memberMap();
    const multi = draft.teams.length > 1;
    const pool = poolList();
    const assigned = draft.teams.reduce((n, t) => n + t.memberIds.length, 0);
    let html = '<div class="sp-banners">';
    if (storage === 'missing') html += '<p class="sp-banner warn" id="splits-readonly" role="status">Read-only: storage is not connected, so builds cannot be saved.</p>';
    else if (!window.guildEditing) html += '<p class="sp-banner" role="status">Viewing raid plans. Enable Edit mode to move players or change this build.</p>';
    if (loadError) html += `<div class="sp-banner bad" id="splits-error" role="alert">Couldn't load saved compositions: ${esc(loadError)} <button type="button" class="btn small" data-sp-retry>Retry</button></div>`;
    html += '</div>';
    html += `<div class="panel sp-editor" id="split-editor">
      <div class="sp-bar">
        <h2>Build Raid</h2>
        <label class="sr-only" for="split-name">Build name</label>
        <input id="split-name" class="sp-build-name" maxlength="60" value="${esc(draft.name)}" ${off ? 'disabled' : ''} title="Build name. All compositions below are saved together under this name.">
        <span class="sp-status" id="split-status" role="status"></span>
        <span class="sp-bar-actions">
          <button type="button" class="btn small ghost" data-sp-open-list ${loaded && !loadError ? '' : 'disabled'}>Open composition${setups.length ? ` (${setups.length})` : ''}</button>
          <button type="button" class="btn small ghost" data-sp-new ${off ? 'disabled' : ''}>New build</button>
          <button type="button" class="btn small primary" id="split-save" data-sp-save ${off ? 'disabled' : ''}>${saving ? 'Saving…' : 'Save build'}</button>
        </span>
      </div>
      ${notice ? `<p class="sp-banner warn" id="split-notice">${esc(notice)}</p>` : ''}
      ${saveError ? `<p class="sp-banner bad" id="split-save-error" role="alert">${esc(saveError)}</p>` : ''}
      <p id="split-drag-status" class="sr-only" aria-live="polite"></p>
      <div class="sp-workspace">
        <div class="sp-main">
          <p class="sp-totals" id="split-totals">${draft.teams.length} of ${MAX_TEAMS} compositions · ${assigned} seated · ${pool.count} unassigned</p>
          <div class="sp-teams" id="split-teams">${draft.teams.map((t) => teamHtml(t, mm, multi)).join('')}</div>
          <button type="button" class="btn ghost sp-add" data-sp-add-team ${off || draft.teams.length >= MAX_TEAMS ? 'disabled' : ''}>+ New composition</button>
        </div>
        <aside class="sp-pool" id="split-pool" data-sp-drop-team="" aria-label="Unassigned players">
          <div class="sp-pool-head"><h3>Unassigned</h3><span class="sp-pool-count" id="sp-pool-count">${pool.count}</span></div>
          <input type="search" id="sp-pool-search" value="${esc(poolQ)}" placeholder="Filter players" aria-label="Filter unassigned players" autocomplete="off">
          <div id="sp-pool-list" class="sp-pool-list">${pool.html}</div>
        </aside>
      </div>
    </div>`;
    root.innerHTML = html;
    root.querySelectorAll('[data-comp-details]').forEach((d) => {
      d.open = expandedComposition.get(`${d.closest('[data-team-id]').dataset.teamId}:${d.dataset.compDetails}`) || false;
    });
    refreshDirty();
    if (refocus) root.querySelector(refocus)?.focus({ preventScroll: true });
  }

  function refreshDirty() {
    const s = $('#split-status');
    if (!s) return;
    const dirty = isDirty();
    s.textContent = saving ? 'Saving…' : dirty ? 'Unsaved changes' : draft.id ? 'Saved' : '';
    s.className = `sp-status ${dirty ? 'dirty' : draft.id ? 'saved' : ''}`;
  }

  // ---------- dialogs ----------
  function makeDialog(id) {
    const d = document.createElement('dialog');
    d.id = id; d.className = 'sp-dialog';
    document.body.append(d);
    return d;
  }
  const roleDialog = makeDialog('sp-role-dialog');
  const openDialog = makeDialog('sp-open-dialog');
  roleDialog.setAttribute('aria-labelledby', 'sp-role-title');
  openDialog.setAttribute('aria-labelledby', 'sp-open-title');
  let roleTarget = null;

  function inBuild(id) { return draft.teams.some((t) => t.memberIds.includes(id)); }

  function showRoleEditor(id) {
    const m = memberMap().get(id);
    if (!m || !draft || locked()) return;
    roleTarget = id;
    const cur = memberRole(withRole(m));
    roleDialog.innerHTML = `<h3 id="sp-role-title">Raid role</h3>
      <p class="sp-dialog-sub">${nameChip(m)} · this build only. Their sign-up role is unchanged.</p>
      <fieldset class="sp-role-choices"><legend class="sr-only">Raid role for ${esc(m.name)}</legend>
        ${PICK_ROLES.map((r) => `<label class="sp-role-choice" style="--rc:${ROLES[r].color}"><input type="radio" name="sp-role" value="${r}" ${cur === r ? 'checked' : ''}>
          <img src="${iconUrl(ROLES[r].icon)}" alt="" width="20" height="20"><span>${ROLES[r].label}</span></label>`).join('')}
      </fieldset>
      <div class="sp-dialog-actions">
        ${inBuild(id) ? '<button type="button" class="btn small danger" data-role-unassign>Unassign</button>' : ''}
        <span class="sp-spacer"></span>
        <button type="button" class="btn small ghost" data-role-cancel>Cancel</button>
        <button type="button" class="btn small primary" data-role-apply ${cur ? '' : 'disabled'}>Apply</button>
      </div>`;
    roleDialog.showModal();
    (roleDialog.querySelector('input:checked') || roleDialog.querySelector('input'))?.focus();
  }
  roleDialog.addEventListener('change', (e) => {
    if (e.target.name === 'sp-role') roleDialog.querySelector('[data-role-apply]').disabled = false;
  });
  roleDialog.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const id = roleTarget;
    if ('roleCancel' in b.dataset) { roleDialog.close(); return; }
    if (!id || locked()) return;
    if ('roleApply' in b.dataset) {
      const v = roleDialog.querySelector('input[name="sp-role"]:checked')?.value;
      const member = memberMap().get(id);
      if (!member) { roleDialog.close(); toast('That player was removed. Refresh the roster.', true); return; }
      if (!v || !PICK_ROLES.includes(v) || !Object.hasOwn(ROLES, v)) return;
      if (v === roleOf(member.main?.class, member.main?.spec)) delete draft.memberRoles[id];
      else draft.memberRoles[id] = v;
      roleDialog.close();
      render();
      document.querySelector(`[data-sp-edit-role="${CSS.escape(id)}"]`)?.focus();
    } else if ('roleUnassign' in b.dataset) {
      roleDialog.close();
      if (assign(id, '')) document.querySelector(`#sp-pool-list [data-sp-edit-role="${CSS.escape(id)}"]`)?.focus();
    }
  });
  roleDialog.addEventListener('close', () => {
    const id = roleTarget;
    roleTarget = null;
    if (id) document.querySelector(`[data-sp-edit-role="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  });
  openDialog.addEventListener('close', () => { document.querySelector('[data-sp-open-list]')?.focus(); });

  function showOpenList() {
    const rows = setups.length ? `<ul class="sp-saved">${setups.map((s) => {
      const n = s.teams.reduce((a, t) => a + t.memberIds.length, 0);
      return `<li><div><b>${esc(s.name)}</b><span class="muted"> ${s.teams.map((t) => t.size).join(' + ')} · ${n} seated</span>${s.id === draft.id ? ' <span class="sp-main-badge">Open</span>' : ''}</div>
        <span class="sp-bar-actions"><button type="button" class="btn small" data-open-id="${esc(s.id)}">Open</button>
        <button type="button" class="btn small danger" data-delete-id="${esc(s.id)}" ${readOnly() ? 'disabled' : ''}>Delete</button></span></li>`;
    }).join('')}</ul>` : '<p class="sp-note">Nothing saved yet. Save a build and it will appear here.</p>';
    openDialog.innerHTML = `<h3 id="sp-open-title">Open composition</h3>${rows}
      <div class="sp-dialog-actions"><span class="sp-spacer"></span><button type="button" class="btn small ghost" data-open-close>Close</button></div>`;
    if (!openDialog.open) openDialog.showModal();
    openDialog.querySelector('button')?.focus();
  }
  openDialog.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if ('openClose' in b.dataset) openDialog.close();
    else if (b.dataset.openId) {
      const s = setups.find((x) => x.id === b.dataset.openId);
      if (!s) return;
      if (isDirty() && !confirm('Open this composition? Unsaved changes to the current build will be discarded.')) return;
      openDialog.close();
      draftFrom(s);
      render();
    } else if (b.dataset.deleteId) {
      if (await remove(b.dataset.deleteId)) showOpenList();
    }
  });

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    document.querySelectorAll('#splits-root .sp-menu[open]').forEach((m) => { if (!m.contains(e.target)) m.open = false; });
    const b = e.target.closest('button');
    if (!b || !b.closest('#splits-root')) return;
    if (b.disabled || saving) return;
    const d = b.dataset;
    if ('spRetry' in d) { loaded = false; loadError = ''; render(); load(); }
    else if ('spSave' in d) save();
    else if ('spNew' in d) startNew();
    else if ('spOpenList' in d) showOpenList();
    else if ('spAddTeam' in d) addTeam();
    else if (d.spRemoveTeam) removeTeam(d.spRemoveTeam);
    else if (d.spSizeTeam) setSize(d.spSizeTeam, Number(d.size));
    else if (d.spEditRole) showRoleEditor(d.spEditRole);
    else if (d.spMainTeam && !readOnly()) { draft.mainTeamId = d.spMainTeam; render(); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'scope-setup') { applyScope(t.value, ''); renderScopeBar(); return; }
    if (t.id === 'scope-team') { applyScope(scope.setupId, t.value); renderScopeBar(); }
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'sp-pool-search') {
      poolQ = t.value;
      const p = poolList();
      $('#sp-pool-list').innerHTML = p.html;
      $('#sp-pool-count').textContent = p.count;
      return;
    }
    if (!draft || !t.closest?.('#splits-root')) return;
    if (t.id === 'split-name') draft.name = t.value;
    else if (t.dataset.spTeamName) { const tm = findTeam(t.dataset.spTeamName); if (tm) tm.name = t.value; }
    else return;
    refreshDirty();
  });
  window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('guild-edit-mode-changed', () => {
    if (roleDialog.open) roleDialog.close();
    if (openDialog.open) openDialog.close();
    if (draft) render();
  });

  const drag = attachSplitDrag({
    root: $('#splits-root'),
    canEdit: () => Boolean(draft) && !locked(),
    onBlocked: (message) => toast(message, true),
    canDrop: (id, teamId, partyIndex) => {
      const team = teamId ? findTeam(teamId) : null;
      return !teamId || Boolean(team && (team.memberIds.includes(id) || team.memberIds.length < team.size) &&
        (partyIndex === undefined || (team.parties[partyIndex] && (team.parties[partyIndex].includes(id) || team.parties[partyIndex].length < 5))));
    },
    onMove: (id, teamId, role, partyIndex) => {
      const member = memberMap().get(id);
      if (!assign(id, teamId, role, partyIndex)) return;
      const status = $('#split-drag-status');
      const team = teamId ? findTeam(teamId) : null;
      if (status && member) status.textContent = `${member.name}: ${team ? `${team.name}, Party ${team.parties.findIndex((g) => g.includes(id)) + 1}` : 'Unassigned'}.`;
    },
  });

  return { load, render, renderScopeBar, scopeMembers, scopeTeam, isDirty, confirmDiscard, MAX_ROSTER };
}
