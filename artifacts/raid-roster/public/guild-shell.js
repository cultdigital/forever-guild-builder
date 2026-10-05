import { privacyPage, demoPanel } from '/guild-extras.js';
import { applyFactionTheme, applyGuildIdentity } from '/guild-identity.js';
import { saveGuildDetails } from '/guild-settings.js';
const root = document.getElementById('shell-root');
const rosterRoot = document.getElementById('roster-root');
const bar = document.getElementById('shell-bar');
const barMsg = document.getElementById('shell-bar-msg');
let appLoaded = false;
let guardOn = false;
// Volatile only: never write guild keys to browser storage or cookies.
let enteredGuildKey = null;
const keyVisibility = new WeakMap();

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const guard = (e) => { if (guardOn) { e.preventDefault(); e.returnValue = ''; } };
window.addEventListener('beforeunload', guard);

async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts });
  let body = null;
  try { body = await res.json(); } catch (error) {
    if (error instanceof TypeError || error.name === 'AbortError') throw error;
    throw new Error('The server returned an unreadable response. Reload and check your saved settings.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('The server returned an unreadable response. Reload and check your saved settings.');
  }
  if (!res.ok) {
    const err = new Error((body && body.error) || 'Request failed (' + res.status + ')');
    err.status = res.status;
    throw err;
  }
  return body;
}
const send = (method, path, data) => api(path, { method, body: JSON.stringify(data || {}) });

function panel(eyebrow, title, target = root) {
  const p = el('section', 'panel');
  p.append(el('p', 'eyebrow', eyebrow), el('h1', null, title));
  target.replaceChildren(p);
  return p;
}
const notice = (text, err) => el('p', 'shell-notice' + (err ? ' err' : ''), text);
const link = (href, text, cls) => { const a = el('a', cls || 'link-btn', text); a.href = href; return a; };
function btn(text, cls, onclick, type) {
  const b = el('button', 'btn ' + (cls || ''), text);
  b.type = type || 'button';
  if (onclick) b.onclick = onclick;
  return b;
}
function factionRadios(name, selected, onChange) {
  const group = el('fieldset', 'faction-radios');
  group.append(el('legend', 'label', 'Faction'));
  const choices = el('div', 'faction-options');
  [['horde', 'Horde'], ['alliance', 'Alliance']].forEach(([value, text]) => {
    const label = el('label', 'faction-option');
    const input = el('input');
    Object.assign(input, { type: 'radio', name, value, checked: selected === value });
    input.addEventListener('change', () => {
      if (input.checked) onChange(value);
    });
    label.append(input, el('span', null, text));
    choices.append(label);
  });
  group.append(choices);
  return group;
}
function field(form, id, labelText, props) {
  const l = el('label', 'label', labelText);
  l.htmlFor = id;
  const i = el('input');
  Object.assign(i, { id, autocomplete: 'off', ...props });
  if (i.type === 'password') {
    i.spellcheck = false;
    i.autocapitalize = 'none';
    i.setAttribute('autocorrect', 'off');
    const row = el('div', 'key-input-row');
    const setVisible = (showing) => {
      i.type = showing ? 'text' : 'password';
      toggle.textContent = showing ? 'Hide key' : 'Show key';
      toggle.setAttribute('aria-pressed', String(showing));
    };
    const toggle = btn('Show key', 'small ghost', () => {
      setVisible(i.type === 'password');
    });
    keyVisibility.set(i, setVisible);
    toggle.setAttribute('aria-controls', id);
    toggle.setAttribute('aria-pressed', 'false');
    row.append(i, toggle);
    form.append(l, row);
  } else {
    form.append(l, i);
  }
  return i;
}
function msgLine() {
  const m = el('p', 'form-msg error');
  m.setAttribute('role', 'alert');
  return m;
}
// Runs fn while disabling the button; shows errors inline and restores the button.
async function run(button, msg, fn) {
  const label = button.textContent;
  button.disabled = true;
  msg.textContent = '';
  msg.className = 'form-msg error';
  try { await fn(); } catch (e) { msg.textContent = e.message; }
  button.disabled = false;
  button.textContent = label;
}
function copyText(text, button) {
  const old = button.textContent;
  const done = (ok) => { button.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { button.textContent = old; }, 1800); };
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => done(true), () => done(false));
}
function parseGuildRef(raw) {
  const t = raw.trim();
  const slugRe = /^[a-z0-9][a-z0-9-]{0,62}$/;
  if (slugRe.test(t)) return '/g/' + t;
  try {
    const u = new URL(t);
    const m = u.pathname.match(/^\/g\/([a-z0-9][a-z0-9-]{0,62})\/?$/);
    if (m) return '/g/' + m[1] + (/^#k=[^#\s]+$/.test(u.hash) ? u.hash : '');
  } catch { /* invalid */ }
  return null;
}

function showError(msg) {
  const p = panel('Something went wrong', 'The guild hall is closed');
  p.append(notice(msg, true), btn('Try again', 'primary', () => location.reload()), link('/', 'Back to home'));
}

/* ---------- one-time credentials ---------- */
function showCredentials({ guild, key, recoveryCode, heading, intro, continueHref, continueText }) {
  if (guild) applyGuildIdentity(guild);
  guardOn = true;
  window.guildCredentialDisplay = true;
  const p = panel('Shown once', heading);
  p.append(el('p', null, intro));
  p.append(notice('Save these now. Plaintext credentials are shown only once; the server stores only their hashes. If you lose both the guild key and the recovery code, the guild cannot be recovered.', true));
  const lines = [];
  const row = (label, value) => {
    const box = el('div', 'cred');
    box.append(el('span', 'label', label), el('code', 'cred-val', value));
    const c = btn('Copy', 'small ghost', (e) => copyText(value, e.currentTarget));
    box.append(c);
    p.append(box);
    lines.push(label + ': ' + value);
  };
  if (guild) lines.push('Guild: ' + guild.name, 'Address: ' + location.origin + '/g/' + guild.slug);
  row('Guild key', key);
  if (recoveryCode) row('Recovery code', recoveryCode);
  const text = lines.join('\n') + '\n';
  const actions = el('div', 'form-actions');
  let saved = false;
  const go = btn(continueText || 'Continue', 'primary', () => { guardOn = false; location.assign(continueHref); });
  go.disabled = true;
  const dl = btn('Download .txt', null, () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = el('a');
    a.href = url;
    a.download = (guild ? guild.slug : 'guild') + '-credentials.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  actions.append(dl, go);
  const lab = el('label', 'check');
  const cb = el('input');
  cb.type = 'checkbox';
  cb.onchange = () => { saved = cb.checked; go.disabled = !saved; };
  lab.append(cb, el('span', null, 'I have copied or downloaded these credentials.'));
  p.append(lab, actions);
}

/* ---------- home + creation ---------- */
function loadTurnstile() {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const s = el('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Bot protection failed to load. Check your connection and try again.'));
    document.head.append(s);
  });
}

