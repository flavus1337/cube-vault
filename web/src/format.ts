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
