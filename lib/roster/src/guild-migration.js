import { randomUUID } from 'node:crypto';
import { GuildError } from './guild-redis.js';
import { generateGuildCredential } from './guild-credentials.js';
import { hashGuildCredential } from './guild-sessions.js';
import { GUILD_TTL_SECONDS, publicGuild } from './guild-store.js';
import { GUILD_INDEX } from './guild-management.js';
import { SEED } from './seed.js';

export const MIGRATION_MARKER = 'guild:migration:good-job';
const MIGRATE = `
-- MIGRATE_GOOD_JOB: administrative import, never a public route
local existing = redis.call('GET', KEYS[6])
if existing then return {0, existing} end
local source = redis.call('HGETALL', KEYS[7])
local splits = redis.call('HGETALL', KEYS[8])
for i = 2, #source, 2 do
  local ok, item = pcall(cjson.decode, source[i])
  if not ok or type(item) ~= 'table' then return {-3} end
end
for i = 2, #splits, 2 do
  local ok, item = pcall(cjson.decode, splits[i])
  if not ok or type(item) ~= 'table' then return {-3} end
end
redis.call('ZREMRANGEBYSCORE', KEYS[5], '-inf', ARGV[3])
if redis.call('ZCARD', KEYS[5]) >= tonumber(ARGV[4]) then return {-1} end
if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[4]) == 1 then return {-2} end
if #source == 0 then
  local seed = cjson.decode(ARGV[5])
  for _, member in ipairs(seed) do
    table.insert(source, member[1])
    table.insert(source, member[2])
  end
end
if #source > 0 then redis.call('HSET', KEYS[2], unpack(source)) end
if #splits > 0 then redis.call('HSET', KEYS[3], unpack(splits)) end
local meta = cjson.decode(ARGV[1])
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SET', KEYS[4], meta.id, 'EX', ARGV[2])
redis.call('EXPIRE', KEYS[2], ARGV[2])
redis.call('EXPIRE', KEYS[3], ARGV[2])
redis.call('ZADD', KEYS[5], tonumber(ARGV[3]) + tonumber(ARGV[2]), meta.id)
local marker = cjson.encode({id=meta.id, slug=meta.slug})
redis.call('SET', KEYS[6], marker)
return {1, #source / 2, #splits / 2}
`;

// Call only from the explicit administrative CLI. No startup import, no source
// deletion, no routine logging of credentials and no local-file fallback.
export async function migrateGoodJob(redis, { env = process.env } = {}) {
  redis.requireConfigured();
  const previous = await redis.command(['GET', MIGRATION_MARKER]);
  if (previous) return { alreadyMigrated: true, ...JSON.parse(previous) };
  const maximum = env.MAX_GUILDS === undefined ? 5000 : Number(env.MAX_GUILDS);
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw new GuildError('Configure a valid MAX_GUILDS before migrating.');
  const key = generateGuildCredential(), recoveryCode = generateGuildCredential();
  const credential = await hashGuildCredential(key);
  const recovery = await hashGuildCredential(recoveryCode, credential.salt);
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 4; attempt++) {
    const meta = {
      id: randomUUID(), name: 'Good Job', slug: 'good-job', faction: 'horde',
      keyVersion: 1, salt: credential.salt, keyHash: credential.hash, recoveryHash: recovery.hash,
      donationDismissed: false, createdAt: now, updatedAt: now,
    };
    const result = await redis.command([
      'EVAL', MIGRATE, 8, `guild:${meta.id}:meta`, `guild:${meta.id}:members`, `guild:${meta.id}:splits`,
      `guild:slug:${meta.slug}`, GUILD_INDEX, MIGRATION_MARKER, 'roster:v1', 'roster:v1:splits',
      JSON.stringify(meta), GUILD_TTL_SECONDS, Math.floor(Date.now() / 1000), maximum,
      JSON.stringify(SEED.map((member) => [member.id, JSON.stringify(member)])),
    ]);
    if (!Array.isArray(result)) throw new GuildError('The migration could not be completed.');
    if (result[0] === 0) return { alreadyMigrated: true, ...JSON.parse(result[1]) };
    if (result[0] === -1) throw new GuildError('Guild capacity has been reached. Migration was not performed.');
    if (result[0] === -2) throw new GuildError('The good-job guild URL is already in use. Nothing was imported.', 409);
    if (result[0] === -3) throw new GuildError('The original roster or split data contains invalid JSON. Nothing was imported.');
    if (result[0] !== 1) throw new GuildError('The migration could not be completed.');
    return { alreadyMigrated: false, guild: publicGuild(meta), key, recoveryCode, memberCount: result[1], splitCount: result[2] };
  }
  throw new GuildError('The migration URL could not be reserved. Please try again.');
}