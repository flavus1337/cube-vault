import { money, priceFor, type PrintPrice } from './price'
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

/* One search per set brings every printing in it, in every language. The cards
   take the price of the English print, the scanned copies the price of their
   own print, found by its Scryfall id. */
export async function pricesOfSets(sets: string[], progress: (text: string) => void) {
  /** Which printing a Scryfall id belongs to, e.g. "fdn" "134". */
  const printings = new Map<string, { set_code: string; number: string }>()
  /* Keyed "set/collector number", English only. Scryfall prices only the
     English printing of a set, so a German copy borrows its prices. */
  const cards = new Map<
    string,
    PrintPrice & { legalities: Record<string, string> | null }
  >()
  /** Keyed by Scryfall id: what a scanned printing is worth. */
  const prints = new Map<string, PrintPrice>()

  for (const [i, set] of sets.entries()) {
    progress(`Preise laden … Set ${i + 1} von ${sets.length} (${set.toUpperCase()})`)
    let url: string | null =
      `https://api.scryfall.com/cards/search?${new URLSearchParams({
        q: `e:${set} game:paper`,
        unique: 'prints',
      })}`
    while (url) {
      const page: {
        data: {
          id: string
          lang: string
          collector_number: string
          prices?: { eur?: string | null; eur_foil?: string | null }
          legalities?: Record<string, string>
        }[]
        has_more: boolean
        next_page?: string
      } | null = await scryfall(url)
      if (!page) break
      for (const card of page.data) {
        prints.set(card.id, {
          price_eur: money(card.prices?.eur),
          price_eur_foil: money(card.prices?.eur_foil),
        })
        printings.set(card.id, { set_code: set, number: card.collector_number })
        // A German print has no price of its own; then the old one stays.
        if (card.lang === 'en') {
          cards.set(`${set}/${card.collector_number}`, {
            price_eur: money(card.prices?.eur),
            price_eur_foil: money(card.prices?.eur_foil),
            legalities: card.legalities ?? null,
          })
        }
      }
      url = page.has_more && page.next_page ? page.next_page : null
    }
  }
  return { cards, prints, printings }
}

/* Most copies are printings of the sets the cube holds, so their price came
   with the set search. Only a printing from somewhere else, e.g. a Comic-Con
   foil, is asked for on its own. */
async function refreshCopyPrices(
  known: Map<string, PrintPrice>,
  /** Printings the set search already named. */
  cubePrints: Map<string, { set_code: string; number: string }>,
  /** Per card the prices of its English printing, for prints without any. */
  english: Map<string, PrintPrice>,
  progress: (text: string) => void,
) {
  const all = await fetchAll<Copy>('copies', 'print_id')
  /* A plain copy of the card's own printing is already covered by the card
     price, so only foils and other printings are looked at. */
  const copies = all.filter((copy) => copy.finish !== 'nonfoil' || copy.print_id !== copy.card_id)
  const rows: {
    print_id: string
    finish: string
    price_eur: number | null
    set_code?: string
    number?: string
  }[] = []
  const strangers = copies.filter((copy) => !known.has(copy.print_id))
  /** Which printing a copy is, for the rows that never learned it. */
  const printings = new Map<string, { set_code: string; number: string }>()

  for (const [i, copy] of strangers.entries()) {
    progress(`Preise fremder Drucke … ${i + 1} von ${strangers.length}`)
    const card: {
      set?: string
      collector_number?: string
      prices?: { eur?: string | null; eur_foil?: string | null }
    } | null = await scryfall(`https://api.scryfall.com/cards/${copy.print_id}`, 120)
    if (!card) continue
    known.set(copy.print_id, {
      price_eur: money(card.prices?.eur),
      price_eur_foil: money(card.prices?.eur_foil),
    })
    if (card.set && card.collector_number) {
      printings.set(copy.print_id, { set_code: card.set, number: card.collector_number })
    }
  }

  for (const copy of copies) {
    const own = known.get(copy.print_id)
    const fallback = english.get(copy.card_id)
    if (!own && !fallback) continue
    rows.push({
      print_id: copy.print_id,
      finish: copy.finish,
      price_eur: priceFor(copy.finish, own, fallback),
      ...(copy.set_code ? {} : (printings.get(copy.print_id) ?? cubePrints.get(copy.print_id) ?? {})),
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
    .map((c) => ({ id: c.id, ...fresh.cards.get(`${c.set_code}/${c.number}`) }))
    .filter((row) => row.price_eur !== undefined || row.legalities !== undefined)

  // One update statement per batch: an upsert would fail on the not-null
  // columns of the row it pretends to insert.
  for (let i = 0; i < rows.length; i += 500) {
    progress(`Speichern … ${Math.min(i + 500, rows.length)} von ${rows.length}`)
    const { error } = await supabase.rpc('set_card_data', { rows: rows.slice(i, i + 500) })
    if (error) throw error
  }
  const english = new Map<string, PrintPrice>()
  for (const card of cards) {
    const row = fresh.cards.get(`${card.set_code}/${card.number}`)
    if (row) english.set(card.id, row)
  }
  const priced = await refreshCopyPrices(fresh.prints, fresh.printings, english, progress)
  progress(`Fertig: ${rows.length} von ${cards.length} Karten, ${priced} Exemplare aktualisiert.`)
}

export async function refreshPrivatePrices(progress: (text: string) => void) {
  const cards = await fetchAll<PrivateCard>('private_cards', 'print_id')
  const prices = await pricesOfSets([...new Set(cards.map((c) => c.set_code))], progress)
  const changed = cards
    .map((c) => ({
      print_id: c.print_id,
      // Your own cards carry a finish, so a foil takes the foil price.
      price_eur: priceFor(
        c.finish,
        prices.prints.get(c.print_id),
        prices.cards.get(`${c.set_code}/${c.number}`),
      ),
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