function creationPanel(cfg) {
  const p = el('section', 'panel');
  p.append(el('p', 'eyebrow', 'New guild'), el('h2', null, 'Found a guild'));
  const enabled = !!cfg.creationEnabled && !!cfg.turnstileSiteKey;
  if (!enabled) p.append(notice('Guild creation is disabled. It awaits storage, session and bot-protection (Turnstile) configuration on the server.'));
  const form = el('form');
  const fs = el('fieldset', 'shell-fs');
  fs.disabled = !enabled;
  const name = field(fs, 'g-name', 'Guild name', { required: true, minLength: 2, maxLength: 24, placeholder: '2 to 24 characters' });
  const fac = { value: 'horde' };
  const radios = factionRadios('guild-creation-faction', fac.value, (value) => {
    fac.value = value;
    applyFactionTheme(value);
  });
  const ts = el('div', 'ts-box');
  const go = btn('Create guild', 'primary', null, 'submit');
  const err = msgLine();
  fs.append(radios, ts, go);
  form.append(fs, err);
  p.append(form);
  let token = null, wid = null;
  if (enabled) {
    loadTurnstile().then(() => {
      wid = window.turnstile.render(ts, {
        sitekey: cfg.turnstileSiteKey, action: 'create-guild',
        callback: (t) => { token = t; }, 'expired-callback': () => { token = null; }, 'error-callback': () => { token = null; },
      });
    }).catch((e) => { err.textContent = e.message; });
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    if (!enabled) return;
    if (!token) { err.textContent = 'Complete the bot-protection check first.'; return; }
    run(go, err, async () => {
      go.textContent = 'Creating...';
      try {
        const r = await send('POST', '/api/guilds', { name: name.value.trim(), faction: fac.value, turnstileToken: token });
        showCredentials({
          guild: r.guild, key: r.key, recoveryCode: r.recoveryCode, heading: 'Your guild is founded',
          intro: r.guild.name + ' is ready. You are signed in on this browser. Share the four-word guild key with your members.',
          continueHref: '/g/' + encodeURIComponent(r.guild.slug),
        });
      } catch (x) {
        token = null;
        if (wid != null && window.turnstile) window.turnstile.reset(wid);
        throw x;
      }
    });
  };
  return p;
}

