import { fetchAll, supabase, type Card, type PrivateCard } from './supabase'

/* Prices come from Scryfall when a set is loaded and then stay put. These
   functions fetch them again. Scryfall takes up to 75 cards per request. */

const CHUNK = 75
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function pricesFor(ids: string[], progress: (text: string) => void) {
  const prices = new Map<string, number>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    progress(`Preise laden … ${Math.min(i + CHUNK, ids.length)} von ${ids.length}`)
    const res = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ identifiers: ids.slice(i, i + CHUNK).map((id) => ({ id })) }),
    })
    if (!res.ok) throw new Error(`Scryfall antwortet mit ${res.status}`)
    const page: { data: { id: string; prices?: { eur?: string | null } }[] } = await res.json()
    for (const card of page.data) {
      const eur = parseFloat(card.prices?.eur ?? '')
      // A German print has no price of its own; then the old one stays.
      if (!Number.isNaN(eur)) prices.set(card.id, eur)
    }
    await sleep(100)
  }
  return prices
}

export async function refreshCubePrices(progress: (text: string) => void) {
  const cards = await fetchAll<Pick<Card, 'id' | 'price_eur'>>('cards', 'id', 'id, price_eur')
  const prices = await pricesFor(cards.map((c) => c.id), progress)
  const changed = cards
    .filter((c) => prices.has(c.id) && prices.get(c.id) !== c.price_eur)
    .map((c) => ({ id: c.id, price_eur: prices.get(c.id)! }))
  for (let i = 0; i < changed.length; i += 200) {
    progress(`Speichern … ${Math.min(i + 200, changed.length)} von ${changed.length}`)
    const { error } = await supabase.from('cards').upsert(changed.slice(i, i + 200))
    if (error) throw error
  }
  progress(`Fertig: ${changed.length} von ${cards.length} Karten haben einen neuen Preis.`)
}

export async function refreshPrivatePrices(progress: (text: string) => void) {
  const cards = await fetchAll<PrivateCard>('private_cards', 'print_id')
  const prices = await pricesFor(cards.map((c) => c.print_id), progress)
  const changed = cards.filter((c) => prices.has(c.print_id) && prices.get(c.print_id) !== c.price_eur)
  for (const card of changed) {
    const { error } = await supabase
      .from('private_cards')
      .update({ price_eur: prices.get(card.print_id)! })
      .eq('print_id', card.print_id)
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
