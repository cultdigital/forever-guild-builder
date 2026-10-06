// Shared game data for WoW: Forever (Horde). Imported by the browser app and the API.
// Race/class combos per Wowhead + Mobalytics WoW: Forever guides (Sept 2026).

export const GUILD_NAME = 'Good Job';

export const ROLES = {
  tank: { label: 'Tank', icon: 'ability_warrior_defensivestance', color: '#4a90d9' },
  healer: { label: 'Healer', icon: 'spell_holy_flashheal', color: '#3fbf6f' },
  dps: { label: 'DPS', icon: 'ability_dualwield', color: '#d9534a' },
};

export const RACES = {
  orc: { label: 'Orc', icon: 'racial_orc_berserkerstrength' },
  tauren: { label: 'Tauren', icon: 'ability_warstomp' },
  troll: { label: 'Troll', icon: 'racial_troll_berserk' },
  undead: { label: 'Undead', icon: 'spell_shadow_raisedead' },
  skyborne: { label: 'Skyborne', icon: 'achievement_raidprimalist_windelemental', isNew: true },
};

export const ALLIANCE_RACES = {
  human: { label: 'Human', icon: 'spell_holy_holyprotection' },
  dwarf: { label: 'Dwarf', icon: 'spell_shadow_unholystrength' },
  nightelf: { label: 'Night Elf', icon: 'ability_racial_shadowmeld' },
  gnome: { label: 'Gnome', icon: 'inv_gnometoy' },
  skyborne: RACES.skyborne,
};

// Authoritative faction tables supplied for Forever Guild Builder.
export const FACTION_CLASSES = {
  horde: {
    orc: ['warrior', 'hunter', 'mage', 'rogue', 'warlock', 'shaman'],
    tauren: ['warrior', 'hunter', 'druid', 'shaman'],
    troll: ['warrior', 'hunter', 'mage', 'rogue', 'priest', 'warlock', 'shaman'],
    undead: ['warrior', 'mage', 'rogue', 'priest', 'warlock', 'paladin'],
    skyborne: ['warrior', 'hunter', 'rogue', 'druid', 'shaman'],
  },
  alliance: {
    human: ['warrior', 'hunter', 'mage', 'rogue', 'priest', 'warlock', 'paladin'],
    dwarf: ['warrior', 'hunter', 'rogue', 'priest', 'paladin', 'shaman'],
    nightelf: ['warrior', 'hunter', 'rogue', 'priest', 'druid'],
    gnome: ['warrior', 'mage', 'rogue', 'priest', 'warlock'],
    skyborne: ['warrior', 'hunter', 'rogue', 'mage', 'druid'],
  },
};

// Official class colours. Specs: [id, label, role, icon]
export const CLASSES = {
  warrior: {
    label: 'Warrior', color: '#C69B6D',
    races: ['orc', 'tauren', 'troll', 'undead', 'skyborne'],
    specs: [
      ['arms', 'Arms', 'dps', 'ability_warrior_savageblow'],
      ['fury', 'Fury', 'dps', 'ability_warrior_innerrage'],
      ['protection', 'Protection', 'tank', 'inv_shield_06'],
    ],
    utility: 'Battle Shout, Sunder Armor',
  },
  paladin: {
    label: 'Paladin', color: '#F48CBA',
    races: ['undead'],
    specs: [
      ['holy', 'Holy', 'healer', 'spell_holy_holybolt'],
      ['protection', 'Protection', 'tank', 'spell_holy_devotionaura'],
      ['retribution', 'Retribution', 'dps', 'spell_holy_auraoflight'],
    ],
    utility: 'Blessings, Auras',
  },
  hunter: {
    label: 'Hunter', color: '#AAD372',
    races: ['orc', 'tauren', 'troll', 'skyborne'],
    specs: [
      ['beastmastery', 'Beast Mastery', 'dps', 'ability_hunter_beasttaming'],
      ['marksmanship', 'Marksmanship', 'dps', 'ability_marksmanship'],
      ['survival', 'Survival', 'dps', 'ability_hunter_swiftstrike'],
    ],
    utility: 'Trueshot Aura, Tranq Shot',
  },
  rogue: {
    label: 'Rogue', color: '#FFF468',
    races: ['orc', 'troll', 'undead', 'skyborne'],
    specs: [
      ['assassination', 'Assassination', 'dps', 'ability_rogue_eviscerate'],
      ['combat', 'Combat', 'dps', 'ability_backstab'],
      ['subtlety', 'Subtlety', 'dps', 'ability_stealth'],
    ],
    utility: 'Kick, Expose Armor',
  },
  priest: {
    label: 'Priest', color: '#FFFFFF',
    races: ['troll', 'undead'],
    specs: [
      ['discipline', 'Discipline', 'healer', 'spell_holy_powerwordshield'],
      ['holy', 'Holy', 'healer', 'spell_holy_guardianspirit'],
      ['shadow', 'Shadow', 'dps', 'spell_shadow_shadowwordpain'],
    ],
    utility: 'Fortitude, Shadow Weaving',
  },
  shaman: {
    label: 'Shaman', color: '#0070DD',
    races: ['orc', 'tauren', 'troll', 'skyborne'],
    specs: [
      ['elemental', 'Elemental', 'dps', 'spell_nature_lightning'],
      ['enhancement', 'Enhancement', 'dps', 'spell_nature_lightningshield'],
      ['restoration', 'Restoration', 'healer', 'spell_nature_magicimmunity'],
    ],
    utility: 'Windfury & Totems',
  },
  mage: {
    label: 'Mage', color: '#3FC7EB',
    races: ['orc', 'troll', 'undead'],
    specs: [
      ['arcane', 'Arcane', 'dps', 'spell_holy_magicalsentry'],
      ['fire', 'Fire', 'dps', 'spell_fire_firebolt02'],
      ['frost', 'Frost', 'dps', 'spell_frost_frostbolt02'],
    ],
    utility: 'Arcane Intellect, Decurse',
  },
  warlock: {
    label: 'Warlock', color: '#8788EE',
    races: ['orc', 'troll', 'undead'],
    specs: [
      ['affliction', 'Affliction', 'dps', 'spell_shadow_deathcoil'],
      ['demonology', 'Demonology', 'dps', 'spell_shadow_metamorphosis'],
      ['destruction', 'Destruction', 'dps', 'spell_shadow_rainoffire'],
    ],
    utility: 'Curses, Summons, Healthstones',
  },
  druid: {
    label: 'Druid', color: '#FF7C0A',
    races: ['tauren', 'skyborne'],
    specs: [
      ['balance', 'Balance', 'dps', 'spell_nature_starfall'],
      ['feralbear', 'Feral (Bear)', 'tank', 'ability_racial_bearform'],
      ['feralcat', 'Feral (Cat)', 'dps', 'ability_druid_catform'],
      ['restoration', 'Restoration', 'healer', 'spell_nature_healingtouch'],
    ],
    utility: 'Mark of the Wild, Battle Rez',
  },
};

