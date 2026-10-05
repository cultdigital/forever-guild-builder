import { CLASSES, roleOf } from './data.js';

const ROLE_ORDER = { tank: 0, healer: 1, dps: 2 };
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

// Display order only; callers sort copies, never persisted team member IDs.
export function compareMembersByRoleClass(a, b) {
  const rank = (member) => ROLE_ORDER[roleOf(member.main?.class, member.main?.spec)] ?? 3;
  const className = (member) => CLASSES[member.main?.class]?.label || member.main?.class || '';
  return rank(a) - rank(b)
    || collator.compare(className(a), className(b))
    || collator.compare(a.name || '', b.name || '')
    || collator.compare(a.id || '', b.id || '');
}
