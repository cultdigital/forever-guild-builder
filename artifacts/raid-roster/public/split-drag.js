// Validate the whole move before changing either assignment or raid role.
export function moveSplitMember(draft, memberId, teamId, role, defaultRole) {
  const destination = teamId ? draft.teams.find((t) => t.id === teamId) : null;
  if (teamId && !destination) return 'That team no longer exists.';
  if (role !== undefined && !['tank', 'healer', 'dps'].includes(role)) return 'Choose Tank, Healer, or DPS.';
  if (destination && !destination.memberIds.includes(memberId) && destination.memberIds.length >= destination.size) {
    return `${destination.name} is full (${destination.size}).`;
  }
  for (const team of draft.teams) {
    if (team !== destination) team.memberIds = team.memberIds.filter((id) => id !== memberId);
  }
  if (destination && !destination.memberIds.includes(memberId)) destination.memberIds.push(memberId);
  if (role !== undefined) {
    if (role === defaultRole) delete draft.memberRoles[memberId];
    else draft.memberRoles[memberId] = role;
  }
  return '';
}

// Native mouse dragging, plus touch/pen dragging from the grip. Existing
// dropdowns remain the keyboard-accessible alternative.
export function attachSplitDrag({ root, canEdit, canDrop, onMove }) {
  let active = null, hovered = null, ghost = null, frame = 0;
  let blockedNative = false;
  const zone = (node) => {
    const target = node?.closest?.('[data-sp-drop-team]');
    return target && root.contains(target) ? target : null;
  };
  function highlight(target) {
    hovered?.classList.remove('sp-drop-over', 'sp-drop-blocked');
    hovered = target;
    if (active && target) {
      target.classList.add(canDrop(active.id, target.dataset.spDropTeam) ? 'sp-drop-over' : 'sp-drop-blocked');
    }
  }
  function cancel() {
    cancelAnimationFrame(frame);
    if (active?.handle?.hasPointerCapture?.(active.pointerId)) active.handle.releasePointerCapture(active.pointerId);
    root.querySelectorAll('.sp-dragging').forEach((row) => row.classList.remove('sp-dragging'));
    root.classList.remove('sp-drag-active');
    highlight(null);
    ghost?.remove();
    active = ghost = null;
  }
  function start(row, mode) {
    if (!canEdit()) return false;
    cancel();
    active = { id: row.dataset.spMember, mode };
    row.classList.add('sp-dragging');
    root.classList.add('sp-drag-active');
    return true;
  }
  function finish(target) {
    const id = active?.id;
    const teamId = target?.dataset.spDropTeam;
    const role = target?.dataset.spDropRole || undefined;
    cancel();
    if (id && target && canEdit()) onMove(id, teamId, role);
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
      event.dataTransfer.dropEffect = canDrop(active.id, target.dataset.spDropTeam) ? 'move' : 'none';
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
    blockedNative = Boolean(event.target.closest('select, input, button, a'));
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
