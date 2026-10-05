import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.TEST_BASE_URL || 'http://localhost:80';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium',
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ baseURL, acceptDownloads: true });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const name = `Porttest${Date.now().toString().replace(/\d/g, d => String.fromCharCode(97 + Number(d)))}`;
let id;
let secondId;
const setupIds = [];
try {
  await page.goto('/');
  await page.locator('#headline-stats').filter({ hasText: 'signed up' }).waitFor();
  assert.ok((await page.request.get('/api/roster')).ok());
  await page.fill('#f-name', name);
  await page.click('[data-main-class="warrior"]');
  await page.click('[data-main-spec="protection"]');
  await page.click('[data-main-race="orc"]');
  await page.click('#add-alt');
  await page.click('[data-alt-class="mage"]');
  await page.click('[data-alt-spec="frost"]');
  await page.click('[data-form-prof="herbalism"]');
  await page.fill('#f-notes', 'Migration browser test');
  await page.click('#submit-btn');
  await page.locator('#form-msg').filter({ hasText: 'on the roster' }).waitFor();
  const roster = await (await page.request.get('/api/roster')).json();
  const member = roster.members.find(m => m.name === name);
  assert.ok(member);
  id = member.id;
  assert.equal(member.main.race, 'orc');
  assert.equal(member.alts[0].class, 'mage');
  assert.deepEqual(member.professions, ['herbalism']);
  await page.click('[data-tab="roster"]');
  await page.fill('#search', name);
  await page.locator('#raid-frames').filter({ hasText: name }).waitFor();
  await page.click(`#raid-frames [data-pen="name"][data-id="${id}"]`);
  await page.fill('#pop-name', `${name}a`);
  await page.locator('#pop-name-form').evaluate(form => form.requestSubmit());
  await page.locator('#toast').filter({ hasText: 'Saved' }).waitFor();
  await page.reload();
  await page.locator('#headline-stats').filter({ hasText: 'signed up' }).waitFor();
  await page.fill('#search', `${name}a`);
  await page.locator('#raid-frames').filter({ hasText: `${name}a` }).waitFor();
  await page.click('[data-role="tank"]');
  assert.ok((await page.locator('#raid-frames').textContent()).includes(`${name}a`));
  const downloadPromise = page.waitForEvent('download');
  await page.click('#export-csv');
  assert.equal((await downloadPromise).suggestedFilename(), 'horde-roster.csv');
  await page.click('[data-tab="comp"]');
  await page.click('[data-size="40"]');
  assert.equal(await page.locator('[data-size="40"]').getAttribute('aria-checked'), 'true');
  await page.locator('#class-grid .class-card').first().waitFor();
  // Saved split setup journeys, with only test-created records mutated.
  const secondResponse = await page.request.post('/api/roster', {
    data: { name: `${name}b`, main: { class: 'mage', spec: 'frost', race: 'troll' } },
  });
  assert.ok(secondResponse.ok());
  secondId = (await secondResponse.json()).member.id;
  await page.reload();
  await page.locator('#headline-stats').filter({ hasText: 'signed up' }).waitFor();
  await page.click('[data-tab="splits"]');
  await page.locator('#split-presets').waitFor();
  const saveSplit = async () => {
    const response = page.waitForResponse(r => r.url().endsWith('/api/roster/splits') && r.request().method() === 'POST');
    await page.click('#split-save');
    const result = await response;
    assert.ok(result.ok(), await result.text());
    const setup = (await result.json()).setup;
    await page.locator('#split-dirty').waitFor({ state: 'hidden' });
    return setup;
  };
  let split;
  for (const [preset, count, size] of [['2x10', 2, 10], ['2x20', 2, 20], ['5x20', 5, 20], ['10x10', 10, 10], ['2x40', 2, 40]]) {
    await page.click(`[data-sp-preset="${preset}"]`);
    await page.fill('#split-name', `${name} ${preset}`);
    assert.equal(await page.locator('.sp-team').count(), count);
    const setup = await saveSplit();
    setupIds.push(setup.id);
    assert.ok(setup.teams.every(t => t.size === size));
    if (preset === '2x10') split = setup;
  }
  await page.click(`[data-sp-open="${split.id}"]`);
  const [teamA, teamB] = split.teams.map(t => t.id);
  await page.fill(`[data-sp-team-name="${teamA}"]`, 'Alpha');
  await page.locator(`select[data-sp-move="${id}"]`).selectOption(teamA);
  await page.locator(`select[data-sp-move="${secondId}"]`).selectOption(teamB);
  split = await saveSplit();
  assert.deepEqual(split.teams[0].memberIds, [id]);
  assert.deepEqual(split.teams[1].memberIds, [secondId]);
  await page.click('[data-tab="comp"]');
  await page.selectOption('#scope-setup', split.id);
  assert.equal(await page.locator('[data-size="10"]').getAttribute('aria-checked'), 'true');
  assert.equal(await page.locator('#role-cards .rc-num b').first().textContent(), '1');
  assert.equal(await page.locator('#tank-frames .plate').count(), 1);
  const herbalism = page.locator('#professions .prof-card').filter({ hasText: 'Herbalism' });
  assert.equal(await herbalism.locator('.prof-count').textContent(), '1');
  await page.selectOption('#scope-team', teamB);
  assert.equal(await page.locator('#tank-frames .plate').count(), 0);
  assert.equal(await page.locator('#role-cards .rc-num b').first().textContent(), '0');
  assert.equal(await page.locator('#role-cards .rc-num b').nth(2).textContent(), '1');
  assert.equal(await herbalism.locator('.prof-count').textContent(), '0');
  assert.ok((await page.locator('#insights').textContent()).includes('1 of 1'));
  await page.reload();
  await page.locator('#scope-note').filter({ hasText: '1 of' }).waitFor();
  assert.equal(await page.locator('#scope-team').inputValue(), teamB);
  assert.equal(await page.locator('[data-size="10"]').getAttribute('aria-checked'), 'true');
  await page.click('[data-tab="splits"]');
  await page.click(`[data-sp-open="${split.id}"]`);
  await page.locator(`select[data-sp-move="${id}"]`).selectOption(teamB);
  split = await saveSplit();
  assert.deepEqual(split.teams[0].memberIds, []);
  assert.equal(split.teams[1].memberIds.filter(memberId => memberId === id).length, 1);
  await page.locator(`select[data-sp-move="${id}"]`).selectOption('');
  await page.fill('#split-name', `${name} renamed`);
  await page.selectOption(`[data-sp-size="${teamA}"]`, '20');
  split = await saveSplit();
  assert.equal(split.teams[0].size, 20);
  assert.ok(!split.teams.flatMap(t => t.memberIds).includes(id));
  await page.click('[data-tab="comp"]');
  await page.selectOption('#scope-setup', '');
  const all = (await (await page.request.get('/api/roster')).json()).members;
  const roleTotal = (await page.locator('#role-cards .rc-num b').allTextContents()).reduce((sum, n) => sum + Number(n), 0);
  assert.equal(roleTotal, all.length, 'Whole roster composition changed');
  await page.click('[data-tab="splits"]');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  for (const setupId of setupIds) {
    page.once('dialog', dialog => dialog.accept());
    await page.click(`[data-sp-delete="${setupId}"]`);
    await page.locator(`[data-setup-id="${setupId}"]`).waitFor({ state: 'detached' });
  }
  setupIds.length = 0;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-tab="signup"]');
  await page.locator('#signup-form').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await page.fill('#f-name', `${name}a`);
  await page.click(`[data-edit="${id}"]`);
  page.once('dialog', dialog => dialog.accept());
  await page.click('#delete-btn');
  await page.locator('#form-msg').filter({ hasText: 'Removed' }).waitFor();
  const after = await (await page.request.get('/api/roster')).json();
  assert.ok(!after.members.some(m => m.id === id));
  id = undefined;
  // Verify the full-roster UI without filling or changing the real guild.
  let capacityMembers = Array.from({ length: 100 }, (_, i) => ({
    ...all[0], id: `capacity-${i}`,
    name: `Capacity${String.fromCharCode(97 + Math.floor(i / 26), 97 + i % 26)}`,
    main: { class: 'warrior', spec: 'protection', race: 'orc' }, alts: [], professions: [],
  }));
  await page.route('**/api/roster', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({ json: { members: capacityMembers, storage: 'local' } });
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      assert.ok(body.id, 'Full roster UI attempted a new signup');
      const index = capacityMembers.findIndex(m => m.id === body.id);
      capacityMembers[index] = { ...capacityMembers[index], ...body };
      return route.fulfill({ json: { member: capacityMembers[index] } });
    }
    return route.abort();
  });
  await page.route('**/api/roster?id=*', async route => {
    const fixtureId = new URL(route.request().url()).searchParams.get('id');
    capacityMembers = capacityMembers.filter(m => m.id !== fixtureId);
    return route.fulfill({ json: { ok: true } });
  });
  await page.reload();
  await page.locator('#headline-stats').filter({ hasText: '100' }).waitFor();
  assert.equal(await page.locator('#submit-btn').isDisabled(), true);
  await page.fill('#f-name', 'Capacityaa');
  await page.click('[data-edit="capacity-0"]');
  assert.equal(await page.locator('#submit-btn').isEnabled(), true);
  await page.fill('#f-notes', 'Edit remains available at 100');
  await page.click('#submit-btn');
  await page.locator('#form-msg').filter({ hasText: 'Saved' }).waitFor();
  page.once('dialog', dialog => dialog.accept());
  await page.click('#delete-btn');
  await page.locator('#form-msg').filter({ hasText: 'removed' }).waitFor();
  assert.equal(await page.locator('#submit-btn').isEnabled(), true);
  await page.unroute('**/api/roster');
  await page.unroute('**/api/roster?id=*');
  assert.deepEqual(errors, []);
  console.log('PASS: roster regression, all split presets, setup CRUD, assignment/move/unassign, independent composition, persistence, mobile layout, full-roster signup/edit/delete UI.');
} finally {
  await page.unroute('**/api/roster');
  await page.unroute('**/api/roster?id=*');
  for (const setupId of setupIds) await page.request.delete(`/api/roster/splits?id=${encodeURIComponent(setupId)}`);
  if (secondId) await page.request.delete(`/api/roster?id=${encodeURIComponent(secondId)}`);
  if (id) await page.request.delete(`/api/roster?id=${encodeURIComponent(id)}`);
  // Clean up a created test entry even when an assertion failed before its ID was read.
  const data = await (await page.request.get('/api/roster')).json();
  for (const m of data.members.filter(m => m.name === name || m.name === `${name}a` || m.name === `${name}b`)) {
    await page.request.delete(`/api/roster?id=${encodeURIComponent(m.id)}`);
  }
  await browser.close();
}