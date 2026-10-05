import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { GuildError } from './guild-redis.js';

const INCREMENT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n
`;

export function createGuildLimits(redis, { secret, trustProxy = false } = {}) {
  function ipKey(req) {
    // Do not trust caller-controlled forwarding headers by default. A deployment
    // can opt in only when its trusted reverse proxy appends the client address.
    const forwarded = trustProxy && req.headers['x-forwarded-for'];
    const last = typeof forwarded === 'string' ? forwarded.split(',').at(-1).trim() : '';
    const ip = isIP(last) ? last : req.socket.remoteAddress || 'unknown';
    if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
      throw new GuildError('Abuse protection needs a SESSION_SECRET of at least 32 bytes.');
    }
    return createHmac('sha256', secret).update(ip).digest('hex');
  }

  async function consume(bucket, limit, seconds) {
    const count = await redis.command(['EVAL', INCREMENT, 1, `guild:limit:${bucket}`, seconds]);
    if (!Number.isSafeInteger(count) || count < 1) throw new GuildError('Abuse protection is temporarily unavailable.');
    if (count > limit) throw new GuildError('Too many requests. Please wait before trying again.', 429);
  }

  async function attempts(req, guildId) {
    const ip = ipKey(req);
    // Even nonexistent slugs consume IP counters. Raw IPs are never persisted.
    await consume(`login:ip:${ip}:minute`, 5, 60);
    await consume(`login:ip:${ip}:hour`, 20, 3600);
    if (guildId) {
      await consume(`login:guild:${guildId}:minute`, 5, 60);
      await consume(`login:guild:${guildId}:hour`, 20, 3600);
    }
  }

  return {
    attempts,
    read: (req) => consume(`read:${ipKey(req)}`, 300, 60),
    write: (guildId) => consume(`write:${guildId}`, 60, 60),
    create: (req) => consume(`create:${ipKey(req)}`, 3, 86400),
  };
}