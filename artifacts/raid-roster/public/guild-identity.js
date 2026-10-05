export function applyFactionTheme(faction) {
  document.documentElement.dataset.faction = faction === 'alliance' ? 'alliance' : 'horde';
}

export function applyGuildIdentity(guild) {
  const preview = globalThis.location?.hash === '#settings'
    ? document.documentElement.dataset.factionPreview : null;
  const faction = preview || guild?.faction;
  applyFactionTheme(faction);
  const alliance = faction === 'alliance';
  const name = document.getElementById('guild-name');
  if (name) name.textContent = `<${guild?.name || 'Guild'}>`;
  const label = document.querySelector('.banner .eyebrow');
  if (label) label.textContent = `World of Warcraft: Forever · ${alliance ? 'Alliance' : 'Horde'}`;
  const crest = document.querySelector('.banner .crest img');
  if (crest) {
    crest.src = alliance ? '/icons/alliance-crest.png' : '/icons/inv_bannerpvp_01.webp';
    crest.alt = alliance ? 'Alliance crest' : 'Horde crest';
  }
}
