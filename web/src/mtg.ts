/* Magic's own vocabulary in German: colours, card types, rarities and keyword
   labels. Every page reads them from here, so a label is written once. */

export const COLORS = ['W', 'U', 'B', 'R', 'G', 'C']

export const COLOR_LABELS: Record<string, string> = {
  W: 'Weiß',
  U: 'Blau',
  B: 'Schwarz',
  R: 'Rot',
  G: 'Grün',
  C: 'Farblos',
}

/** Colours as a card is sorted by them: one colour, several, none, or a land. */
export const COLOR_GROUPS: [string, string][] = [
  ['W', 'Weiß'],
  ['U', 'Blau'],
  ['B', 'Schwarz'],
  ['R', 'Rot'],
  ['G', 'Grün'],
  ['M', 'Mehrfarbig'],
  ['C', 'Farblos'],
  ['L', 'Länder'],
]

/** Singular label, plural label and the words to look for in a type line. */
export const TYPES: [string, string, RegExp][] = [
  ['Kreatur', 'Kreaturen', /Kreatur|Creature/i],
  ['Planeswalker', 'Planeswalker', /Planeswalker/i],
  ['Spontanzauber', 'Spontanzauber', /Spontanzauber|Instant/i],
  ['Hexerei', 'Hexereien', /Hexerei|Sorcery/i],
  ['Land', 'Länder', /Land/i],
  ['Artefakt', 'Artefakte', /Artefakt|Artifact/i],
  ['Verzauberung', 'Verzauberungen', /Verzauberung|Enchantment/i],
]

export const RARITIES: [string, string][] = [
  ['common', 'Gewöhnlich'],
  ['uncommon', 'Ungewöhnlich'],
  ['rare', 'Selten'],
  ['mythic', 'Mythisch selten'],
]

export const RARITY: Record<string, string> = Object.fromEntries(RARITIES)

export const isLand = (typeLine: string) => /Land/i.test(typeLine)

/** The type a card is filed under, e.g. an artifact creature is a creature. */
export function typeOf(typeLine: string, plural = false) {
  const hit = TYPES.find(([, , words]) => words.test(typeLine))
  return hit ? (plural ? hit[1] : hit[0]) : 'Sonstiges'
}

/** 'W'…'G' for one colour, 'M' for several, 'C' for none, 'L' for a land. */
export function colorGroupOf(colors: string, typeLine: string) {
  if (isLand(typeLine)) return 'L'
  if (!colors) return 'C'
  return colors.length > 1 ? 'M' : colors
}

// German keyword labels, taken from the German card texts on Scryfall
// (tools/keywords_de.py). Keywords without a clean label stay English.
const KEYWORDS: Record<string, string> = {
  Affinity: 'Affinität',
  Afterlife: 'Seelenwandlung',
  Alliance: 'Allianz',
  Ascend: 'Aufstieg',
  Battalion: 'Bataillon',
  Behold: 'Erblicken',
  Bloodrush: 'Blutrausch',
  Bloodthirst: 'Blutdurst',
  Changeling: 'Wandelwicht',
  Converge: 'Konvergenz',
  Convoke: 'Einberufen',
  Crew: 'Bemannen',
  Cycling: 'Umwandlung',
  Deathtouch: 'Todesberührung',
  Decayed: 'Verwesung',
  Defender: 'Verteidiger',
  'Double strike': 'Doppelschlag',
  Dredge: 'Ausgraben',
  Eerie: 'Unheimlich',
  Enchant: 'Verzaubert',
  Enrage: 'Erzürnen',
  Equip: 'Ausrüsten',
  Escape: 'Befreiung',
  Evoke: 'Herbeirufen',
  Evolve: 'Weiterentwicklung',
  Exhaust: 'Überstrapazieren',
  Extort: 'Abnötigen',
  Ferocious: 'Wildheit',
  'First strike': 'Erstschlag',
  Flash: 'Aufblitzen',
  Flashback: 'Rückblende',
  Flurry: 'Zaubergestöber',
  Flying: 'Fliegend',
  Forage: 'Hamstern',
  Forecast: 'Vorhersage',
  Forestcycling: 'Waldumwandlung',
  Forestwalk: 'Waldtarnung',
  Graft: 'Pfropfen',
  Harmonize: 'Harmonisieren',
  Haste: 'Eile',
  Haunt: 'Spuk',
  Hellbent: 'Versessenheit',
  Hexproof: 'Fluchsicher',
  Hideaway: 'Refugium',
  Impending: 'Unheilsdrohend',
  Imprint: 'Einprägen',
  Improvise: 'Improvisieren',
  Indestructible: 'Unzerstörbar',
  Islandcycling: 'Inselumwandlung',
  'Job select': 'Auftragsauswahl',
  'Jump-start': 'Katalyse',
  Kicker: 'Bonus',
  Landfall: 'Landung',
  Landwalk: 'Landtarnung',
  'Level Up': 'Stufe aufsteigen',
  Lifelink: 'Lebensverknüpfung',
  Magecraft: 'Magiefertigkeit',
  'Max speed': 'Maximaltempo',
  Menace: 'Bedrohlich',
  Metalcraft: 'Metallkunst',
  Mill: 'Millen',
  Mobilize: 'Mobilisieren',
  Morbid: 'Morbide',
  Mountaincycling: 'Gebirgsumwandlung',
  Offspring: 'Nachwuchs',
  Overload: 'Überlast',
  Parley: 'Verhandlungen',
  Plainscycling: 'Ebenenumwandlung',
  Protection: 'Schutz',
  Prowess: 'Bravour',
  Raid: 'Überfall',
  Ravenous: 'Unersättlich',
  Reach: 'Reichweite',
  Renew: 'Erneuerung',
  Replicate: 'Reproduktion',
  Riot: 'Aufruhr',
  Saddle: 'Aufsatteln',
  Scavenge: 'Ausplündern',
  Shroud: 'Verhüllt',
  Spectacle: 'Spektakel',
  'Start your engines!': 'Starte die Motoren',
  Storm: 'Sturm',
  Survival: 'Überlebenskunst',
  Suspend: 'Aussetzen',
  Swampcycling: 'Sumpfumwandlung',
  Swampwalk: 'Sumpftarnung',
  'Tempting offer': 'Verlockendes Angebot',
  Threshold: 'Grenzwert',
  Tiered: 'Stufenmagie',
  Toxic: 'Toxisch',
  Trample: 'Verursacht Trampelschaden',
  Transmute: 'Transmutation',
  Unleash: 'Entfesselt',
  Valiant: 'Tapfer',
  Vanishing: 'Verschwinden',
  Vigilance: 'Wachsamkeit',
  Ward: 'Abwehr',
}

export const keywordLabel = (key: string) => KEYWORDS[key] ?? key
