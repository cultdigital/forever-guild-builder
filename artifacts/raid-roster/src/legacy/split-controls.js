// Split setups: saved raid team plans + composition scope. Imperative, no framework.
import { compareMembersByRoleClass, memberRole } from './member-sort.js';
import { ROLES, roleOf, iconUrl } from './data.js';

const MAX_ROSTER = 100;
const MAX_TEAMS = 10;
const SIZES = [10, 20, 40];
const PRESETS = ['2x10', '2x20', '5x20', '10x10', '2x40'];
const SCOPE_KEY = `raid-roster-scope:${window.guildContext?.id || 'legacy'}`;
const $ = (s) => document.querySelector(s);

export function createSplits({ getMembers, api, toast, esc, nameChip, onScopeChange }) {
  let setups = [];
  let storage = '';
  let loadError = '';
  let loaded = false;
  let draft = null;        // working copy { id?, name, teams, memberRoles }
  let baseline = '';       // JSON of last saved/opened state
  let saveError = '';
  let notice = '';
  let saving = false;
  let scope = readScope();

  function readScope() {
    try { return JSON.parse(localStorage.getItem(SCOPE_KEY)) || { setupId: '', teamId: '' }; } catch { return { setupId: '', teamId: '' }; }
  }
  function writeScope() { try { localStorage.setItem(SCOPE_KEY, JSON.stringify(scope)); } catch { /* ignore */ } }

  const uid = () => `t-${Math.random().toString(36).slice(2, 9)}`;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const snap = (d) => JSON.stringify({ name: d.name, teams: d.teams.map((t) => ({ name: t.name, size: t.size, memberIds: t.memberIds })),
    memberRoles: Object.fromEntries(Object.entries(d.memberRoles || {}).sort(([a], [b]) => a.localeCompare(b))) });
  const readOnly = () => storage === 'missing';
  const memberMap = () => new Map(getMembers().map((m) => [m.id, m]));
  const isDirty = () => Boolean(draft) && snap(draft) !== baseline;
  const capacity = (d) => d.teams.reduce((n, t) => n + t.size, 0);

  function confirmDiscard() {
    if (!isDirty()) return true;
    if (!confirm('You have unsaved split changes. Discard them?')) return false;
    draft = null;
    baseline = '';
    saveError = '';
    notice = '';
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
    // Do not erase a saved selection while its setups are still being fetched.
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
    scope = s ? { setupId, teamId: teamId || s.teams[0]?.id || '' } : { setupId: '', teamId: '' };
    writeScope();
    onScopeChange(scopeTeam());
  }

  // ---------- load ----------
  async function load() {
    try {
      const data = await api('GET', { path: '/splits' });
      setups = data.setups || [];
      storage = data.storage || '';
      loadError = '';
    } catch (e) {
      loadError = e.message || 'Could not load split setups';
    }
    loaded = true;
    if (draft) pruneDraft(true);
    render();
    renderScopeBar();
    onScopeChange(scopeTeam(), true);
  }

  function pruneDraft(silent) {
    const ids = memberMap();
    const removed = new Set();
    for (const t of draft.teams) {
      const keep = t.memberIds.filter((id) => { if (ids.has(id)) return true; removed.add(id); return false; });
      t.memberIds = keep;
    }
    for (const id of Object.keys(draft.memberRoles)) {
      if (!ids.has(id)) { delete draft.memberRoles[id]; removed.add(id); }
    }
    const dropped = removed.size;
    if (dropped && !silent) notice = `${dropped} removed member${dropped === 1 ? ' was' : 's were'} dropped from this setup. Save to apply.`;
    else if (dropped) notice = `${dropped} member${dropped === 1 ? ' was' : 's were'} removed from the roster and dropped from this draft. Save to apply.`;
  }

  // ---------- draft ops ----------
  function openSetup(id) {
    if (!confirmDiscard()) return;
    const s = setups.find((x) => x.id === id);
    if (!s) return;
    draft = clone({ id: s.id, name: s.name, teams: s.teams, memberRoles: s.memberRoles || {} });
    baseline = snap(draft);
    saveError = ''; notice = '';
    pruneDraft(false);
    render();
  }
  function newFromPreset(p) {
    if (!confirmDiscard()) return;
    const [n, size] = p.split('x').map(Number);
    draft = { name: `Split ${p}`, memberRoles: {}, teams: Array.from({ length: n }, (_, i) => ({ id: uid(), name: `Team ${i + 1}`, size, memberIds: [] })) };
    baseline = '';
    saveError = ''; notice = '';
    render();
  }
  function closeEditor() {
    if (!confirmDiscard()) return;
    draft = null; saveError = ''; notice = '';
    render();
  }
  function findTeam(id) { return draft.teams.find((t) => t.id === id); }
  function assign(memberId, teamId) {
    const destination = teamId ? findTeam(teamId) : null;
    if (teamId && !destination) return;
    if (destination && !destination.memberIds.includes(memberId) && destination.memberIds.length >= destination.size) {
      toast(`${destination.name} is full (${destination.size}).`, true);
      return render();
    }
    for (const t of draft.teams) t.memberIds = t.memberIds.filter((x) => x !== memberId);
    if (teamId) {
      const t = findTeam(teamId);
      if (!t) return;
      if (t.memberIds.length >= t.size) { toast(`${t.name} is full (${t.size}).`, true); return render(); }
      t.memberIds.push(memberId);
    }
    render();
  }
  function addTeam() {
    if (draft.teams.length >= MAX_TEAMS) return toast(`Up to ${MAX_TEAMS} teams per setup.`, true);
    if (capacity(draft) + 10 > MAX_ROSTER) return toast(`Total capacity can't exceed ${MAX_ROSTER}.`, true);
    draft.teams.push({ id: uid(), name: `Team ${draft.teams.length + 1}`, size: 10, memberIds: [] });
    render();
  }
  function setSize(teamId, size) {
    const t = findTeam(teamId);
    if (capacity(draft) - t.size + size > MAX_ROSTER) { toast(`Total capacity can't exceed ${MAX_ROSTER}.`, true); return render(); }
    if (t.memberIds.length > size) { toast(`${t.name} has ${t.memberIds.length} members — unassign some first.`, true); return render(); }
    t.size = size;
    render();
  }
  function removeTeam(teamId) {
    if (draft.teams.length === 1) return toast('Keep at least one team in a setup.', true);
    const t = findTeam(teamId);
    if (t.memberIds.length && !confirm(`Remove ${t.name}? Its ${t.memberIds.length} members become unassigned.`)) return;
    draft.teams = draft.teams.filter((x) => x.id !== teamId);
    render();
  }

  async function save() {
    if (!draft || saving || readOnly()) return;
    saveError = '';
    saving = true; render();
    try {
      const body = { name: draft.name.trim(), memberRoles: draft.memberRoles, teams: draft.teams.map((t) => ({ id: t.id, name: t.name.trim(), size: t.size, memberIds: t.memberIds })) };
      if (draft.id) body.id = draft.id;
      const { setup } = await api('POST', { path: '/splits', body });
      const i = setups.findIndex((s) => s.id === setup.id);
      if (i >= 0) setups[i] = setup; else setups.push(setup);
      draft = clone({ id: setup.id, name: setup.name, teams: setup.teams, memberRoles: setup.memberRoles || {} });
      baseline = snap(draft);
      notice = '';
      toast(`Saved ${setup.name}`);
      renderScopeBar();
      onScopeChange(scopeTeam(), true);
    } catch (e) {
      saveError = e.message;
    } finally {
      saving = false; render();
    }
  }

  async function remove(id) {
    const s = setups.find((x) => x.id === id);
    if (!s || readOnly() || !confirm(`Delete split setup "${s.name}"?`)) return;
    try {
      await api('DELETE', { path: '/splits', query: `?id=${encodeURIComponent(id)}` });
      setups = setups.filter((x) => x.id !== id);
      if (draft?.id === id) { draft = null; baseline = ''; }
      if (scope.setupId === id) applyScope('', '');
      toast(`Deleted ${s.name}`);
      saveError = '';
    } catch (e) {
      saveError = e.message;
      toast(e.message, true);
      if (e.status === 404) load();
    }
    render();
    renderScopeBar();
  }

  // ---------- render ----------
  function memberRow(m, teamId) {
    const role = memberRole(m);
    const roleInfo = ROLES[role];
    const roleIcon = roleInfo
      ? `<img class="sp-role-icon" src="${iconUrl(roleInfo.icon)}" alt="${roleInfo.label} role" title="${roleInfo.label}" width="20" height="20">`
      : '<span class="sp-role-icon" role="img" aria-label="Undecided role" title="Undecided">?</span>';
    const originalRole = ROLES[roleOf(m.main?.class, m.main?.spec)]?.label || 'Undecided';
    const override = draft.memberRoles[m.id] || '';
    const others = draft.teams.filter((t) => t.id !== teamId);
    const opts = (cur) => `${cur
      ? `<option value="${esc(teamId)}" disabled selected>Move / unassign...</option><option value="">Unassign</option>`
      : '<option value="" disabled selected>Assign to...</option>'
    }${others.map((t) => `<option value="${esc(t.id)}" ${t.memberIds.length >= t.size ? 'disabled' : ''}>${esc(t.name)}${t.memberIds.length >= t.size ? ' (full)' : ''}</option>`).join('')}`;
    return `<li class="sp-member" data-sp-member="${esc(m.id)}">
      <div class="sp-member-identity">${roleIcon}${nameChip(m)}</div>
      <div class="sp-member-controls"><select data-sp-role="${esc(m.id)}" aria-label="Raid role for ${esc(m.name)}" ${readOnly() || saving ? 'disabled' : ''}>
        <option value="" ${override ? '' : 'selected'}>Roster (${originalRole})</option>
        ${Object.entries(ROLES).map(([id, r]) => `<option value="${id}" ${override === id ? 'selected' : ''}>${r.label}</option>`).join('')}
      </select><select data-sp-move="${esc(m.id)}" aria-label="Move ${esc(m.name)}" ${readOnly() || saving ? 'disabled' : ''}>${opts(Boolean(teamId))}</select></div></li>`;
  }

  function roleColumns(list, teamId) {
    const sorted = list.map((m) => ({ ...m, raidRole: draft.memberRoles[m.id] })).sort(compareMembersByRoleClass);
    return `<div class="sp-role-columns">${['tank', 'healer', 'dps', 'none'].map((role) => {
      const members = sorted.filter((m) => (memberRole(m) || 'none') === role);
      if (role === 'none' && !members.length) return '';
      const label = { tank: 'Tanks', healer: 'Healers', dps: 'DPS', none: 'Undecided' }[role];
      return `<section class="sp-role-column" data-role="${role}">
        <h3 class="sp-role-heading">${ROLES[role] ? `<img class="sp-role-icon" src="${iconUrl(ROLES[role].icon)}" alt="" width="20" height="20">` : ''}<span>${label}</span><span>${members.length}</span></h3>
        <ul class="sp-members">${members.length ? members.map((m) => memberRow(m, teamId)).join('') : '<li class="muted">No players</li>'}</ul>
      </section>`;
    }).join('')}</div>`;
  }

  function render() {
    const root = $('#splits-root');
    if (!root) return;
    const ms = getMembers();
    const full = ms.length >= MAX_ROSTER;
    const ro = readOnly() || saving;
    let html = `<div class="panel sp-head">
      <div class="panel-head"><h2>Split setups</h2>
        <span class="sp-cap ${full ? 'full' : ''}" id="roster-capacity" data-count="${ms.length}">${ms.length} / ${MAX_ROSTER} roster${full ? ' - full' : ''}</span></div>
      <p class="hint">Save named team plans, then pick a team on the Composition tab to analyse just those members.</p>`;
    if (readOnly()) html += '<p class="sp-banner warn" id="splits-readonly" role="status">Read-only: storage is not connected, so setups cannot be created, edited or deleted.</p>';
    if (loadError) html += `<div class="sp-banner bad" id="splits-error" role="alert">Couldn't load split setups: ${esc(loadError)} <button type="button" class="btn small" data-sp-retry>Retry</button></div>`;
    else if (!loaded) html += '<p class="muted" id="splits-loading">Loading setups...</p>';
    html += '</div>';

    if (loaded && !loadError) {
      html += `<div class="panel"><h2>Saved setups</h2>${setups.length ? `<ul class="sp-list" id="split-list">${setups.map((s) => {
        const n = s.teams.reduce((a, t) => a + t.memberIds.length, 0);
        return `<li class="sp-card ${draft?.id === s.id ? 'on' : ''}" data-setup-id="${esc(s.id)}"><div><b>${esc(s.name)}</b><span class="muted"> ${s.teams.length} teams, ${n} assigned, capacity ${s.teams.reduce((a, t) => a + t.size, 0)}</span></div>
          <div class="sp-actions"><button type="button" class="btn small" data-sp-open="${esc(s.id)}">${draft?.id === s.id ? 'Editing' : 'Edit'}</button><button type="button" class="btn small danger" data-sp-delete="${esc(s.id)}" ${ro ? 'disabled' : ''}>Delete</button></div></li>`;
      }).join('')}</ul>` : '<p class="empty" id="splits-empty">No saved setups yet. Start from a preset below.</p>'}
        <div class="label">New setup</div>
        <div class="sp-presets" id="split-presets">${PRESETS.map((p) => `<button type="button" class="btn small" data-sp-preset="${p}" ${ro ? 'disabled' : ''}>${p.replace('x', ' x ')}</button>`).join('')}</div></div>`;
    }

    if (draft) html += editorHtml();
    root.innerHTML = html;
    refreshDirty();
  }

  function editorHtml() {
    const ro = readOnly() || saving;
    const ids = new Set(draft.teams.flatMap((t) => t.memberIds));
    const mm = memberMap();
    const pool = getMembers().filter((m) => !ids.has(m.id)).sort(compareMembersByRoleClass);
    const cap = capacity(draft);
    return `<div class="panel sp-editor" id="split-editor">
      <div class="panel-head"><h2>${draft.id ? 'Edit setup' : 'New setup'}</h2>
        <span class="sp-dirty" id="split-dirty" hidden>Unsaved changes</span></div>
      ${notice ? `<p class="sp-banner warn" id="split-notice">${esc(notice)}</p>` : ''}
      ${saveError ? `<p class="sp-banner bad" id="split-save-error" role="alert">${esc(saveError)}</p>` : ''}
      <div class="sp-fields"><label class="label" for="split-name">Setup name</label>
        <input id="split-name" maxlength="60" value="${esc(draft.name)}" ${ro ? 'disabled' : ''}></div>
      <div class="sp-totals" id="split-totals">${draft.teams.length} / ${MAX_TEAMS} teams, capacity ${cap} / ${MAX_ROSTER}, ${ids.size} assigned, ${pool.length} unassigned</div>
      <p class="hint">Choose each player's raid role below. Role choices are saved for this setup only; their main roster class and spec stay unchanged. Select “Roster” to use their main role again.</p>
      <div class="sp-teams" id="split-teams">${draft.teams.map((t) => {
        const full = t.memberIds.length >= t.size;
        const list = t.memberIds.map((id) => mm.get(id)).filter(Boolean).sort(compareMembersByRoleClass);
        return `<section class="sp-team ${full ? 'full' : ''}" data-team-id="${esc(t.id)}">
          <header><input class="sp-team-name" data-sp-team-name="${esc(t.id)}" maxlength="40" value="${esc(t.name)}" aria-label="Team name" ${ro ? 'disabled' : ''}>
            <select data-sp-size="${esc(t.id)}" aria-label="Team size" ${ro ? 'disabled' : ''}>${SIZES.map((s) => `<option value="${s}" ${s === t.size ? 'selected' : ''}>${s}-man</option>`).join('')}</select>
            <button type="button" class="x" data-sp-remove-team="${esc(t.id)}" aria-label="Remove team" ${ro ? 'disabled' : ''}>Remove</button></header>
          <div class="sp-count" data-sp-count>${t.memberIds.length} / ${t.size}</div>
          <div class="meter"><i style="width:${Math.min(100, (t.memberIds.length / t.size) * 100)}%"></i></div>
          ${roleColumns(list, t.id)}
        </section>`;
      }).join('')}</div>
      <button type="button" class="btn ghost small" data-sp-add-team ${ro || draft.teams.length >= MAX_TEAMS ? 'disabled' : ''}>+ Add team</button>
      <div class="label">Unassigned (${pool.length})</div>
      <div id="split-pool">${roleColumns(pool, '')}${pool.length ? '' : '<p class="muted">Everyone is assigned.</p>'}</div>
      <div class="form-actions"><button type="button" class="btn primary" id="split-save" data-sp-save ${ro || saving ? 'disabled' : ''}>${saving ? 'Saving...' : 'Save changes'}</button>
        <button type="button" class="btn ghost" data-sp-close>${isDirty() ? 'Discard and close' : 'Close'}</button></div>
    </div>`;
  }

  // Cheap update used while typing (no re-render, keeps focus).
  function refreshDirty() {
    const d = $('#split-dirty');
    if (d) d.hidden = !isDirty();
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !b.closest('#splits-root')) return;
    if (b.disabled || saving) return;
    const d = b.dataset;
    if ('spRetry' in d) { loaded = false; loadError = ''; render(); load(); }
    else if (d.spOpen) openSetup(d.spOpen);
    else if (d.spDelete) remove(d.spDelete);
    else if (d.spPreset) newFromPreset(d.spPreset);
    else if ('spClose' in d) closeEditor();
    else if ('spSave' in d) save();
    else if ('spAddTeam' in d) addTeam();
    else if (d.spRemoveTeam) removeTeam(d.spRemoveTeam);
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'scope-setup') { applyScope(t.value, ''); renderScopeBar(); return; }
    if (t.id === 'scope-team') { applyScope(scope.setupId, t.value); renderScopeBar(); return; }
    if (!draft || !t.closest('#splits-root')) return;
    if (readOnly() || saving) return;
    if (t.dataset.spMove) assign(t.dataset.spMove, t.value);
    else if (t.dataset.spSize) setSize(t.dataset.spSize, Number(t.value));
    else if (t.dataset.spRole) {
      if (t.value && !Object.hasOwn(ROLES, t.value)) return;
      if (t.value) draft.memberRoles[t.dataset.spRole] = t.value;
      else delete draft.memberRoles[t.dataset.spRole];
      render();
      document.querySelector(`[data-sp-role="${CSS.escape(t.dataset.spRole)}"]`)?.focus();
    }
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!draft) return;
    if (t.id === 'split-name') draft.name = t.value;
    else if (t.dataset.spTeamName) { findTeam(t.dataset.spTeamName).name = t.value; }
    else return;
    refreshDirty();
  });
  window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  return { load, render, renderScopeBar, scopeMembers, scopeTeam, isDirty, confirmDiscard, MAX_ROSTER };
}
