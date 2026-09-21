import { fetchAll, supabase, type Card, type CubeSet } from './supabase'

/* Oracle tags from Scryfall's Tagger project. A card carries no tags in its
   data, so each tag is asked for separately and the answers are stored. */

export type CardTag = { card_id: string; tag: string }

// Checked against Scryfall: every one of these returns cards.
export const TAGS: [string, string][] = [
  ['removal', 'Entfernung'],
  ['creature-removal', 'Kreaturen entfernen'],
  ['spot-removal', 'Einzelziel-Entfernung'],
  ['board-wipe', 'Massenentfernung'],
  ['artifact-removal', 'Artefakt entfernen'],
  ['enchantment-removal', 'Verzauberung entfernen'],
  ['counterspell', 'Gegenzauber'],
  ['card-advantage', 'Kartenvorteil'],
  ['draw-engine', 'Kartenmotor'],
  ['tutor', 'Suchen'],
  ['ramp', 'Mana-Beschleunigung'],
  ['mana-rock', 'Mana-Artefakt'],
  ['mana-dork', 'Mana-Kreatur'],
  ['discard', 'Abwerfen'],
  ['graveyard-hate', 'Friedhof stören'],
  ['recursion', 'Wiederbeschaffung'],
  ['lifegain', 'Lebenspunkte'],
  ['burn', 'Direktschaden'],
  ['bounce', 'Zurück auf die Hand'],
  ['evasion', 'Schwer blockbar'],
  ['protection', 'Schutz'],
  ['sacrifice-outlet', 'Opfern'],
  ['extra-turn', 'Extra-Zug'],
  ['mill', 'Bibliothek abwerfen'],
  ['flicker', 'Flackern'],
  ['blink', 'Blinzeln'],
  ['lands-matter', 'Länder-Thema'],
  ['counters-matter', 'Marken-Thema'],
  ['tapper', 'Tapper'],
  ['anthem', 'Anthem'],
  ['wheel', 'Hand neu ziehen'],
  ['ritual', 'Ritual'],
]

export const tagLabel = (tag: string) => TAGS.find(([slug]) => slug === tag)?.[1] ?? tag

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function search(query: string) {
  const cards: { set: string; oracle_id?: string; card_faces?: { oracle_id?: string }[] }[] = []
  let url: string | null = `https://api.scryfall.com/cards/search?${new URLSearchParams({
    q: query,
    unique: 'cards',
  })}`
  while (url) {
    await sleep(500) // Scryfall answers about two searches per second
    const res: Response = await fetch(url, { headers: { Accept: 'application/json' } })
    if (res.status === 404) return cards // the tag matches nothing in these sets
    if (res.status === 429) {
      await sleep(15000)
      continue
    }
    if (!res.ok) throw new Error(`Scryfall antwortet mit ${res.status}`)
    const page = await res.json()
    cards.push(...page.data)
    url = page.has_more ? page.next_page : null
  }
  return cards
}

/** Fetches every tag for the sets in the cube and stores what it finds. */
export async function loadTags(progress: (text: string) => void) {
  const [cards, sets] = await Promise.all([
    fetchAll<Pick<Card, 'id' | 'set_code' | 'oracle_id'>>('cards', 'id', 'id, set_code, oracle_id'),
    fetchAll<CubeSet>('sets', 'code'),
  ])
  const inCube = sets.filter((set) => set.in_cube).map((set) => set.code)
  if (!inCube.length) throw new Error('Kein Set im Cube.')
  const byOracle = new Map(cards.map((card) => [`${card.set_code}/${card.oracle_id}`, card.id]))
  const where = `(${inCube.map((code) => `e:${code}`).join(' or ')})`

  const rows: CardTag[] = []
  for (const [index, [tag]] of TAGS.entries()) {
    progress(`Schlagwörter laden … ${index + 1} von ${TAGS.length} (${tag})`)
    for (const card of await search(`otag:${tag} ${where} lang:en game:paper`)) {
      const oracleId = card.oracle_id ?? card.card_faces?.[0]?.oracle_id
      const id = oracleId && byOracle.get(`${card.set}/${oracleId}`)
      if (id) rows.push({ card_id: id, tag })
    }
  }

  progress(`Speichere ${rows.length} Zuordnungen …`)
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('card_tags').upsert(rows.slice(i, i + 500))
    if (error) throw error
  }
  progress(`Fertig: ${rows.length} Zuordnungen für ${new Set(rows.map((r) => r.card_id)).size} Karten.`)
}
