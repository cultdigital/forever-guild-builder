import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFactionTheme, applyGuildIdentity } from '../../artifacts/raid-roster/public/guild-identity.js';

function dom(t, mounted = true) {
  const previous = globalThis.document;
  const elements = { name: {}, label: {}, crest: {} };
  globalThis.document = {
    documentElement: { dataset: {} },
    getElementById: () => mounted ? elements.name : null,
    querySelector: (selector) => mounted ? selector.includes('eyebrow') ? elements.label : elements.crest : null,
  };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  return { elements, root: globalThis.document.documentElement };
}

test('header uses current guild name and refreshes faction label and crest', (t) => {
  const { elements, root } = dom(t);
  applyGuildIdentity({ name: 'Stormwind Raiders', faction: 'alliance' });
  assert.equal(elements.name.textContent, '<Stormwind Raiders>');
  assert.equal(root.dataset.faction, 'alliance');
  assert.equal(elements.label.textContent, 'World of Warcraft: Forever · Alliance');
  assert.equal(elements.crest.src, '/icons/alliance-crest.png');
  assert.equal(elements.crest.alt, 'Alliance crest');
  applyGuildIdentity({ name: 'Durotar Squad', faction: 'horde' });
  assert.equal(elements.name.textContent, '<Durotar Squad>');
  assert.equal(root.dataset.faction, 'horde');
  assert.equal(elements.crest.src, '/icons/inv_bannerpvp_01.webp');
});

test('guild names stay literal text rather than HTML', (t) => {
  const { elements } = dom(t);
  Object.defineProperty(elements.name, 'innerHTML', { set: () => { throw new Error('Unsafe name rendering'); } });
  applyGuildIdentity({ name: '<Test & Guild>', faction: 'alliance' });
  assert.equal(elements.name.textContent, '<<Test & Guild>>');
});

test('faction selection themes screens even before guild markup mounts', (t) => {
  const { root } = dom(t, false);
  applyFactionTheme('alliance');
  assert.equal(root.dataset.faction, 'alliance');
  applyGuildIdentity({ name: 'Guild', faction: 'horde' });
  assert.equal(root.dataset.faction, 'horde');
});