async function home() {
  const p = panel('World of Warcraft: Forever', 'Forever Guild Builder');
  p.append(el('p', null, 'A private raid roster for your guild. Open it with your invite link or guild slug, then enter the four-word key.'));
  const form = el('form');
  const input = field(form, 'slug', 'Invite URL or guild slug', { required: true, maxLength: 300, placeholder: 'your-guild' });
  const fmsg = msgLine();
  form.append(btn('Open guild', 'primary', null, 'submit'), fmsg);
  form.onsubmit = (e) => {
    e.preventDefault();
    const dest = parseGuildRef(input.value);
    if (dest) location.assign(dest);
    else { fmsg.textContent = 'Enter a lowercase guild slug or a full invite URL.'; }
  };
  p.append(form);
  const status = el('div');
  p.append(status);
  try {
    const cfg = await api('/api/config');
    if (!cfg.storageConfigured || !cfg.sessionsConfigured) status.append(notice('Storage setup is unavailable. Guilds cannot be opened until storage and sessions are configured.', true));
    const more = el('details', 'shell-det shell-more');
    more.append(el('summary', null, 'Found a new guild or preview the roster'));
    more.append(creationPanel(cfg), demoPanel());
    root.append(more);
  } catch (e) {
    status.append(notice('Could not read server configuration: ' + e.message, true));
  }
}

/* ---------- login + recovery ---------- */
async function enter(slug, key) {
  const { guild } = await send('POST', '/api/session', { slug, key });
  enteredGuildKey = { guildId: guild.id, key };
  history.replaceState(null, '', '/g/' + guild.slug + location.search);
  return guild;
}

function login(slug, msg) {
  const p = panel('Private guild', 'Enter the guild key');
  p.append(el('p', 'muted', 'Guild: ' + slug));
  if (msg) p.append(notice(msg, true));
  const form = el('form');
  const input = field(form, 'key', 'Four-word guild key', { type: 'password', required: true });
  const go = btn('Enter', 'primary', null, 'submit');
  const err = msgLine();
  form.append(go, err);
  form.onsubmit = (e) => {
    e.preventDefault();
    run(go, err, async () => { const guild = await enter(slug, input.value.trim()); await roster(guild); });
  };
  p.append(form);

  const det = el('details', 'shell-det');
  det.append(el('summary', null, 'Lost the key? Use the recovery code'));
  const rf = el('form');
  const rc = field(rf, 'rc', 'Recovery code', { required: true });
  const rb = btn('Recover guild', null, null, 'submit');
  const re = msgLine();
  rf.append(rb, re);
  rf.onsubmit = (e) => {
    e.preventDefault();
    run(rb, re, async () => {
      const r = await send('POST', '/api/guild/recover', { slug, recoveryCode: rc.value.trim() });
      showCredentials({
        guild: r.guild, key: r.key, heading: 'New guild key',
        intro: 'Recovery worked. The old key no longer works and all old sessions were revoked, so every member needs the new key.',
        continueHref: '/g/' + encodeURIComponent(r.guild.slug), continueText: 'Continue to sign in',
      });
    });
  };
  det.append(rf);
  p.append(det, link('/', 'Back to home'));
  input.focus();
}

