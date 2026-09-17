import { supabase, type Card, type CubeSet } from './supabase'

/* Imports a whole set from Scryfall: one row per unique card (oracle id).
   Variants and other languages are the same card; scans count them in `copies`. */

type Face = {
  oracle_id?: string
  name?: string
  printed_name?: string
  type_line?: string
  printed_type_line?: string
  oracle_text?: string
  printed_text?: string
  mana_cost?: string
  colors?: string[]
  image_uris?: { normal?: string }
}

type ScryCard = Face & {
  id: string
  name: string
  collector_number: string
  cmc?: number
  color_identity?: string[]
  keywords?: string[]
  rarity: string
  layout?: string
  prices?: { eur?: string | null }
  card_faces?: Face[]
}

export type CardRow = Omit<Card, 'excluded' | 'exclude_reason'>

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function scryfall<T>(url: string): Promise<T | null> {
  let res = await fetch(url, { headers: { Accept: 'application/json' } })
  // 429 = too many requests. Wait as long as Scryfall asks, at most twice.
  for (let tries = 0; res.status === 429 && tries < 2; tries++) {
    await sleep((Number(res.headers.get('Retry-After')) || 15) * 1000)
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  }
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Scryfall antwortet mit ${res.status}`)
  return res.json() as Promise<T>
}

async function searchPrints(q: string, order = 'set'): Promise<ScryCard[]> {
  const cards: ScryCard[] = []
  let url: string | null =
    `https://api.scryfall.com/cards/search?${new URLSearchParams({ q, unique: 'prints', order, dir: 'desc' })}`
  while (url) {
    const page: { data: ScryCard[]; has_more: boolean; next_page?: string } | null = await scryfall(url)
    await sleep(500) // Scryfall allows only about 2 searches per second
    if (!page) break
    cards.push(...page.data)
    url = page.has_more && page.next_page ? page.next_page : null
  }
  return cards
}

/** Top-level field, or the faces' fields joined (double-faced cards). */
function field(card: ScryCard | undefined, key: keyof Face, sep: string): string | null {
  if (!card) return null
  const top = card[key]
  if (typeof top === 'string') return top
  const parts = (card.card_faces ?? []).map((f) => f[key]).filter((v): v is string => typeof v === 'string' && v !== '')
  return parts.length ? parts.join(sep) : null
}

const faceOf = (card: ScryCard) => card.card_faces?.[0]

function compareNumbers(a: ScryCard, b: ScryCard) {
  return parseInt(a.collector_number, 10) - parseInt(b.collector_number, 10) ||
    a.collector_number.localeCompare(b.collector_number)
}

/* Some cards have no German print in their own set on Scryfall (e.g. starter kit
   cards in Foundations). Names and texts are the same in every set, so they come
   from the newest German print elsewhere. Keyed by oracle id. */
async function germanElsewhere(oracleIds: string[]): Promise<Map<string, ScryCard>> {
  const found = new Map<string, ScryCard>()
  for (let i = 0; i < oracleIds.length; i += 20) {
    const q = `(${oracleIds.slice(i, i + 20).map((id) => `oracleid:${id}`).join(' or ')}) lang:de`
    for (const card of await searchPrints(q, 'released')) {
      const oracleId = card.oracle_id ?? faceOf(card)?.oracle_id
      if (oracleId && !found.has(oracleId)) found.set(oracleId, card)
    }
  }
  return found
}

