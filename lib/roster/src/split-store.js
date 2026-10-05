// Independent persistence: never overwrite the original roster or seed marker.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { usingRedis } from './store.js';

const KEY = 'roster:v1:splits';
const FILE = path.resolve(process.cwd(), '.data/splits.json');
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(command) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`Split storage failed (${response.status})`);
  const data = await response.json();
  if (data.error) throw new Error('Split storage command failed');
  return data.result;
}

async function read() {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function write(data) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const temp = `${FILE}.tmp`;
  await fs.writeFile(temp, JSON.stringify(data, null, 2));
  await fs.rename(temp, FILE);
}

export async function getAll() {
  if (!usingRedis) return Object.values(await read());
  const values = await redis(['HGETALL', KEY]) || [];
  const setups = [];
  for (let i = 1; i < values.length; i += 2) setups.push(JSON.parse(values[i]));
  return setups;
}

export async function put(setup) {
  if (usingRedis) return redis(['HSET', KEY, setup.id, JSON.stringify(setup)]);
  const data = await read();
  data[setup.id] = setup;
  await write(data);
}

export async function remove(id) {
  if (usingRedis) return redis(['HDEL', KEY, id]);
  const data = await read();
  delete data[id];
  await write(data);
}