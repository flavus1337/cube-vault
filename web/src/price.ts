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
