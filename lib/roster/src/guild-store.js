import { GuildError } from './guild-redis.js';

export const GUILD_TTL_SECONDS = 180 * 24 * 60 * 60;
const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const key = (id, suffix) => `guild:${id}:${suffix}`;

// Execute writes and expiry refresh atomically. An expired guild cannot be
// resurrected by an in-flight request, and the member ceiling holds concurrently.
const WRITE = `
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
local meta = cjson.decode(redis.call('GET', KEYS[1]))
if meta.keyVersion ~= tonumber(ARGV[8]) then return -4 end
if meta.faction ~= ARGV[9] then return -5 end
if ARGV[1] == 'member' and redis.call('HEXISTS', KEYS[2], ARGV[2]) == 0
  and redis.call('HLEN', KEYS[2]) >= 100 then return -2 end
local value = ARGV[3]
if ARGV[1] == 'member' then
  local raw = redis.call('HGET', KEYS[2], ARGV[2])
  local revision = 0
  if raw then revision = cjson.decode(raw)._revision or 0 end
  if ARGV[7] ~= 'any' then
    local expected = tonumber(ARGV[7])
    if (raw and (expected < 0 or expected ~= revision))
      or (not raw and expected >= 0) then return -3 end
  end
  -- Do not cjson.encode character records: empty JSON arrays become objects.
  -- The server passes compact object JSON with the internal revision stripped.
  value = string.sub(value, 1, -2) .. ',"_revision":' .. tostring(revision + 1) .. '}'
end
if ARGV[1] == 'remove' then
  redis.call('HDEL', KEYS[2], ARGV[2])
else
  redis.call('HSET', KEYS[2], ARGV[2], value)
end
for i = 1, 4 do redis.call('EXPIRE', KEYS[i], ARGV[4]) end
redis.call('ZADD', KEYS[5], ARGV[5], ARGV[6])
return 1
`;

function parse(raw) {
  if (raw === null || raw === undefined) return null;
  try { return JSON.parse(raw); } catch {
    throw new GuildError('Stored guild data could not be read. Please try again shortly.');
  }
}

export function publicGuild(meta) {
  return {
    id: meta.id, name: meta.name, slug: meta.slug, faction: meta.faction,
    donationDismissed: Boolean(meta.donationDismissed),
  };
}

export function createGuildRepository(redis) {
  async function getGuild(id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) return null;
    const meta = parse(await redis.command(['GET', key(id, 'meta')]));
    if (!meta) return null;
    if (meta.id !== id || typeof meta.slug !== 'string' || !SLUG_RE.test(meta.slug) ||
        !['horde', 'alliance'].includes(meta.faction) || !Number.isSafeInteger(meta.keyVersion) || meta.keyVersion < 1) {
      throw new GuildError('Stored guild settings could not be read.');
    }
    return meta;
  }

  async function findGuild(slug) {
    if (typeof slug !== 'string' || slug.length > 100 || !SLUG_RE.test(slug)) return null;
    const id = await redis.command(['GET', `guild:slug:${slug}`]);
    const meta = id ? await getGuild(id) : null;
    return meta?.slug === slug ? meta : null;
  }

  // Only server-authenticated metadata may bind a protected repository.
  // Routes must call authenticate(), never scope(req.body.guildId).
  function scope(meta) {
    if (!meta || typeof meta.id !== 'string' || !ID_RE.test(meta.id) ||
        typeof meta.slug !== 'string' || !SLUG_RE.test(meta.slug)) throw new GuildError('Invalid guild context.', 401);
    const id = meta.id;
    const metaKey = key(id, 'meta');
    const membersKey = key(id, 'members');
    const splitsKey = key(id, 'splits');
    const slugKey = `guild:slug:${meta.slug}`;

    async function getAll(hashKey) {
      const flat = await redis.command(['HGETALL', hashKey]) || [];
      if (!Array.isArray(flat) || flat.length % 2) throw new GuildError('Stored guild data could not be read.');
      const records = [];
      for (let i = 1; i < flat.length; i += 2) records.push(parse(flat[i]));
      return records;
    }

    async function write(hashKey, operation, recordId, value = '', expectedRevision = 'any') {
      if (typeof recordId !== 'string' || !recordId || recordId.length > 128) throw new GuildError('Invalid record ID.', 400);
      const other = hashKey === membersKey ? splitsKey : membersKey;
      const result = await redis.command([
        'EVAL', WRITE, 5, metaKey, hashKey, other, slugKey, 'guild:index',
        operation, recordId, value, GUILD_TTL_SECONDS, Math.floor(Date.now() / 1000) + GUILD_TTL_SECONDS, id, expectedRevision, meta.keyVersion, meta.faction,
      ]);
      if (result === -1) throw new GuildError('This guild has expired or was removed.', 401);
      if (result === -2) throw new GuildError('Roster is full — the limit is 100 members. Existing entries can still be edited or removed.', 403);
      if (result === -3) throw new GuildError('That entry changed while saving. Refresh the roster and try again; no changes were overwritten.', 409);
      if (result === -4) throw new GuildError('The guild key changed. Sign in again before saving.', 401);
      if (result === -5) throw new GuildError('The guild faction changed. Refresh the roster before saving.', 409);
      if (result !== 1) throw new GuildError('Guild storage could not save the change.');
    }

    return {
      id, guild: publicGuild(meta), usingRedis: true, storageMissing: false,
      // Tenant stores never seed survey data: creation and migration are explicit.
      seedOnce: async () => {},
      getAll: () => getAll(membersKey),
      get: async (memberId) => parse(await redis.command(['HGET', membersKey, memberId])),
      put: (member, { expectedRevision = 'any' } = {}) => {
        const { _revision, ...record } = member;
        return write(membersKey, 'member', record.id, JSON.stringify(record), expectedRevision);
      },
      remove: (memberId) => write(membersKey, 'remove', memberId),
      splits: {
        getAll: () => getAll(splitsKey),
        put: (setup) => write(splitsKey, 'split', setup.id, JSON.stringify(setup)),
        remove: (setupId) => write(splitsKey, 'remove', setupId),
      },
    };
  }

  async function authenticate(cookieHeader, sessions) {
    const session = sessions.read(cookieHeader);
    if (!session) throw new GuildError('Enter your guild key to continue.', 401);
    const meta = await getGuild(session.guildId);
    if (!meta || meta.keyVersion !== session.keyVersion) {
      throw new GuildError('Your guild session has expired. Enter the current guild key to continue.', 401);
    }
    return { meta, store: scope(meta) };
  }

  return { getGuild, findGuild, scope, authenticate };
}