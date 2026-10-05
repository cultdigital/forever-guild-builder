import { GuildError } from './guild-redis.js';
import { GUILD_TTL_SECONDS, createGuildRepository, publicGuild } from './guild-store.js';

const RENAME = `
-- RENAME_GUILD_SLUG: administrative operation, never a public route
local raw = redis.call('GET', KEYS[1])
if not raw then return -1 end
if raw ~= ARGV[1] then return -3 end
local owner = redis.call('GET', KEYS[2])
if owner and owner ~= ARGV[3] then return -2 end
for i = 7, #KEYS do
  local aliasOwner = redis.call('GET', KEYS[i])
  if aliasOwner and aliasOwner ~= ARGV[3] then return -2 end
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
for i = 7, #KEYS do redis.call('SET', KEYS[i], ARGV[3], 'EX', ARGV[4]) end
redis.call('EXPIRE', KEYS[3], ARGV[4])
redis.call('EXPIRE', KEYS[4], ARGV[4])
redis.call('ZADD', KEYS[5], ARGV[5], ARGV[3])
if ARGV[6] ~= '' then redis.call('SET', KEYS[6], ARGV[6]) end
return 1
`;

// Explicit administrative use only. Preserves credentials, ID, records and sessions.
export async function renameGuildSlug(redis, id, slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
    throw new GuildError('Use a lowercase guild URL with letters, numbers and hyphens.', 400);
  }
  const meta = await createGuildRepository(redis).getGuild(id);
  if (!meta) throw new GuildError('Guild not found.', 404);
  if (meta.slug === slug) return publicGuild(meta);
  const raw = await redis.command(['GET', `guild:${id}:meta`]);
  // Re-read against the exact bytes being compared by Lua to prevent lost settings.
  const latest = raw ? JSON.parse(raw) : null;
  if (!latest || latest.id !== id || latest.slug !== meta.slug || latest.keyVersion !== meta.keyVersion) throw new GuildError('Guild changed. Retry the URL update.', 409);
  const aliases = [...new Set([...(latest.slugAliases || []), latest.slug])].filter((alias) => alias !== slug);
  if (aliases.length > 10) throw new GuildError('Too many previous guild URLs.', 400);
  const updated = { ...latest, slug, slugAliases: aliases, updatedAt: new Date().toISOString() };
  const markerKey = 'guild:migration:good-job';
  const markerRaw = await redis.command(['GET', markerKey]);
  const marker = markerRaw ? JSON.parse(markerRaw) : null;
  const markerValue = marker?.id === id ? JSON.stringify({ ...marker, slug }) : '';
  const keys = [`guild:${id}:meta`, `guild:slug:${slug}`, `guild:${id}:members`, `guild:${id}:splits`,
    'guild:index', markerKey, ...aliases.map((alias) => `guild:slug:${alias}`)];
  const result = await redis.command(['EVAL', RENAME, keys.length, ...keys,
    raw, JSON.stringify(updated), id, GUILD_TTL_SECONDS, Math.floor(Date.now() / 1000) + GUILD_TTL_SECONDS, markerValue]);
  if (result === -2) throw new GuildError('That guild URL is already in use. Nothing was changed.', 409);
  if (result === -1 || result === -3) throw new GuildError('Guild changed or expired. Retry the URL update.', 409);
  if (result !== 1) throw new GuildError('The guild URL could not be updated.');
  return publicGuild(updated);
}