import { randomInt } from 'node:crypto';

// 64 x 64 readable fantasy compounds = 4096 distinct words. Four independently
// sampled words provide 48 bits of entropy without dependencies or word files.
const STARTS = `amber ancient arcane ashen autumn azure black blazing blue bold brass bright bronze cedar cobalt coral crimson crystal dawn deep dusk earth elder ember evergreen faded fallen feral fiery flame forest frost ghost golden grand green hidden hollow iron ivory jade lunar mist moon moss night oak obsidian ocean pale quiet raven red river royal ruby sacred shadow silver solar star stone storm wild`.split(' ');
const ENDS = `arrow ash banner bark beam bell blade bloom branch breeze brook claw cloud coast crown crystal dawn den drift dusk ember fang feather field fire flame flower forge frost gate gem grove guard hall heart hill horn leaf light mist moon oak peak pine pool rain ridge ring river rock root rune shade shell shield sky snow spark spear star stone thorn tide vale`.split(' ');
if (STARTS.length !== 64 || ENDS.length !== 64) throw new Error('Credential word banks must each contain 64 unique words.');
const WORDS = STARTS.flatMap((start) => ENDS.map((end) => `${start}${end}`));
if (new Set(WORDS).size !== 4096) throw new Error('Credential words must be unique.');

export function generateGuildCredential() {
  return Array.from({ length: 4 }, () => WORDS[randomInt(WORDS.length)]).join('-');
}