import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import http from 'node:http';

// Exercise local and Redis adapters in fresh processes without touching guild data.
const root = path.resolve(import.meta.dirname, '../..');
if (!process.argv[2]) {
  const hashes = new Map();
  const strings = new Map();
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const [command, key, ...args] = JSON.parse(raw);
    const hash = hashes.get(key) || new Map();
    let result;
    if (command === 'SET') {
      result = strings.has(key) ? null : 'OK';
      strings.set(key, args[0]);
    } else if (command === 'HSET') {
      for (let i = 0; i < args.length; i += 2) hash.set(args[i], args[i + 1]);
      hashes.set(key, hash);
      result = 1;
    } else if (command === 'HGETALL') result = [...hash.entries()].flat();
    else if (command === 'HGET') result = hash.get(args[0]) || null;
    else if (command === 'HDEL') result = Number(hash.delete(args[0]));
    else throw new Error(`Unexpected command ${command}`);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ result }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const mode of ['local', 'redis', 'missing']) {
      const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'raid-splits-'));
      try {
        const env = { ...process.env, NODE_ENV: mode === 'missing' ? 'production' : 'test' };
        // Never use a real Redis service in regression tests.
        delete env.KV_REST_API_URL;
        delete env.KV_REST_API_TOKEN;
        env.UPSTASH_REDIS_REST_URL = mode === 'redis' ? `http://127.0.0.1:${server.address().port}` : '';
        env.UPSTASH_REDIS_REST_TOKEN = mode === 'redis' ? 'test-only' : '';
        const child = spawn(process.execPath, [import.meta.filename, mode], { cwd: temp, env, stdio: 'inherit' });
        const code = await new Promise(resolve => child.on('exit', resolve));
        assert.equal(code, 0, `${mode} checks failed`);
      } finally {
        await fs.rm(temp, { recursive: true, force: true });
      }
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
} else {
  const mode = process.argv[2];
  const load = file => import(pathToFileURL(path.join(root, 'lib/roster/src', file)));
  const { handle } = await load('handler.js');
  const { handleSplits } = await load('split-handler.js');
  const store = await load('store.js');
  const call = (method, body, query) => handleSplits({ method, body, query });
  if (mode === 'missing') {
    assert.equal((await call('GET')).json.storage, 'missing');
    assert.equal((await call('POST', {})).status, 503);
    assert.equal((await handle({ method: 'POST', body: {} })).status, 503);
  } else {
    const roster = (await handle({ method: 'GET' })).json.members;
    const memberId = roster[0].id;
    const before = JSON.stringify(await store.getAll());
    let saved;
    for (const [count, size] of [[2, 10], [2, 20], [5, 20], [10, 10], [2, 40]]) {
      const response = await call('POST', {
        name: `${count}x${size}`,
        teams: Array.from({ length: count }, (_, i) => ({
          id: `team-${i}`, name: `Team ${i + 1}`, size, memberIds: i === 0 ? [memberId] : [],
        })),
      });
      assert.equal(response.status, 200);
      saved = response.json.setup;
      assert.equal(saved.teams.length, count);
    }
    assert.equal(JSON.stringify(await store.getAll()), before, 'Saving splits changed the roster');
    assert.equal((await call('GET')).json.setups.length, 5);
    assert.equal((await call('POST', { name: saved.name, teams: saved.teams })).status, 409);
    saved.memberRoles = { [memberId]: 'healer' };
    assert.equal((await call('POST', saved)).status, 200);
    assert.deepEqual((await call('GET')).json.setups.find(s => s.id === saved.id).memberRoles, saved.memberRoles);
    assert.equal(JSON.stringify(await store.getAll()), before, 'Raid role choices changed the main roster');
    for (const memberRoles of [null, [], { [memberId]: 'warden' }, { 'other-guild-member': 'tank' }]) {
      assert.equal((await call('POST', { ...saved, memberRoles })).status, 400);
    }
    const olderClient = { ...saved };
    delete olderClient.memberRoles;
    assert.deepEqual((await call('POST', olderClient)).json.setup.memberRoles, saved.memberRoles, 'Older clients erased saved raid roles');
    const otherSetup = (await call('GET')).json.setups.find(s => s.id !== saved.id);
    assert.deepEqual(otherSetup.memberRoles, {}, 'Role choices leaked into another setup');
    assert.deepEqual((await call('POST', { ...saved, memberRoles: {} })).json.setup.memberRoles, {});
    assert.equal((await call('POST', saved)).status, 200);
    const duplicate = structuredClone(saved);
    duplicate.teams[1].memberIds = [memberId];
    assert.equal((await call('POST', duplicate)).status, 400);
    const invalid = structuredClone(saved);
    invalid.teams[0].memberIds = ['removed-member'];
    assert.equal((await call('POST', invalid)).status, 400);
    invalid.teams[0].memberIds = [];
    invalid.teams[0].size = 30;
    assert.equal((await call('POST', invalid)).status, 400);
    const tooLarge = { name: 'Too large', teams: Array.from({ length: 3 }, (_, i) => ({ id: `t${i}`, name: `T${i}`, size: 40, memberIds: [] })) };
    assert.equal((await call('POST', tooLarge)).status, 400);
    const tooFull = structuredClone(saved);
    tooFull.teams[0].size = 10;
    tooFull.teams[0].memberIds = roster.slice(0, 11).map(m => m.id);
    assert.equal((await call('POST', tooFull)).status, 400);
    saved.name = 'Renamed setup';
    saved.teams[0].memberIds = [];
    saved.teams[1].memberIds = [memberId];
    assert.equal((await call('POST', saved)).status, 200);
    assert.deepEqual((await call('GET')).json.setups.find(s => s.id === saved.id).teams[1].memberIds, [memberId]);
    await store.remove(memberId);
    assert.deepEqual((await call('GET')).json.setups.find(s => s.id === saved.id).teams[1].memberIds, []);
    assert.deepEqual((await call('GET')).json.setups.find(s => s.id === saved.id).memberRoles, {});
    assert.equal((await call('DELETE', undefined, { id: saved.id })).status, 200);
    assert.equal((await call('POST', saved)).status, 404);
    // Fill an isolated store to the limit, preserving valid existing seed entries.
    const template = roster[1];
    for (let i = (await store.getAll()).length; i < 100; i++) {
      await store.put({ ...template, id: `fixture-${i}`, name: `Fixture ${i}` });
    }
    const input = { name: 'Overflow', main: { class: 'warrior', spec: 'protection', race: 'orc' } };
    assert.equal((await handle({ method: 'POST', body: input })).status, 403);
    assert.equal((await handle({ method: 'POST', body: { id: template.id, notes: 'Edit at capacity' } })).status, 200);
    assert.equal((await handle({ method: 'DELETE', query: { id: template.id } })).status, 200);
    assert.equal((await handle({ method: 'POST', body: input })).status, 200);
    assert.equal((await store.getAll()).length, 100);
  }
  console.log(`PASS: split API, ${mode} storage${mode !== 'missing' ? ', presets, validation, CRUD, stale assignments, and 100-member cap' : ' read-only behavior'}.`);
}