// Classes where every spec is DPS — role is known even without a spec.
export const PURE_DPS = ['hunter', 'rogue', 'mage', 'warlock'];

export const WILLINGNESS = {
  keen: { label: 'Keen', long: 'Would love to', color: '#e8b84a' },
  happy: { label: 'Happy', long: 'Happy to', color: '#7fb069' },
  ifneeded: { label: 'If needed', long: 'If the raid needs it', color: '#8a8f98' },
};

// Target role split per raid size (tanks, healers, dps).
export const RAID_SIZES = {
  10: { label: '10 man', tank: 2, healer: 3, dps: 5 },
  20: { label: '20 man', tank: 3, healer: 5, dps: 12 },
  40: { label: '40 man', tank: 4, healer: 10, dps: 26 },
};

export const MAX_ALTS = 3;

// Professions in WoW: Forever (same 12 as Classic). Primary ones are capped at two per character.
export const PROFESSIONS = {
  alchemy: { label: 'Alchemy', icon: 'trade_alchemy', primary: true },
  blacksmithing: { label: 'Blacksmithing', icon: 'trade_blacksmithing', primary: true },
  enchanting: { label: 'Enchanting', icon: 'trade_engraving', primary: true },
  engineering: { label: 'Engineering', icon: 'trade_engineering', primary: true },
  herbalism: { label: 'Herbalism', icon: 'trade_herbalism', primary: true },
  leatherworking: { label: 'Leatherworking', icon: 'trade_leatherworking', primary: true },
  mining: { label: 'Mining', icon: 'trade_mining', primary: true },
  skinning: { label: 'Skinning', icon: 'inv_misc_pelt_wolf_01', primary: true },
  tailoring: { label: 'Tailoring', icon: 'trade_tailoring', primary: true },
  cooking: { label: 'Cooking', icon: 'inv_misc_food_15', primary: false },
  fishing: { label: 'Fishing', icon: 'trade_fishing', primary: false },
  firstaid: { label: 'First Aid', icon: 'spell_holy_sealofsacrifice', primary: false },
};
export const MAX_PRIMARY_PROFS = 2;

// Raid assignments officers can hand out. Order = display order on nameplates.
export const ASSIGNMENTS = {
  mt: { label: 'Main Tank', short: 'MT', icon: 'inv_shield_06' },
  ot: { label: 'Off Tank', short: 'OT', icon: 'ability_warrior_defensivestance' },
  flex: { label: 'Flex (Tank / DPS)', short: 'FLEX', icon: 'ability_racial_bearform' },
  healLead: { label: 'Healing Lead', short: 'HL', icon: 'spell_holy_flashheal' },
  raidLead: { label: 'Raid Leader', short: 'RL', icon: 'inv_bannerpvp_01' },
};

export function getSpec(classId, specId) {
  const c = CLASSES[classId];
  if (!c || !specId) return null;
  const s = c.specs.find((x) => x[0] === specId);
  return s ? { id: s[0], label: s[1], role: s[2], icon: s[3] } : null;
}

export function roleOf(classId, specId) {
  const s = getSpec(classId, specId);
  if (s) return s.role;
  if (PURE_DPS.includes(classId)) return 'dps';
  return null;
}

export function iconUrl(name) {
  return `/icons/${name}.webp`;
}

export function getFactionData(faction = 'horde') {
  if (!Object.hasOwn(FACTION_CLASSES, faction)) throw new Error('Invalid faction');
  const combos = FACTION_CLASSES[faction];
  return {
    races: faction === 'alliance' ? ALLIANCE_RACES : RACES,
    classes: Object.fromEntries(Object.entries(CLASSES).map(([id, cls]) => [
      id, { ...cls, races: Object.keys(combos).filter((race) => combos[race].includes(id)) },
    ])),
  };
}
