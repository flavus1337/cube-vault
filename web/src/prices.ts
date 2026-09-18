import { fetchAll, supabase, type Card, type PrivateCard } from './supabase'

/* Prices come from Scryfall when a set is loaded and then stay put. These
   functions fetch them again, one search per set instead of one request per
   card: Scryfall answers about two searches per second and blocks bursts. */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function scryfall(url: string) {
  for (let attempt = 0; ; attempt++) {
    await sleep(500)
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (res.status === 404) return null
    // 429 = too many requests. The wait header is not readable from a browser.
    if (res.status === 429 && attempt < 2) {
      await sleep(15000)
      continue
    }
    if (!res.ok) throw new Error(`Scryfall antwortet mit ${res.status}`)
    return res.json()
  }
}

/** EUR price of the English print, keyed by "set/collector number". */
export async function pricesOfSets(sets: string[], progress: (text: string) => void) {
  const prices = new Map<string, number>()
  for (const [i, set] of sets.entries()) {
    progress(`Preise laden … Set ${i + 1} von ${sets.length} (${set.toUpperCase()})`)
    let url: string | null =
      `https://api.scryfall.com/cards/search?${new URLSearchParams({
        q: `e:${set} lang:en game:paper`,
        unique: 'prints',
      })}`
    while (url) {
      const page: { data: { collector_number: string; prices?: { eur?: string | null } }[]; has_more: boolean; next_page?: string } | null =
        await scryfall(url)
      if (!page) break
      for (const card of page.data) {
        const eur = parseFloat(card.prices?.eur ?? '')
        if (!Number.isNaN(eur)) prices.set(`${set}/${card.collector_number}`, eur)
      }
      url = page.has_more && page.next_page ? page.next_page : null
    }
  }
  return prices
}

export async function refreshCubePrices(progress: (text: string) => void) {
  const cards = await fetchAll<Pick<Card, 'id' | 'set_code' | 'number' | 'price_eur'>>(
    'cards',
    'id',
    'id, set_code, number, price_eur',
  )
  const prices = await pricesOfSets([...new Set(cards.map((c) => c.set_code))], progress)
  const changed = cards
    .map((c) => ({ id: c.id, old: c.price_eur, price_eur: prices.get(`${c.set_code}/${c.number}`) }))
    .filter((c) => c.price_eur !== undefined && c.price_eur !== c.old)
    .map((c) => ({ id: c.id, price_eur: c.price_eur! }))

  for (let i = 0; i < changed.length; i += 200) {
    progress(`Speichern … ${Math.min(i + 200, changed.length)} von ${changed.length}`)
    const { error } = await supabase.from('cards').upsert(changed.slice(i, i + 200))
    if (error) throw error
  }
  progress(`Fertig: ${changed.length} von ${cards.length} Karten haben einen neuen Preis.`)
}

export async function refreshPrivatePrices(progress: (text: string) => void) {
  const cards = await fetchAll<PrivateCard>('private_cards', 'print_id')
  const prices = await pricesOfSets([...new Set(cards.map((c) => c.set_code))], progress)
  let changed = 0
  for (const card of cards) {
    const price = prices.get(`${card.set_code}/${card.number}`)
    if (price === undefined || price === card.price_eur) continue
    const { error } = await supabase
      .from('private_cards')
      .update({ price_eur: price })
      .eq('print_id', card.print_id)
    if (error) throw error
    changed++
  }
  progress(`Fertig: ${changed} von ${cards.length} Karten haben einen neuen Preis.`)
}

/** One line per card, e.g. "2 Lightning Bolt" — the format shops import. */
export function wantList(cards: { name: string; qty?: number }[]) {
  return cards.map((c) => `${c.qty ?? 1} ${c.name}`).join('\n')
}

export async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text)
}
