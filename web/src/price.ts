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

/* The cheapest cards that still fit a budget. A card without a price counts
   as free — Scryfall simply does not know it, and leaving it out would hide
   it from the list for good. */
export function withinBudget<T extends { price_eur: number | null }>(cards: T[], limit: number) {
  if (!limit) return cards
  const cheapest = [...cards].sort((a, b) => (a.price_eur ?? 0) - (b.price_eur ?? 0))
  const fits: T[] = []
  let spent = 0
  for (const card of cheapest) {
    const price = card.price_eur ?? 0
    if (spent + price > limit) break
    fits.push(card)
    spent += price
  }
  return fits
}
