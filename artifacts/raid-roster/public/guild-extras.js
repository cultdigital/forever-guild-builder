// Presentation helpers: privacy page, landing demo, donation prompt.
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function privacyPage(root) {
  const p = el('section', 'panel prose');
  p.append(el('p', 'eyebrow', 'Forever Guild Builder'), el('h1', null, 'Privacy'));
  const sections = [
    ['What is stored', [
      'Per guild: its name, faction and settings, plus each roster entry: character names, class, spec, race, alternates, professions, notes and timestamps. All of it is stored in Redis.',
      'Please avoid personal information in notes. Anyone with the guild key can read them.',
    ]],
    ['Keys and sessions', [
      'The guild key and recovery code are stored only as salted scrypt hashes. The plaintext is shown once when created and cannot be shown again.',
      'Signing in sets a signed, Secure, HttpOnly cookie that lasts 30 days.',
    ]],
    ['Expiry', [
      'A guild expires after 180 days without writes. Reading does not extend the expiry.',
    ]],
    ['Abuse protection', [
      'To limit abuse, we keep identifiers derived from your IP address using an HMAC, with counters that expire within 24 hours. The raw address is not kept for this.',
    ]],
    ['What we do not collect', [
      'No emails and no personal accounts.',
      'Your browser localStorage holds only a guild-specific split-view preference. It never holds credentials.',
    ]],
    ['External services', [
      'Fonts are loaded from Google Fonts. New guild creation uses Cloudflare Turnstile, which receives the information needed for its bot check. Their own privacy policies apply to those requests.',
    ]],
  ];
  sections.forEach(([h, ps]) => {
    p.append(el('h2', null, h));
    ps.forEach((t) => p.append(el('p', null, t)));
  });
  const a = el('a', 'link-btn', 'Back to home');
  a.href = '/';
  p.append(a);
  root.replaceChildren(p);
}

const DEMO = [
  ['Tanks', 'tank', [['Demo Tank', '#c79c6e', 'Protection Warrior', 'MT']]],
  ['Healers', 'healer', [['Demo Healer', '#f58cba', 'Holy Paladin', '']]],
  ['DPS', 'dps', [['Demo DPS', '#fff569', 'Combat Rogue', '']]],
];

export function demoPanel() {
  const p = el('section', 'panel demo');
  p.setAttribute('aria-label', 'Example of the roster');
  p.append(el('p', 'eyebrow', 'Example only'), el('h2', null, 'What your roster looks like'));
  p.append(el('p', 'hint', 'A non-interactive demo with invented characters. It is not a real guild.'));
  DEMO.forEach(([title, role, plates]) => {
    const g = el('div', 'raid-group g-' + role);
    const head = el('div', 'rg-head');
    head.append(el('h3', null, title), el('span', 'rg-count', String(plates.length)));
    const frames = el('div', 'frames');
    plates.forEach(([name, color, spec, tag]) => {
      const plate = el('div', 'plate');
      plate.style.setProperty('--c', color);
      const bar = el('div', 'plate-bar');
      bar.append(el('span', 'plate-name', name));
      const asg = el('span', 'plate-asg');
      if (tag) asg.append(el('span', 'asg asg-mt', tag));
      bar.append(asg);
      const body = el('div', 'plate-body');
      const line = el('div', 'plate-line');
      const item = el('span', 'pl-item');
      item.append(el('span', 'pl-label', 'Main'), el('span', 'pl-spec', spec));
      line.append(item);
      body.append(line);
      plate.append(bar, body);
      frames.append(plate);
    });
    g.append(head, frames);
    p.append(g);
  });
  return p;
}

// Shown only when roster has more than 20 members and the server pref is not dismissed.
export function updateDonation(rosterRoot, detail, patchGuild) {
  const old = rosterRoot.querySelector('.donate-prompt');
  if (old) old.remove();
  const guild = detail && detail.guild;
  if (!guild || !(detail.count > 20) || guild.donationDismissed) return;
  const box = el('aside', 'donate-prompt');
  box.append(el('p', null, 'Your guild has grown past twenty members. If Forever Guild Builder helps, you can support it. Nothing is locked either way.'));
  const row = el('div', 'donate-row');
  const give = el('a', 'btn small primary', 'Support on Ko-fi');
  give.href = 'https://ko-fi.com/cultdigital';
  give.target = '_blank';
  give.rel = 'noopener noreferrer';
  const dismiss = el('button', 'btn small ghost', 'Dismiss');
  dismiss.type = 'button';
  const err = el('span', 'form-msg error');
  err.setAttribute('role', 'alert');
  dismiss.onclick = async () => {
    dismiss.disabled = true;
    err.textContent = '';
    try {
      await patchGuild({ donationDismissed: true });
      box.remove();
    } catch (e) {
      err.textContent = e.message;
      dismiss.disabled = false;
    }
  };
  row.append(give, dismiss, err);
  box.append(row);
  const banner = rosterRoot.querySelector('.banner');
  if (banner) banner.after(box);
}
