/* Every printing of a card, from Scryfall. Used in the detail view to show
   which version you own and what else exists. */

export type Version = {
  id: string
  set: string
  set_name: string
  number: string
  released: string
  finishes: string[]
  price_eur: number | null
  image: string | null
  promo: boolean
  frame_effects: string[]
}

export async function versionsOf(oracleId: string): Promise<Version[]> {
  const query = new URLSearchParams({
    q: `oracleid:${oracleId}`,
    unique: 'prints',
    order: 'released',
    dir: 'desc',
  })
  const res = await fetch(`https://api.scryfall.com/cards/search?${query}`, {
    headers: { Accept: 'application/json' },
  })
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`Scryfall antwortet mit ${res.status}`)
  const data = (await res.json()).data as Record<string, never>[]
  return data.map((card) => ({
    id: card.id as unknown as string,
    set: card.set as unknown as string,
    set_name: card.set_name as unknown as string,
    number: card.collector_number as unknown as string,
    released: card.released_at as unknown as string,
    finishes: (card.finishes as unknown as string[]) ?? [],
    price_eur: Number((card.prices as unknown as Record<string, string>)?.eur) || null,
    image:
      ((card.image_uris as unknown as Record<string, string>)?.normal ??
        ((card.card_faces as unknown as Record<string, Record<string, string>>[])?.[0]?.image_uris
          ?.normal as string)) ?? null,
    promo: Boolean(card.promo),
    frame_effects: (card.frame_effects as unknown as string[]) ?? [],
  }))
}

/** "Showcase", "Borderless" and the like, so a special artwork is named. */
const EFFECTS: Record<string, string> = {
  showcase: 'Showcase',
  extendedart: 'Extended Art',
  borderless: 'Randlos',
  inverted: 'Invertiert',
  etched: 'Etched',
  fullart: 'Vollbild',
}

export function versionLabel(version: Version) {
  const extras = version.frame_effects.map((effect) => EFFECTS[effect]).filter(Boolean)
  if (version.promo) extras.push('Promo')
  return extras.join(' · ')
}
