/* What a printing costs. Scryfall prices only the English printing of a set,
   so a German card takes the price of its English twin — and a German foil the
   English foil price, not the plain one. */

export type PrintPrice = { price_eur: number | null; price_eur_foil: number | null }

export const money = (raw: string | null | undefined) => {
  const value = parseFloat(raw ?? '')
  return Number.isNaN(value) ? null : value
}

export const priceFor = (finish: string, own?: PrintPrice, english?: PrintPrice) => {
  const pick = (price?: PrintPrice) =>
    finish === 'nonfoil' ? price?.price_eur : price?.price_eur_foil
  return pick(own) ?? pick(english) ?? null
}

/* The cheapest cards that still fit a budget. A card Scryfall has no price
   for cannot be part of the answer to "what do I get for 20 €", so it is left
   out while a budget is set; without one it stands at the end of the list. */
export function withinBudget<T extends { price_eur: number | null }>(cards: T[], limit: number) {
  if (!limit) return cards
  const fits: T[] = []
  let spent = 0
  for (const card of cards) {
    if (card.price_eur == null) continue
    if (spent + card.price_eur > limit) break
    fits.push(card)
    spent += card.price_eur
  }
  return fits
}

/** Cheapest first; what has no price goes last, it helps nobody up front. */
export const byPrice = <T extends { price_eur: number | null }>(a: T, b: T) =>
  (a.price_eur ?? Infinity) - (b.price_eur ?? Infinity)
