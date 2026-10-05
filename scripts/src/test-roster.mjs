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
  assert.deepEqual(errors, []);
  console.log('PASS: signup, alternates, professions, inline edit, reload persistence, filters, CSV, composition, mobile layout, delete.');
} finally {
  if (id) await page.request.delete(`/api/roster?id=${encodeURIComponent(id)}`);
  // Clean up a created test entry even when an assertion failed before its ID was read.
  const data = await (await page.request.get('/api/roster')).json();
  for (const m of data.members.filter(m => m.name === name || m.name === `${name}a`)) {
    await page.request.delete(`/api/roster?id=${encodeURIComponent(m.id)}`);
  }
  await browser.close();
}