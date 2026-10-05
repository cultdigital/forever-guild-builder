import { randomBytes, randomUUID } from 'node:crypto';
import { GuildError } from './guild-redis.js';
import { hashGuildCredential, verifyGuildCredential } from './guild-sessions.js';
import { generateGuildCredential } from './guild-credentials.js';
import { GUILD_TTL_SECONDS, publicGuild } from './guild-store.js';

export const GUILD_INDEX = 'guild:index';
const CREATE = `
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', ARGV[3])
if redis.call('ZCARD', KEYS[3]) >= tonumber(ARGV[4]) then return -1 end
if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[2]) == 1 then return -2 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SET', KEYS[2], ARGV[5], 'EX', ARGV[2])
redis.call('ZADD', KEYS[3], tonumber(ARGV[3]) + tonumber(ARGV[2]), ARGV[5])
return 1
`;
const UPDATE = `
local raw = redis.call('GET', KEYS[1])
if not raw then return -1 end
local meta = cjson.decode(raw)
if meta.keyVersion ~= tonumber(ARGV[1]) then return -2 end
local patch = cjson.decode(ARGV[2])
for field, value in pairs(patch) do meta[field] = value end
meta.updatedAt = ARGV[5]
redis.call('SET', KEYS[1], cjson.encode(meta), 'EX', ARGV[3])
for i = 2, 4 do redis.call('EXPIRE', KEYS[i], ARGV[3]) end
redis.call('ZADD', KEYS[5], tonumber(ARGV[4]) + tonumber(ARGV[3]), meta.id)
return cjson.encode(meta)
`;
const DELETE = `
local raw = redis.call('GET', KEYS[1])
if not raw then return -1 end
if cjson.decode(raw).keyVersion ~= tonumber(ARGV[1]) then return -2 end
for i = 1, 4 do redis.call('DEL', KEYS[i]) end
redis.call('ZREM', KEYS[5], ARGV[2])
return 1
`;

function keys(meta) {
  return [`guild:${meta.id}:meta`, `guild:${meta.id}:members`, `guild:${meta.id}:splits`, `guild:slug:${meta.slug}`, GUILD_INDEX];
}

export function validateGuildName(name) {
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 24 || /[\p{C}]/u.test(name)) {
    throw new GuildError('Guild name must be 2–24 characters.', 400);
  }
  return name.trim();
}

export function createGuildManagement(redis, { env = process.env, fetchImpl = fetch } = {}) {
  const creationConfigured = () => Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY && redis.configured &&
    typeof env.SESSION_SECRET === 'string' && Buffer.byteLength(env.SESSION_SECRET) >= 32);

  async function verifyTurnstile(token, hostname) {
    if (!creationConfigured()) throw new GuildError('New guild creation is waiting for Redis storage and Turnstile bot-protection setup.');
    if (typeof token !== 'string' || !token || token.length > 2048) throw new GuildError('Complete the bot check before creating a guild.', 400);
    let response;
    try {
      response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!result.success || result.hostname !== hostname || result.action !== 'create-guild') {
        throw new GuildError('The bot check failed or expired. Please try again.', 400);
      }
    } catch (error) {
      if (error instanceof GuildError) throw error;
      throw new GuildError('Bot protection is temporarily unavailable. Please try again shortly.');
    }
  }

  async function create({ name, faction }) {
    name = validateGuildName(name);
    if (!['horde', 'alliance'].includes(faction)) throw new GuildError('Choose Horde or Alliance.', 400);
    const maximum = env.MAX_GUILDS === undefined ? 5000 : Number(env.MAX_GUILDS);
    if (!Number.isSafeInteger(maximum) || maximum < 1) throw new GuildError('New guild creation is paused because its capacity setting is invalid.');
    const key = generateGuildCredential();
    const recoveryCode = generateGuildCredential();
    const credential = await hashGuildCredential(key);
    const recovery = await hashGuildCredential(recoveryCode, credential.salt);
    const base = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'guild';
    const now = new Date().toISOString();
    for (let attempt = 0; attempt < 4; attempt++) {
      const meta = {
        id: randomUUID(), name, faction, slug: `${base}-${randomBytes(3).toString('hex')}`,
        keyVersion: 1, salt: credential.salt, keyHash: credential.hash, recoveryHash: recovery.hash,
        donationDismissed: false, createdAt: now, updatedAt: now,
      };
      const result = await redis.command([
        'EVAL', CREATE, 3, `guild:${meta.id}:meta`, `guild:slug:${meta.slug}`, GUILD_INDEX,
        JSON.stringify(meta), GUILD_TTL_SECONDS, Math.floor(Date.now() / 1000), maximum, meta.id,
      ]);
      if (result === -1) throw new GuildError('New guild creation is paused while we are at capacity. Existing guilds can keep using all features.', 503);
      if (result === -2) continue;
      if (result !== 1) throw new GuildError('The guild could not be created.');
      return { meta, key, recoveryCode };
    }
    throw new GuildError('The guild URL could not be reserved. Please try again.');
  }

  async function update(meta, patch) {
    const raw = await redis.command([
      'EVAL', UPDATE, 5, ...keys(meta), meta.keyVersion, JSON.stringify(patch),
      GUILD_TTL_SECONDS, Math.floor(Date.now() / 1000), new Date().toISOString(),
    ]);
    if (raw === -1 || raw === -2) throw new GuildError('Your guild changed or expired. Sign in again before continuing.', 401);
    if (typeof raw !== 'string') throw new GuildError('Guild settings could not be saved.');
    return JSON.parse(raw);
  }

  async function rotate(meta, body, recoveryOnly = false) {
    const recoveryValid = await verifyGuildCredential(body.recoveryCode, meta.recoveryHash, meta.salt);
    const keyValid = !recoveryOnly && await verifyGuildCredential(body.key, meta.keyHash, meta.salt);
    if (!recoveryValid && !keyValid) throw new GuildError(recoveryOnly ? 'That recovery code is not valid.' : 'Enter the current guild key or recovery code.', 401);
    const key = generateGuildCredential();
    const hashed = await hashGuildCredential(key, meta.salt);
    const updated = await update(meta, { keyHash: hashed.hash, keyVersion: meta.keyVersion + 1 });
    return { meta: updated, key, guild: publicGuild(updated) };
  }

  async function remove(meta, { key, confirmation }) {
    if (confirmation !== meta.name) throw new GuildError('Type the exact guild name to confirm deletion.', 400);
    if (!await verifyGuildCredential(key, meta.keyHash, meta.salt)) throw new GuildError('The current guild key is required to delete this guild.', 401);
    const result = await redis.command(['EVAL', DELETE, 5, ...keys(meta), meta.keyVersion, meta.id]);
    if (result === -1 || result === -2) throw new GuildError('Your guild changed or expired. Sign in again before continuing.', 401);
    if (result !== 1) throw new GuildError('The guild could not be removed.');
  }

  return { creationConfigured, verifyTurnstile, create, update, rotate, remove };
}