export function buildRows(
  setCode: string,
  english: ScryCard[],
  german: ScryCard[],
  elsewhere = new Map<string, ScryCard>(),
): CardRow[] {
  const groups = new Map<string, ScryCard>()
  for (const card of english) {
    const oracleId = card.oracle_id ?? faceOf(card)?.oracle_id
    if (!oracleId) continue
    const main = groups.get(oracleId)
    if (!main || compareNumbers(card, main) < 0) groups.set(oracleId, card)
  }
  const germanByNumber = new Map(german.map((c) => [c.collector_number, c]))

  return [...groups].map(([oracleId, en]) => {
    const de = germanByNumber.get(en.collector_number) ?? elsewhere.get(oracleId)
    const image = (c?: ScryCard) => (c ? (c.image_uris ?? faceOf(c)?.image_uris)?.normal ?? null : null)
    const price = parseFloat(en.prices?.eur ?? '')
    return {
      id: en.id,
      oracle_id: oracleId,
      set_code: setCode,
      number: en.collector_number,
      name: en.name,
      name_de: field(de, 'printed_name', ' // '),
      type_line: field(en, 'type_line', ' // ') ?? '',
      type_de: field(de, 'printed_type_line', ' // '),
      oracle_text: field(en, 'oracle_text', '\n//\n') ?? '',
      text_de: field(de, 'printed_text', '\n//\n'),
      mana_cost: field(en, 'mana_cost', ' // ') ?? '',
      cmc: en.cmc ?? 0,
      colors: (en.colors ?? faceOf(en)?.colors ?? []).join(''),
      color_identity: (en.color_identity ?? []).join(''),
      keywords: en.keywords ?? [],
      rarity: en.rarity,
      layout: en.layout ?? null,
      // A German print from another set has other art, but readable German text.
      image: image(de) ?? image(en),
      image_en: image(en),
      price_eur: Number.isNaN(price) ? null : price,
    }
  })
}

/** Scryfall part of the import, without touching the database. */
export async function fetchSetData(code: string, progress: (text: string) => void) {
  code = code.trim().toLowerCase()
  progress('Lade Set-Daten …')
  const set = await scryfall<{ code: string; name: string; released_at?: string; icon_svg_uri?: string }>(
    `https://api.scryfall.com/sets/${encodeURIComponent(code)}`,
  )
  if (!set) throw new Error(`Scryfall kennt kein Set „${code}“.`)
  progress(`Lade englische Karten von ${set.name} …`)
  const english = await searchPrints(`e:${code} lang:en game:paper`)
  progress(`Lade deutsche Karten von ${set.name} …`)
  const german = await searchPrints(`e:${code} lang:de`)
  const germanNumbers = new Set(german.map((c) => c.collector_number))
  const withoutGerman = [
    ...new Set(
      english
        .filter((c) => !germanNumbers.has(c.collector_number))
        .map((c) => c.oracle_id ?? faceOf(c)?.oracle_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  if (withoutGerman.length) progress(`Suche deutsche Texte für ${withoutGerman.length} Karten in anderen Sets …`)
  const elsewhere = await germanElsewhere(withoutGerman)
  const setRow: Pick<CubeSet, 'code' | 'name' | 'released_at' | 'icon_svg_uri'> = {
    code: set.code,
    name: set.name,
    released_at: set.released_at ?? null,
    icon_svg_uri: set.icon_svg_uri ?? null,
  }
  return { set: setRow, rows: buildRows(set.code, english, german, elsewhere) }
}

export async function importSet(code: string, progress: (text: string) => void) {
  const { set, rows } = await fetchSetData(code, progress)

  // Keeps `in_cube` of a set that is already there.
  const { error: setError } = await supabase.from('sets').upsert(set, { onConflict: 'code', ignoreDuplicates: true })
  if (setError) throw setError

  const { data: existing, error } = await supabase.from('cards').select('id').eq('set_code', set.code)
  if (error) throw error
  const known = new Set(existing.map((r) => r.id as string))
  // Separate batches: every row in one request needs the same columns, and a
  // re-import must not reset exclusions.
  const updates = rows.filter((r) => known.has(r.id))
  const inserts = rows
    .filter((r) => !known.has(r.id))
    .map((r) => {
      const basic = r.type_line.includes('Basic Land')
      return { ...r, excluded: basic, exclude_reason: basic ? 'Standardland' : null }
    })

  progress(`Speichere ${rows.length} Karten …`)
  for (let i = 0; i < updates.length; i += 200) {
    const { error } = await supabase.from('cards').upsert(updates.slice(i, i + 200))
    if (error) throw error
  }
  for (let i = 0; i < inserts.length; i += 200) {
    const { error } = await supabase.from('cards').insert(inserts.slice(i, i + 200))
    if (error) throw error
  }
  progress(`Fertig: ${set.name} mit ${rows.length} Karten, davon ${inserts.length} neu.`)
}
