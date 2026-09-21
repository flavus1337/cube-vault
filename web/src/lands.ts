import { supabase, type PrivateCard } from './supabase'

/* Basic lands for a deck. The cards come from Scryfall in German, land in the
   player's own cards and from there into the deck. */

export const BASICS: [string, string, string][] = [
  // colour, English name, German name
  ['W', 'Plains', 'Ebene'],
  ['U', 'Island', 'Insel'],
  ['B', 'Swamp', 'Sumpf'],
  ['R', 'Mountain', 'Gebirge'],
  ['G', 'Forest', 'Wald'],
]

/** Coloured mana symbols per colour, hybrid symbols count for both colours. */
export function pipsOf(cards: { mana_cost: string; qty: number }[]) {
  const pips: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  for (const card of cards) {
    for (const symbol of card.mana_cost.match(/\{[^}]*\}/g) ?? []) {
      for (const colour of Object.keys(pips)) {
        if (symbol.includes(colour)) pips[colour] += card.qty
      }
    }
  }
  return pips
}

/** A limited deck is 40 cards: 23 spells and 17 lands. */
export function suggestLands(spells: number, pips: Record<string, number>) {
  const total = Object.values(pips).reduce((sum, n) => sum + n, 0)
  const lands = Math.round((spells * 17) / 23)
  if (!total || !lands) return []
  const shares = BASICS.map(([colour]) => ({ colour, exact: (lands * pips[colour]) / total }))
    .filter((share) => share.exact > 0)
    .map((share) => ({ ...share, count: Math.floor(share.exact) }))
  // Hand out the lands left over by rounding, largest remainder first.
  let left = lands - shares.reduce((sum, share) => sum + share.count, 0)
  for (const share of [...shares].sort((a, b) => (b.exact % 1) - (a.exact % 1))) {
    if (left-- <= 0) break
    share.count++
  }
  return shares.filter((share) => share.count > 0)
}

async function basicLand(colour: string): Promise<PrivateCard> {
  const [, english, german] = BASICS.find(([key]) => key === colour)!
  const query = new URLSearchParams({
    q: `!"${english}" lang:de game:paper t:basic`,
    unique: 'prints',
    order: 'released',
    dir: 'desc',
  })
  const res = await fetch(`https://api.scryfall.com/cards/search?${query}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Scryfall antwortet mit ${res.status}`)
  const card = (await res.json()).data[0]
  return {
    print_id: card.id,
    oracle_id: card.oracle_id,
    set_code: card.set,
    set_name: card.set_name,
    number: card.collector_number,
    name: card.name,
    name_de: card.printed_name ?? german,
    type_line: card.type_line ?? 'Basic Land',
    // German basics print no type line of their own.
    type_de: card.printed_type_line ?? `Standardland — ${german}`,
    mana_cost: '',
    cmc: 0,
    colors: '',
    rarity: card.rarity ?? 'common',
    image: card.image_uris?.normal ?? null,
    price_eur: null,
    lang: 'de',
    qty: 1,
    added_at: new Date().toISOString(),
  }
}

/* Puts the suggested lands into the player's cards and into the deck. `count`
   is how many the deck should end up with, `have` how many are in it already,
   so pressing the button twice does not double the lands. */
export async function addLands(
  deckId: string,
  wanted: { colour: string; count: number; have?: number }[],
) {
  for (const { colour, count, have = 0 } of wanted) {
    const land = await basicLand(colour)
    for (let i = 0; i < count - have; i++) {
      const { error } = await supabase.rpc('add_private_copy', { card: { ...land, qty: undefined, added_at: undefined } })
      if (error) throw error
    }
    const { error } = await supabase
      .from('deck_cards')
      .upsert({ deck_id: deckId, print_id: land.print_id, qty: count })
    if (error) throw error
  }
}
