import { createRedisClient, GuildError } from './guild-redis.js';
import { createSessionManager, verifyGuildCredential } from './guild-sessions.js';
import { createGuildRepository, publicGuild } from './guild-store.js';
import { createGuildLimits } from './guild-limits.js';
import { handle } from './handler.js';
import { handleSplits } from './split-handler.js';
import { createGuildManagement, validateGuildName } from './guild-management.js';
import { getFactionData, RACES, ALLIANCE_RACES } from './data.js';

export function createGuildApi({ env = process.env, redis = createRedisClient({ env }), sessions = createSessionManager({ secret: env.SESSION_SECRET || null }), fetchImpl = fetch } = {}) {
  const repository = createGuildRepository(redis);
  const limits = createGuildLimits(redis, {
    secret: env.SESSION_SECRET,
    // Replit supplies the proxy chain; use only its appended/rightmost address.
    // Standalone servers ignore forwarding headers unless explicitly opted in.
    trustProxy: env.TRUST_PROXY === '1' || (env.TRUST_PROXY !== '0' && Boolean(env.REPL_ID)),
  });
  const management = createGuildManagement(redis, { env, fetchImpl });
  const pending = new Map();

  async function serialize(id, work) {
    const request = (pending.get(id) || Promise.resolve()).then(work);
    const settled = request.catch(() => {});
    pending.set(id, settled);
    try { return await request; } finally {
      if (pending.get(id) === settled) pending.delete(id);
    }
  }

  return async function api({ req, pathname, body = {}, query = {} }) {
    if (pathname === '/api/healthz' && req.method === 'GET') return { status: 200, json: { status: 'ok' } };
    if (pathname === '/api/config' && req.method === 'GET') return {
      status: 200,
      json: {
        storageConfigured: redis.configured,
        sessionsConfigured: typeof env.SESSION_SECRET === 'string' && Buffer.byteLength(env.SESSION_SECRET) >= 32,
        creationEnabled: management.creationConfigured(),
        turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
      },
    };
    if (pathname === '/api/session' && req.method === 'DELETE') {
      return { status: 200, json: { ok: true }, cookie: sessions.clear() };
    }
    if (pathname === '/api/guilds' && req.method === 'POST') {
      if (!management.creationConfigured()) throw new GuildError('Guild creation is waiting for Redis storage and Turnstile bot-protection setup.');
      await limits.create(req);
      await management.verifyTurnstile(body.turnstileToken, new URL(req.headers.origin).hostname);
      const result = await management.create(body);
      return { status: 201, cookie: sessions.issue(result.meta), json: { guild: publicGuild(result.meta), key: result.key, recoveryCode: result.recoveryCode } };
    }

    redis.requireConfigured();
    sessions.requireSecret();
    if (pathname === '/api/session' && req.method === 'POST') {
      // Resolve only an authentication candidate; no protected data is returned
      // until the credential has been verified.
      const guild = await repository.findGuild(body.slug);
      await limits.attempts(req, guild?.id);
      if (!guild || !await verifyGuildCredential(body.key, guild.keyHash, guild.salt)) {
        throw new GuildError('That guild URL or key is not valid.', 401);
      }
      return { status: 200, json: { guild: publicGuild(guild) }, cookie: sessions.issue(guild) };
    }
    if (pathname === '/api/guild/recover' && req.method === 'POST') {
      const meta = await repository.findGuild(body.slug);
      await limits.attempts(req, meta?.id);
      if (!meta) throw new GuildError('That guild URL or recovery code is not valid.', 401);
      await limits.write(meta.id);
      const result = await management.rotate(meta, body, true);
      return { status: 200, cookie: sessions.issue(result.meta), json: { guild: result.guild, key: result.key } };
    }

    const { meta, store } = await repository.authenticate(req.headers.cookie, sessions);
    if (req.method === 'GET') await limits.read(req);
    else await limits.write(meta.id);
    if (pathname === '/api/guild' && req.method === 'GET') return { status: 200, json: { guild: publicGuild(meta) } };
    if (pathname === '/api/guild' && ['PATCH', 'POST'].includes(req.method)) {
      if (body.expectedGuildId !== undefined && body.expectedGuildId !== meta.id) {
        throw new GuildError('You are signed in to a different guild. Reload before saving settings.', 409);
      }
      const patch = {};
      if (Object.hasOwn(body, 'name')) patch.name = validateGuildName(body.name);
      if (Object.hasOwn(body, 'faction')) {
        if (!['horde', 'alliance'].includes(body.faction)) throw new GuildError('Choose Horde or Alliance.', 400);
        patch.faction = body.faction;
      }
      if (Object.hasOwn(body, 'donationDismissed')) {
        if (body.donationDismissed !== true) throw new GuildError('Invalid donation preference.', 400);
        patch.donationDismissed = true;
      }
      if (!Object.keys(patch).length) throw new GuildError('No guild settings were supplied.', 400);
      const updated = await management.update(meta, patch);
      const invalidRaces = [];
      if (patch.faction && patch.faction !== meta.faction) {
        const { classes } = getFactionData(patch.faction);
        for (const member of await store.getAll()) {
          const race = member.main?.race;
          if (race && !classes[member.main.class]?.races.includes(race)) {
            invalidRaces.push({ name: member.name, race: (RACES[race] || ALLIANCE_RACES[race])?.label || race });
          }
        }
      }
      return { status: 200, json: { guild: publicGuild(updated), invalidRaces } };
    }
    if (pathname === '/api/guild/rotate' && req.method === 'POST') {
      await limits.attempts(req, meta.id);
      const result = await management.rotate(meta, body);
      // No replacement cookie: all old sessions, including this one, are revoked.
      return { status: 200, cookie: sessions.clear(), json: { guild: result.guild, key: result.key } };
    }
    if (pathname === '/api/guild' && req.method === 'DELETE') {
      await limits.attempts(req, meta.id);
      await management.remove(meta, body);
      return { status: 200, cookie: sessions.clear(), json: { ok: true } };
    }
    if (pathname === '/api/roster' || pathname === '/api/roster/splits') {
      return serialize(meta.id, async () => {
        const output = pathname === '/api/roster'
          ? await handle({ method: req.method, body, query, store })
          : await handleSplits({ method: req.method, body, query, roster: store, splits: store.splits });
        if (output.status === 200 && req.method === 'GET') output.json.guild = publicGuild(meta);
        return output;
      });
    }
    throw new GuildError('That endpoint does not exist.', 404);
  };
}