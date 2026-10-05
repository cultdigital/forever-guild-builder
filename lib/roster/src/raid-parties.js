// Preserve existing party placement; seat new/legacy members in the first free
// party. Resizing only relocates players whose old party no longer exists.
export function partyGroups(team, size = team.size) {
  const ids = new Set(team.memberIds);
  const placed = new Set();
  const groups = Array.from({ length: size / 5 }, (_, i) =>
    (team.parties?.[i] || []).filter((id) => {
      if (!ids.has(id) || placed.has(id)) return false;
      placed.add(id);
      return true;
    }).slice(0, 5));
  const seated = new Set(groups.flat());
  for (const id of team.memberIds) {
    if (seated.has(id)) continue;
    const group = groups.find((members) => members.length < 5);
    if (group) { group.push(id); seated.add(id); }
  }
  return groups;
}
