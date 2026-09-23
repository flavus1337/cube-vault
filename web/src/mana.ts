/* What a deck needs in lands. Pure arithmetic, so it runs in the tests
   without a database behind it. */

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

