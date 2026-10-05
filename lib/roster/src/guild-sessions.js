import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { GuildError } from './guild-redis.js';

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = 'fgb_session';
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const HASH_RE = /^[a-f0-9]{128}$/;
const SALT_RE = /^[a-f0-9]{32}$/;

export async function hashGuildCredential(credential, salt = randomBytes(16).toString('hex')) {
  if (typeof credential !== 'string' || credential.length < 1 || credential.length > 200 || !SALT_RE.test(salt)) {
    throw new GuildError('Invalid guild credential.', 400);
  }
  const hash = await scrypt(credential, salt, 64);
  return { salt, hash: hash.toString('hex') };
}

export async function verifyGuildCredential(credential, hash, salt) {
  if (typeof credential !== 'string' || !credential || credential.length > 200 ||
      typeof hash !== 'string' || !HASH_RE.test(hash) || typeof salt !== 'string' || !SALT_RE.test(salt)) return false;
  const derived = await scrypt(credential, salt, 64);
  return timingSafeEqual(Buffer.from(hash, 'hex'), derived);
}

export function createSessionManager({ secret = process.env.SESSION_SECRET, now = () => Date.now() } = {}) {
  function requireSecret() {
    if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
      throw new GuildError('Guild sessions need a SESSION_SECRET of at least 32 bytes.');
    }
  }

  const sign = (encoded) => {
    requireSecret();
    return createHmac('sha256', secret).update(encoded).digest('base64url');
  };

  function issue({ id, keyVersion }, inviteId) {
    if (typeof id !== 'string' || !ID_RE.test(id) || !Number.isSafeInteger(keyVersion) || keyVersion < 1) throw new GuildError('Invalid guild session.', 400);
    if (inviteId !== undefined && (typeof inviteId !== 'string' || !ID_RE.test(inviteId))) throw new GuildError('Invalid invite session.', 400);
    const payload = { guildId: id, keyVersion, exp: Math.floor(now() / 1000) + SESSION_SECONDS,
      ...(inviteId ? { inviteId } : {}) };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token = `${encoded}.${sign(encoded)}`;
    return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}`;
  }

  function read(cookieHeader = '') {
    if (typeof cookieHeader !== 'string' || cookieHeader.length > 8192) return null;
    const matches = cookieHeader.split(';').map((part) => part.trim())
      .filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
    if (matches.length !== 1) return null;
    const token = matches[0].slice(SESSION_COOKIE.length + 1);
    const parts = token.split('.');
    if (parts.length !== 2 || parts[0].length > 512 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
        !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return null;
    const expected = Buffer.from(sign(parts[0]));
    const signature = Buffer.from(parts[1]);
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
    let payload;
    try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { return null; }
    const currentTime = Math.floor(now() / 1000);
    if (!payload || typeof payload.guildId !== 'string' || !ID_RE.test(payload.guildId) ||
        !Number.isSafeInteger(payload.keyVersion) || payload.keyVersion < 1 ||
        !Number.isSafeInteger(payload.exp) || payload.exp <= currentTime ||
        payload.exp > currentTime + SESSION_SECONDS + 60 ||
        (payload.inviteId !== undefined && (typeof payload.inviteId !== 'string' || !ID_RE.test(payload.inviteId)))) return null;
    return { guildId: payload.guildId, keyVersion: payload.keyVersion, exp: payload.exp,
      ...(payload.inviteId ? { inviteId: payload.inviteId } : {}) };
  }

  function clear() {
    return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
  }
  return { issue, read, clear, requireSecret };
}