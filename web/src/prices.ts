import { fetchAll, supabase, type Card, type Copy, type PrivateCard } from './supabase'

/* Prices come from Scryfall when a set is loaded and then stay put. These
   functions fetch them again, one search per set instead of one request per
   card: Scryfall answers about two searches per second and blocks bursts. */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/* [pause] is the wait before the call: searches are limited to about two per
   second, single cards take ten. */
async function scryfall(url: string, pause = 500) {
  for (let attempt = 0; ; attempt++) {
    await sleep(pause)
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
  const prices = new Map<string, { price_eur: number | null; legalities: Record<string, string> | null }>()
  for (const [i, set] of sets.entries()) {
    progress(`Preise laden … Set ${i + 1} von ${sets.length} (${set.toUpperCase()})`)
    let url: string | null =
      `https://api.scryfall.com/cards/search?${new URLSearchParams({
        q: `e:${set} lang:en game:paper`,
        unique: 'prints',
      })}`
    while (url) {
      const page: {
        data: {
          collector_number: string
          prices?: { eur?: string | null }
          legalities?: Record<string, string>
        }[]
        has_more: boolean
        next_page?: string
      } | null = await scryfall(url)
      if (!page) break
      for (const card of page.data) {
        const eur = parseFloat(card.prices?.eur ?? '')
        prices.set(`${set}/${card.collector_number}`, {
          // A German print has no price of its own; then the old one stays.
          price_eur: Number.isNaN(eur) ? null : eur,
          legalities: card.legalities ?? null,
        })
      }
      url = page.has_more && page.next_page ? page.next_page : null
    }
  }
  return prices
}

/* Copies point at a printing that may sit in another set than the card, e.g.
   a Comic-Con foil. Those are asked for one by one; there are only a few. */
async function refreshCopyPrices(progress: (text: string) => void) {
  const all = await fetchAll<Copy>('copies', 'print_id')
  /* A normal copy of the card's own printing is already covered by the card
     price, so only foils and other printings are asked for. */
  const copies = all.filter((copy) => copy.finish !== 'nonfoil' || copy.print_id !== copy.card_id)
  const rows: { print_id: string; finish: string; price_eur: number | null }[] = []
  for (const [i, copy] of copies.entries()) {
    progress(`Preise der Exemplare … ${i + 1} von ${copies.length}`)
    const card: { prices?: { eur?: string | null; eur_foil?: string | null } } | null =
      await scryfall(`https://api.scryfall.com/cards/${copy.print_id}`, 120)
    if (!card) continue
    const raw = copy.finish === 'nonfoil' ? card.prices?.eur : card.prices?.eur_foil
    const price = parseFloat(raw ?? '')
    rows.push({
      print_id: copy.print_id,
      finish: copy.finish,
      price_eur: Number.isNaN(price) ? null : price,
    })
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.rpc('set_copy_prices', { rows: rows.slice(i, i + 500) })
    if (error) throw error
  }
  return rows.filter((row) => row.price_eur != null).length
}

export async function refreshCubePrices(progress: (text: string) => void) {
  const cards = await fetchAll<Pick<Card, 'id' | 'set_code' | 'number' | 'price_eur'>>(
    'cards',
    'id',
    'id, set_code, number, price_eur',
  )
  const fresh = await pricesOfSets([...new Set(cards.map((c) => c.set_code))], progress)
  const rows = cards
    .map((c) => ({ id: c.id, ...fresh.get(`${c.set_code}/${c.number}`) }))
    .filter((row) => row.price_eur !== undefined || row.legalities !== undefined)

  // One update statement per batch: an upsert would fail on the not-null
  // columns of the row it pretends to insert.
  for (let i = 0; i < rows.length; i += 500) {
    progress(`Speichern … ${Math.min(i + 500, rows.length)} von ${rows.length}`)
    const { error } = await supabase.rpc('set_card_data', { rows: rows.slice(i, i + 500) })
    if (error) throw error
  }
  const priced = await refreshCopyPrices(progress)
  progress(`Fertig: ${rows.length} von ${cards.length} Karten, ${priced} Exemplare aktualisiert.`)
}

export async function refreshPrivatePrices(progress: (text: string) => void) {
  const cards = await fetchAll<PrivateCard>('private_cards', 'print_id')
  const prices = await pricesOfSets([...new Set(cards.map((c) => c.set_code))], progress)
  const changed = cards
    .map((c) => ({
      print_id: c.print_id,
      price_eur: prices.get(`${c.set_code}/${c.number}`)?.price_eur ?? null,
      old: c.price_eur,
    }))
    .filter((c) => c.price_eur !== null && c.price_eur !== c.old)
    .map((c) => ({ print_id: c.print_id, price_eur: c.price_eur! }))

  if (changed.length) {
    const { error } = await supabase.rpc('set_private_prices', { rows: changed })
    if (error) throw error
  }
  progress(`Fertig: ${changed.length} von ${cards.length} Karten haben einen neuen Preis.`)
}

/** One line per card, e.g. "2 Lightning Bolt" — the format shops import. */
export function wantList(cards: { name: string; qty?: number }[]) {
  return cards.map((c) => `${c.qty ?? 1} ${c.name}`).join('\n')
}

export async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text)
}
