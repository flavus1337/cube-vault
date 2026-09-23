import { BASICS } from './mana'
import { supabase, type PrivateCard } from './supabase'

/* Basic lands for a deck. The cards come from Scryfall in German, land in the
   player's own cards and from there into the deck. */

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
    finish: 'nonfoil',
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