/* ---------- settings ---------- */
function settingsSection(guild) {
  const wrap = el('div', 'shell-settings');
  const card = (title, hint) => {
    const c = el('div', 'panel');
    c.append(el('h2', null, title));
    if (hint) c.append(el('p', 'hint', hint));
    wrap.append(c);
    return c;
  };
  const keyField = (f, id) => field(f, id, 'Current guild key', { type: 'password', required: true });

  // details
  const d = card('Guild details', null);
  const df = el('form');
  const nm = field(df, 's-name', 'Guild name', { value: guild.name, required: true, minLength: 2, maxLength: 24 });
  const fac = { value: String(guild.faction).toLowerCase() };
  const radios = factionRadios('guild-settings-faction', fac.value, (value) => {
    fac.value = value;
    document.documentElement.dataset.factionPreview = value;
    applyGuildIdentity(window.guildContext || guild);
  });
  df.append(radios, el('p', 'hint', 'Faction colours preview now; Save applies them. Characters with a race from the other faction are listed after saving.'));
  const ds = btn('Save changes', 'primary', null, 'submit');
  const dm = msgLine();
  const out = el('div');
  df.append(ds, dm, out);
  df.onsubmit = (e) => {
    e.preventDefault();
    run(ds, dm, async () => {
      const r = await saveGuildDetails(api, window.guildContext || guild, { name: nm.value.trim(), faction: fac.value });
      window.guildContext = r.guild;
      delete document.documentElement.dataset.factionPreview;
      applyGuildIdentity(r.guild);
      const bad = r.invalidRaces || [];
      const done = () => {
        guardOn = false;
        out.replaceChildren();
        dm.className = 'form-msg success';
        dm.textContent = 'Guild details saved.';
        // Refresh roster data without discarding the in-memory sign-in key.
        document.dispatchEvent(new CustomEvent('guild-settings-saved'));
      };
      if (r.confirmedAfterReconnect) {
        out.replaceChildren(notice('Saved. The connection dropped before character checks were returned. Reload the roster to use the saved faction.'));
        out.append(btn('Reload roster', 'primary', done));
        return;
      }
      if (!bad.length) return done();
      out.replaceChildren(notice('Saved. These characters now have a race that does not fit the faction. Ask them to update their sign-up:'));
      const ul = el('ul', 'shell-list');
      bad.forEach((b) => ul.append(el('li', null, b.name + ' (' + b.race + ')')));
      out.append(ul, btn('Reload roster', 'primary', done));
    });
  };
  d.append(df);

  // invite
  const knownKey = enteredGuildKey?.guildId === guild.id ? enteredGuildKey.key : '';
  const iv = card('Invite access', knownKey
    ? 'Key filled in for this page session only; never saved in browser storage.'
    : 'Enter the current guild key to show it or copy an invite link. The server keeps only a hash and cannot recover it.');
  const ifm = el('form');
  const ik = field(ifm, 's-ikey', 'Current guild key', { type: 'password', required: true, value: knownKey, placeholder: 'Enter your guild key' });
  const ib = btn('Copy invite link', null, null, 'submit');
  const im = msgLine();
  ifm.append(ib, im);
  ifm.onsubmit = (e) => {
    e.preventDefault();
    run(ib, im, async () => {
      const key = ik.value.trim();
      await send('POST', '/api/session', { slug: guild.slug, key });
      const url = location.origin + '/g/' + guild.slug + '#k=' + encodeURIComponent(key);
      await navigator.clipboard.writeText(url);
      keyVisibility.get(ik)(false);
      im.className = 'form-msg success';
      im.textContent = 'Invite link copied. Anyone with it can enter the guild.';
    });
  };
  iv.append(ifm);

  // export
  const ex = card('Export roster', 'Download the roster as CSV.');
  ex.append(btn('Export CSV', null, () => { const o = document.getElementById('export-csv'); if (o) o.click(); }));

  // rotate
  const adv = el('details', 'shell-det danger-det');
  adv.append(el('summary', null, 'Credentials and deletion'));
  wrap.append(adv);
  const ro = card('Rotate guild key', 'Creates a new key and signs out every session, including yours. Confirm with the current key or recovery code.');
  const rf = el('form');
  const rk = field(rf, 's-rkey', 'Current guild key', { type: 'password' });
  const rr = field(rf, 's-rrec', 'or recovery code', {});
  const rb = btn('Rotate key', 'danger', null, 'submit');
  const rm = msgLine();
  rf.append(rb, rm);
  rf.onsubmit = (e) => {
    e.preventDefault();
    const body = {};
    if (rk.value.trim()) body.key = rk.value.trim();
    else if (rr.value.trim()) body.recoveryCode = rr.value.trim();
    else { rm.textContent = 'Enter the current key or the recovery code.'; return; }
    run(rb, rm, async () => {
      const r = await send('POST', '/api/guild/rotate', body);
      showCredentials({
        guild: r.guild, key: r.key, heading: 'New guild key',
        intro: 'The key was rotated. All old sessions, including this one, were revoked.',
        continueHref: '/g/' + encodeURIComponent(r.guild.slug), continueText: 'Continue to sign in',
      });
      bar.hidden = true;
      rosterRoot.replaceChildren();
    });
  };
  ro.append(rf);

  // delete
  const de = card('Delete guild', null);
  de.classList.add('danger-zone');
  adv.append(ro, de);
  de.append(notice('This permanently deletes the guild and every roster entry. It cannot be undone.', true));
  const dform = el('form');
  const dk = keyField(dform, 's-dkey');
  const dc = field(dform, 's-dconf', 'Type the guild name exactly: ' + guild.name, { required: true });
  const db = btn('Delete guild forever', 'danger', null, 'submit');
  const dmsg = msgLine();
  dform.append(db, dmsg);
  dform.onsubmit = (e) => {
    e.preventDefault();
    if (dc.value !== guild.name) { dmsg.textContent = 'The typed name does not match the guild name.'; return; }
    run(db, dmsg, async () => {
      await send('DELETE', '/api/guild', { key: dk.value.trim(), confirmation: dc.value });
      location.replace('/');
    });
  };
  de.append(dform);
  return wrap;
}

