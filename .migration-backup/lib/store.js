// Persistence: Upstash Redis (REST) when configured, otherwise a local JSON file for dev.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = 'roster:v1';
const SEEDED_KEY = 'roster:v1:seeded';

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const usingRedis = Boolean(url && token);
// On Vercel the filesystem is read-only and per-instance, so the file fallback is dev-only.
export const storageMissing = !usingRedis && Boolean(process.env.VERCEL);

async function redis(cmd) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Redis: ${data.error}`);
  return data.result;
}

const FILE = fileURLToPath(new URL('../.data/roster.json', import.meta.url));

async function readFile() {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    return { seeded: false, members: {} };
  }
}

async function writeFile(db) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(db, null, 2));
}

export async function getAll() {
  if (usingRedis) {
    const flat = (await redis(['HGETALL', KEY])) || [];
    const out = [];
    for (let i = 0; i < flat.length; i += 2) out.push(JSON.parse(flat[i + 1]));
    return out;
  }
  return Object.values((await readFile()).members);
}

export async function get(id) {
  if (usingRedis) {
    const raw = await redis(['HGET', KEY, id]);
    return raw ? JSON.parse(raw) : null;
  }
  return (await readFile()).members[id] || null;
}

export async function put(member) {
  if (usingRedis) return redis(['HSET', KEY, member.id, JSON.stringify(member)]);
  const db = await readFile();
  db.members[member.id] = member;
  await writeFile(db);
}

export async function remove(id) {
  if (usingRedis) return redis(['HDEL', KEY, id]);
  const db = await readFile();
  delete db.members[id];
  await writeFile(db);
}

// Seeds once; never re-seeds after officers delete entries.
export async function seedOnce(members) {
  if (usingRedis) {
    const first = await redis(['SET', SEEDED_KEY, '1', 'NX']);
    if (first !== 'OK') return;
    const args = members.flatMap((m) => [m.id, JSON.stringify(m)]);
    if (args.length) await redis(['HSET', KEY, ...args]);
    return;
  }
  const db = await readFile();
  if (db.seeded) return;
  db.seeded = true;
  for (const m of members) db.members[m.id] = m;
  await writeFile(db);
}
