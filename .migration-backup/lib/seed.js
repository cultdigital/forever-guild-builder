// Initial roster from the guild survey spreadsheet.
const rows = [
  ['Bravo', 'priest', 'shadow'],
  ['Star', 'paladin', 'holy'],
  ['Proxy', 'rogue', ''],
  ['Cybro', 'warrior', 'protection'],
  ['Dand', 'mage', ''],
  ['Youngy', 'rogue', ''],
  ['Dread', 'warlock', ''],
  ['JDog', 'hunter', ''],
  ['Kralz', 'shaman', 'enhancement'],
  ['Maeror', 'warrior', 'fury'],
  ['Squier', 'paladin', 'protection'],
  ['War', 'druid', 'feralbear', [{ class: 'druid', spec: 'feralcat', will: 'keen' }], 'flex'], // feral OT / DPS flex
  ['Thot', 'paladin', ''],
  ['Nufan', 'priest', 'holy'],
  ['Nuddy', 'hunter', ''],
  ['Helisaar', 'warlock', ''],
  ['Tyrael', 'priest', 'holy'],
  ['Dru', 'shaman', 'restoration'],
  ['Kets', 'warlock', ''],
  ['Ink', 'hunter', ''],
];

export const SEED = rows.map(([name, cls, spec, alts = [], assignment = null]) => ({
  id: name.toLowerCase(),
  name,
  main: { class: cls, spec: spec || null, race: cls === 'paladin' ? 'undead' : null },
  alts,
  assignment,
  notes: '',
  updatedAt: '2026-10-05T00:00:00.000Z',
}));
