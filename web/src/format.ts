export const euro = (n: number | null) =>
  n == null ? '–' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

/** "12 Karten · 15 Kopien · 42,00 €", plus what is missing and what it costs. */
export function summary(
  owned: { cards: number; copies: number; value: number },
  missing?: { cards: number; value: number },
) {
  const line = `${owned.cards} Karten · ${owned.copies} Kopien · ${euro(owned.value)}`
  return missing?.cards ? `${line} · ${missing.cards} fehlen · ${euro(missing.value)}` : line
}

export const RARITY: Record<string, string> = {
  common: 'Gewöhnlich',
  uncommon: 'Ungewöhnlich',
  rare: 'Selten',
  mythic: 'Mythisch selten',
}

/** Sharpest Scryfall image (745×1040 PNG), only worth it in the detail view. */
export const png = (url: string) => url.replace('/normal/', '/png/').replace('.jpg', '.png')

export const cardmarket = (name: string) =>
  `https://www.cardmarket.com/de/Magic/Products/Search?searchString=${encodeURIComponent(name)}`

/** The finishes a card can be printed in, in the order they are offered. */
export const FINISHES: [string, string][] = [
  ['nonfoil', 'Normal'],
  ['foil', 'Foil'],
  ['etched', 'Etched Foil'],
]

export const finishLabel = (finish: string) =>
  FINISHES.find(([key]) => key === finish)?.[1] ?? finish
