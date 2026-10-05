import { createRedisClient } from '../../lib/roster/src/guild-redis.js';

// Semantic Redis REST fixture for service tests. Intentionally injectable only
// through test constructors, never enabled by a development/environment flag.
export function createGuildFixture() {
  const strings = new Map(), hashes = new Map(), indexes = new Map(), expires = new Map();
  const commands = [];
  let now = Math.floor(Date.now() / 1000);
  function expire(k, ttl) { if (strings.has(k) || hashes.has(k)) expires.set(k, now + Number(ttl)); }
  function del(k) { strings.delete(k); hashes.delete(k); expires.delete(k); }
  function reap() { for (const [k, expiry] of expires) if (expiry <= now) del(k); }
  function zadd(k, score, member) {
    if (!indexes.has(k)) indexes.set(k, new Map());
    indexes.get(k).set(member, Number(score));
  }
  function hash(k) { if (!hashes.has(k)) hashes.set(k, new Map()); return hashes.get(k); }
  const redis = createRedisClient({
    env: { KV_REST_API_URL: 'https://redis-fixture.invalid', KV_REST_API_TOKEN: 'fixture-not-a-secret' },
    fetchImpl: async (_url, opts) => {
      reap();
      const args = JSON.parse(opts.body);
      commands.push(args);
      const [cmd, k, ...rest] = args;
      let result;
      if (cmd === 'GET') result = strings.get(k) ?? null;
      else if (cmd === 'HGETALL') result = [...(hashes.get(k) || new Map()).entries()].flat();
      else if (cmd === 'HGET') result = hashes.get(k)?.get(rest[0]) ?? null;
      else if (cmd === 'HSET') {
        for (let i = 0; i < rest.length; i += 2) hash(k).set(rest[i], rest[i + 1]);
        result = 1;
      } else if (cmd === 'SET') {
        if (rest.includes('NX') && strings.has(k)) result = null;
        else { strings.set(k, rest[0]); result = 'OK'; }
      } else if (cmd === 'EVAL') {
        const script = k, n = Number(rest[0]), keys = rest.slice(1, n + 1), argv = rest.slice(n + 1);
        if (script.includes('MIGRATE_GOOD_JOB')) {
          if (strings.has(keys[5])) result = [0, strings.get(keys[5])];
          else {
            const index = indexes.get(keys[4]) || new Map();
            for (const [id, score] of index) if (score <= Number(argv[2])) index.delete(id);
            indexes.set(keys[4], index);
            if (index.size >= Number(argv[3])) result = [-1];
            else if (strings.has(keys[0]) || strings.has(keys[3])) result = [-2];
            else {
              const originals = hashes.get(keys[6]);
              const members = originals?.size ? new Map(originals) : new Map(JSON.parse(argv[4]));
              const splits = new Map(hashes.get(keys[7]) || []);
              const meta = JSON.parse(argv[0]);
              strings.set(keys[0], argv[0]); strings.set(keys[3], meta.id);
              hashes.set(keys[1], members); if (splits.size) hashes.set(keys[2], splits);
              keys.slice(0, 4).forEach((key) => expire(key, argv[1]));
              zadd(keys[4], Number(argv[2]) + Number(argv[1]), meta.id);
              strings.set(keys[5], JSON.stringify({ id: meta.id, slug: meta.slug }));
              result = [1, members.size, splits.size];
            }
          }
        } else if (script.includes("redis.call('INCR'")) {
          result = Number(strings.get(keys[0]) || 0) + 1;
          strings.set(keys[0], result);
          if (result === 1) expire(keys[0], argv[0]);
        } else if (script.includes('ZREMRANGEBYSCORE')) {
          const index = indexes.get(keys[2]) || new Map();
          for (const [id, score] of index) if (score <= Number(argv[2])) index.delete(id);
          indexes.set(keys[2], index);
          if (index.size >= Number(argv[3])) result = -1;
          else if (strings.has(keys[0]) || strings.has(keys[1])) result = -2;
          else {
            strings.set(keys[0], argv[0]); strings.set(keys[1], argv[4]);
            expire(keys[0], argv[1]); expire(keys[1], argv[1]);
            zadd(keys[2], Number(argv[2]) + Number(argv[1]), argv[4]);
            result = 1;
          }
        } else if (script.includes('local patch =')) {
          const raw = strings.get(keys[0]);
          if (!raw) result = -1;
          else {
            const meta = JSON.parse(raw);
            if (meta.keyVersion !== Number(argv[0])) result = -2;
            else {
              Object.assign(meta, JSON.parse(argv[1]), { updatedAt: argv[4] });
              result = JSON.stringify(meta); strings.set(keys[0], result);
              keys.slice(0, 4).forEach((key) => expire(key, argv[2]));
              zadd(keys[4], Number(argv[3]) + Number(argv[2]), meta.id);
            }
          }
        } else if (script.includes("redis.call('ZREM'")) {
          const raw = strings.get(keys[0]);
          if (!raw) result = -1;
          else if (JSON.parse(raw).keyVersion !== Number(argv[0])) result = -2;
          else { keys.slice(0, 4).forEach(del); indexes.get(keys[4])?.delete(argv[1]); result = 1; }
        } else if (script.includes('HEXISTS')) {
          if (!strings.has(keys[0])) result = -1;
          else if (JSON.parse(strings.get(keys[0])).keyVersion !== Number(argv[7])) result = -4;
          else if (JSON.parse(strings.get(keys[0])).faction !== argv[8]) result = -5;
          else {
            const members = hash(keys[1]);
            if (argv[0] === 'member' && !members.has(argv[1]) && members.size >= 100) result = -2;
            else {
              let value = argv[2];
              if (argv[0] === 'member') {
                const raw = members.get(argv[1]), revision = raw ? JSON.parse(raw)._revision || 0 : 0;
                const expected = argv[6];
                if (expected !== 'any' && ((raw && (Number(expected) < 0 || Number(expected) !== revision)) || (!raw && Number(expected) >= 0))) {
                  return Response.json({ result: -3 });
                }
                value = JSON.stringify({ ...JSON.parse(value), _revision: revision + 1 });
              }
              if (argv[0] === 'remove') members.delete(argv[1]);
              else members.set(argv[1], value);
              keys.slice(0, 4).forEach((key) => expire(key, argv[3]));
              zadd(keys[4], argv[4], argv[5]);
              result = 1;
            }
          }
        } else throw new Error('Unsupported fixture script');
      } else throw new Error(`Unsupported fixture command: ${cmd}`);
      return Response.json({ result });
    },
  });
  return { redis, commands, strings, hashes, indexes, expires, get now() { return now; }, advance: (seconds) => { now += seconds; reap(); } };
}