function addSettingsTab(guild) {
  const tabs = rosterRoot.querySelector('.tabs');
  const main = rosterRoot.querySelector('main');
  if (!tabs || !main) return;
  const a = el('a', null, 'Settings');
  a.href = '#settings';
  a.setAttribute('role', 'tab');
  a.dataset.tab = 'settings';
  tabs.append(a);
  const sec = el('section', 'tab-panel');
  sec.id = 'tab-settings';
  sec.hidden = true;
  sec.append(settingsSection(guild));
  main.append(sec);
}

/* ---------- roster ---------- */
async function roster(guild) {
  const res = await fetch('/assets/roster.html', { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Could not load the roster (' + res.status + ')');
  rosterRoot.innerHTML = await res.text(); // trusted first-party markup
  window.guildContext = guild;
  applyGuildIdentity(guild);
  window.addEventListener('hashchange', () => applyGuildIdentity(window.guildContext));
  addSettingsTab(guild);
  root.replaceChildren();
  bar.hidden = false;
  const header = rosterRoot.querySelector('.banner');
  if (header) header.before(bar);
  if (!appLoaded) {
    appLoaded = true;
    await import('/assets/app.js');
  }
}

document.getElementById('logout-btn').onclick = async (e) => {
  const b = e.currentTarget;
  b.disabled = true;
  barMsg.textContent = '';
  try {
    await send('DELETE', '/api/session');
    enteredGuildKey = null;
    location.replace('/');
  } catch (x) {
    barMsg.textContent = 'Log out failed: ' + x.message;
    b.disabled = false;
  }
};

async function boot() {
  if (location.pathname.replace(/\/$/, '') === '/privacy') return privacyPage(root);
  const m = location.pathname.match(/^\/g\/([^/]+)\/?$/);
  if (!m) return home();
  const slug = decodeURIComponent(m[1]);
  root.replaceChildren(el('div', 'shell-skel'));
  let cfg;
  try { cfg = await api('/api/config'); } catch (e) { return showError(e.message); }
  if (!cfg.storageConfigured || !cfg.sessionsConfigured) {
    const p = panel('Setup required', 'Storage is not set up');
    p.append(notice('Storage setup is unavailable, so this guild cannot be opened yet.', true));
    return;
  }
  let data = null;
  try { data = await api('/api/guild'); } catch (e) { if (e.status !== 401) return showError(e.message); }
  if (data && data.guild && (data.guild.slug === slug || data.guild.slugAliases?.includes(slug))) {
    if (data.guild.slug !== slug) history.replaceState(null, '', '/g/' + data.guild.slug + location.search + location.hash);
    try { return await roster(data.guild); } catch (e) { return showError(e.message); }
  }
  const frag = location.hash.match(/^#k=(.+)$/);
  if (frag) {
    try {
      const guild = await enter(slug, decodeURIComponent(frag[1]));
      return await roster(guild);
    } catch (e) {
      history.replaceState(null, '', location.pathname + location.search);
      return login(slug, 'The invite link did not work: ' + e.message);
    }
  }
  login(slug, data && data.guild ? 'You are signed in to a different guild. Enter this guild key to continue.' : '');
}

boot();
