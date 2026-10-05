import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const generateInviteToken = () => randomBytes(32).toString('hex');
export function inviteTokenHash(token) {
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
    ? createHash('sha256').update(token).digest('hex') : null;
}
export function verifyInviteToken(token, meta) {
  const hash = inviteTokenHash(token);
  return Boolean(hash && meta?.inviteId && typeof meta.inviteHash === 'string' &&
    /^[a-f0-9]{64}$/.test(meta.inviteHash) &&
    timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(meta.inviteHash, 'hex')));
}
export const inviteStatus = (meta) => ({
  active: Boolean(meta.inviteId && meta.inviteHash),
  id: meta.inviteId && meta.inviteHash ? meta.inviteId : null,
  createdAt: meta.inviteId && meta.inviteHash ? meta.inviteCreatedAt : null,
});
