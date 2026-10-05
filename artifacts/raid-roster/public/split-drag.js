// Validate the whole move before changing either assignment or raid role.
export function moveSplitMember(draft, memberId, teamId, role, defaultRole, partyIndex) {
  const destination = teamId ? draft.teams.find((t) => t.id === teamId) : null;
  if (teamId && !destination) return 'That team no longer exists.';
  if (role !== undefined && !['tank', 'healer', 'dps'].includes(role)) return 'Choose Tank, Healer, or DPS.';
  if (destination && !destination.memberIds.includes(memberId) && destination.memberIds.length >= destination.size) {
    return `${destination.name} is full (${destination.size}).`;
  }
  const groups = destination ? destination.parties || Array.from({ length: destination.size / 5 }, (_, i) => destination.memberIds.slice(i * 5, i * 5 + 5)) : null;
  let targetParty;
  if (destination) {
    if (partyIndex !== undefined && (!Number.isInteger(partyIndex) || partyIndex < 0 || partyIndex >= groups.length)) return 'That party no longer exists.';
    targetParty = partyIndex ?? groups.findIndex((g) => g.includes(memberId));
    if (targetParty < 0) targetParty = groups.findIndex((g) => g.length < 5);
    if (targetParty < 0 || (!groups[targetParty].includes(memberId) && groups[targetParty].length >= 5)) return `Party ${targetParty + 1} is full (5).`;
    if (groups[targetParty].includes(memberId) && role === undefined) return '';
  }
  for (const team of draft.teams) {
    if (team !== destination) team.memberIds = team.memberIds.filter((id) => id !== memberId);
    if (team.parties) team.parties = team.parties.map((g) => g.filter((id) => id !== memberId));
  }
  if (destination && !destination.memberIds.includes(memberId)) destination.memberIds.push(memberId);
  if (destination) {
    destination.parties = groups.map((g) => g.filter((id) => id !== memberId));
    destination.parties[targetParty].push(memberId);
  }
  if (role !== undefined) {
    if (role === defaultRole) delete draft.memberRoles[memberId];
    else draft.memberRoles[memberId] = role;
  }
  return '';
}

