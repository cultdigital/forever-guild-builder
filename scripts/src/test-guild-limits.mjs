import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuildFixture } from './guild-fixture.mjs';
import { createGuildLimits } from '../../lib/roster/src/guild-limits.js';

const secret = 'test-fixture-counter-secret-32-bytes-minimum';
const request = (address, forwarded) => ({ socket: { remoteAddress: address }, headers: { 'x-forwarded-for': forwarded } });

test('write limit allows 60 per guild per minute; counters expire and are isolated', async () => {
  const f = createGuildFixture(), limits = createGuildLimits(f.redis, { secret });
  for (let i = 0; i < 60; i++) await limits.write('alpha');
  await assert.rejects(limits.write('alpha'), { status: 429 });
  await limits.write('beta');
  f.advance(61);
  await limits.write('alpha');
});

test('read limit allows 300 per IP per minute without persisting raw addresses', async () => {
  const f = createGuildFixture(), limits = createGuildLimits(f.redis, { secret });
  const req = request('192.0.2.10');
  for (let i = 0; i < 300; i++) await limits.read(req);
  await assert.rejects(limits.read(req), { status: 429 });
  assert.ok(![...f.strings.keys()].join(' ').includes('192.0.2.10'));
  await limits.read(request('192.0.2.11'));
  f.advance(61);
  await limits.read(req);
});

test('login and recovery share 5/min and 20/hour per IP and per guild', async () => {
  const f = createGuildFixture(), limits = createGuildLimits(f.redis, { secret });
  for (let minute = 0; minute < 4; minute++) {
    for (let i = 0; i < 5; i++) await limits.attempts(request('192.0.2.10'), 'alpha');
    if (minute === 0) await assert.rejects(limits.attempts(request('192.0.2.11'), 'alpha'), { status: 429 });
    f.advance(61);
  }
  await assert.rejects(limits.attempts(request('192.0.2.10'), 'alpha'), { status: 429 });
  f.advance(3600);
  await limits.attempts(request('192.0.2.10'), 'alpha');
});

test('caller-supplied forwarding headers cannot change an untrusted connection IP', async () => {
  const f = createGuildFixture(), limits = createGuildLimits(f.redis, { secret });
  for (let i = 0; i < 3; i++) await limits.create(request('192.0.2.10', `spoof-${i}`));
  await assert.rejects(limits.create(request('192.0.2.10', '192.0.2.99')), { status: 429 });
});

test('trusted proxies use the appended rightmost valid IP, not a spoofed prefix', async () => {
  const f = createGuildFixture(), limits = createGuildLimits(f.redis, { secret, trustProxy: true });
  for (let i = 0; i < 3; i++) await limits.create(request('127.0.0.1', `192.0.2.${i}, 192.0.2.10`));
  await assert.rejects(limits.create(request('127.0.0.1', '192.0.2.99, 192.0.2.10')), { status: 429 });
  await limits.create(request('127.0.0.1', '192.0.2.11'));
});