// Native mouse dragging, touch/pen dragging from the grip, and keyboard
// pickup/destination/drop controls on that same grip.
export function attachSplitDrag({ root, canEdit, canDrop, onMove, onBlocked }) {
  let active = null, hovered = null, ghost = null, frame = 0;
  let keyboardZones = [], keyboardIndex = 0;
  let blockedNative = false;
  const zone = (node) => {
    const target = node?.closest?.('[data-sp-drop-team]');
    return target && root.contains(target) ? target : null;
  };
  const party = (target) => target?.hasAttribute('data-sp-drop-party') ? Number(target.dataset.spDropParty) : undefined;
  function highlight(target) {
    hovered?.classList.remove('sp-drop-over', 'sp-drop-blocked');
    hovered = target;
    if (active && target) {
      const allowed = canDrop(active.id, target.dataset.spDropTeam, party(target));
      target.classList.add(allowed ? 'sp-drop-over' : 'sp-drop-blocked');
      if (!allowed && active.blockedTarget !== target) {
        const index = party(target);
        const raid = target.closest('[data-team-id]')?.querySelector('[data-sp-team-name]')?.value || 'This raid';
        onBlocked?.(index === undefined ? `${raid} is full. Choose another composition.` : `Party ${index + 1} is full (5 players). Choose another party.`);
      }
      active.blockedTarget = allowed ? null : target;
    }
  }
  function cancel() {
    cancelAnimationFrame(frame);
    if (active?.pointerId !== undefined && active.handle?.hasPointerCapture?.(active.pointerId)) active.handle.releasePointerCapture(active.pointerId);
    root.querySelectorAll('.sp-dragging').forEach((row) => row.classList.remove('sp-dragging'));
    root.classList.remove('sp-drag-active');
    highlight(null);
    ghost?.remove();
    active = ghost = null;
    keyboardZones = [];
  }
  function start(row, mode) {
    if (!canEdit()) return false;
    cancel();
    active = { id: row.dataset.spMember, mode };
    row.classList.add('sp-dragging');
    root.classList.add('sp-drag-active');
    return true;
  }
  function announceKeyboard() {
    const target = keyboardZones[keyboardIndex];
    if (!target) return;
    highlight(target);
    target.scrollIntoView({ block: 'nearest' });
    const status = root.querySelector('#split-drag-status');
    const raid = target.closest('[data-team-id]')?.querySelector('[data-sp-team-name]')?.value || 'Raid';
    const label = target.dataset.spDropTeam ? `${raid}, Party ${party(target) + 1}` : 'Unassigned';
    if (status) status.textContent = `${label}. ${canDrop(active.id, target.dataset.spDropTeam, party(target)) ? 'Press Enter to place the player.' : 'Full. Choose another party.'} Arrow keys change destination; Escape cancels.`;
  }
  root.addEventListener('keydown', (event) => {
    const handle = event.target.closest?.('[data-sp-drag-handle]');
    if (!handle) return;
    if (!active && (event.key === ' ' || event.key === 'Enter')) {
      const row = handle.closest('[data-sp-member]');
      if (!row || !start(row, 'keyboard')) return;
      event.preventDefault();
      active.handle = handle;
      keyboardZones = [...root.querySelectorAll('[data-sp-drop-party], #split-pool')].filter((target) => zone(target) === target);
      const origin = zone(row);
      keyboardIndex = Math.max(0, (keyboardZones.indexOf(origin) + 1) % keyboardZones.length);
      announceKeyboard();
    } else if (active?.mode === 'keyboard') {
      if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const delta = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
        keyboardIndex = (keyboardIndex + delta + keyboardZones.length) % keyboardZones.length;
        announceKeyboard();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const id = active.id;
        finish(keyboardZones[keyboardIndex]);
        root.querySelector(`[data-sp-member="${CSS.escape(id)}"] [data-sp-drag-handle]`)?.focus();
      } else if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') event.preventDefault();
        cancel();
        const status = root.querySelector('#split-drag-status');
        if (status) status.textContent = 'Move cancelled.';
      }
    }
  });
  function finish(target) {
    const id = active?.id;
    const teamId = target?.dataset.spDropTeam;
    const role = target?.dataset.spDropRole || undefined;
    const partyIndex = party(target);
    cancel();
    if (id && target && canEdit()) onMove(id, teamId, role, partyIndex);
  }
  function point(x, y) {
    if (!active) return;
    active.x = x; active.y = y;
    if (ghost) {
      ghost.style.left = `${Math.min(x + 12, innerWidth - ghost.offsetWidth - 8)}px`;
      ghost.style.top = `${y + 12}px`;
    }
    highlight(zone(document.elementFromPoint(x, y)));
  }
  function scroll() {
    if (!active) return;
    const dy = active.y < 80 ? -12 : active.y > innerHeight - 80 ? 12 : 0;
    if (dy) { window.scrollBy(0, dy); point(active.x, active.y); }
    frame = requestAnimationFrame(scroll);
  }
  root.addEventListener('dragstart', (event) => {
    if (active?.mode === 'touch') { event.preventDefault(); return; }
    const row = event.target.closest?.('[data-sp-member]');
    if (!row || blockedNative || !start(row, 'native')) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', active.id);
    event.dataTransfer.setDragImage(row, 20, 15);
  });
  root.addEventListener('dragover', (event) => {
    if (active?.mode !== 'native') return;
    const target = zone(event.target);
    highlight(target);
    if (target) {
      event.preventDefault();
      event.dataTransfer.dropEffect = canDrop(active.id, target.dataset.spDropTeam, party(target)) ? 'move' : 'none';
    }
  });
  root.addEventListener('dragleave', (event) => {
    if (active?.mode === 'native' && !hovered?.contains(event.relatedTarget)) highlight(null);
  });
  root.addEventListener('drop', (event) => {
    if (active?.mode !== 'native') return; // Ignore external text/file drags.
    event.preventDefault();
    finish(zone(event.target));
  });
  document.addEventListener('dragend', cancel);
  root.addEventListener('pointerdown', (event) => {
    blockedNative = Boolean(event.target.closest('select, input, button, a') && !event.target.closest('[data-sp-drag-handle]'));
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    const handle = event.target.closest('[data-sp-drag-handle]');
    const row = handle?.closest('[data-sp-member]');
    if (!row || !start(row, 'touch')) return;
    active.pointerId = event.pointerId;
    active.handle = handle;
    handle.setPointerCapture(event.pointerId);
    ghost = row.cloneNode(true);
    ghost.classList.add('sp-drag-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.removeAttribute('data-sp-member');
    ghost.style.width = `${Math.min(row.getBoundingClientRect().width, innerWidth - 32)}px`;
    document.body.append(ghost);
    point(event.clientX, event.clientY);
    frame = requestAnimationFrame(scroll);
  });
  document.addEventListener('pointermove', (event) => {
    if (active?.mode !== 'touch' || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    point(event.clientX, event.clientY);
  }, { passive: false });
  document.addEventListener('pointerup', (event) => {
    if (active?.mode !== 'touch' || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    finish(zone(document.elementFromPoint(event.clientX, event.clientY)));
  });
  document.addEventListener('pointercancel', (event) => {
    if (event.pointerId === active?.pointerId) cancel();
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') cancel(); });
  return { cancel };
}
