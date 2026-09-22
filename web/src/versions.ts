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
  price_eur_foil: number | null
  image: string | null
  promo: boolean
  frame_effects: string[]
  promo_types: string[]
  border: string
  lang: string
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
    price_eur_foil: Number((card.prices as unknown as Record<string, string>)?.eur_foil) || null,
    image:
      ((card.image_uris as unknown as Record<string, string>)?.normal ??
        ((card.card_faces as unknown as Record<string, Record<string, string>>[])?.[0]?.image_uris
          ?.normal as string)) ?? null,
    promo: Boolean(card.promo),
    frame_effects: (card.frame_effects as unknown as string[]) ?? [],
    promo_types: (card.promo_types as unknown as string[]) ?? [],
    border: (card.border_color as unknown as string) ?? 'black',
    lang: (card.lang as unknown as string) ?? 'en',
  }))
}

/** "Showcase", "Mana Foil" and the like, so a special printing is named. */
const EFFECTS: Record<string, string> = {
  showcase: 'Showcase',
  extendedart: 'Extended Art',
  etched: 'Etched',
  fullart: 'Vollbild',
  legendary: 'Legendärer Rahmen',
}

const PROMOS: Record<string, string> = {
  manafoil: 'Mana Foil',
  fracturefoil: 'Fractured Foil',
  halofoil: 'Halo Foil',
  galaxyfoil: 'Galaxy Foil',
  surgefoil: 'Surge Foil',
  confettifoil: 'Confetti Foil',
  ripplefoil: 'Ripple Foil',
  rainbowfoil: 'Rainbow Foil',
  doublerainbow: 'Double Rainbow',
  textured: 'Textured Foil',
  neonink: 'Neon Ink',
  japanshowcase: 'Japan Showcase',
  prerelease: 'Prerelease',
  promopack: 'Promo Pack',
  serialized: 'Nummeriert',
  stepandcompleat: 'Step-and-Compleat',
  oilslick: 'Oil Slick',
  gilded: 'Gilded',
  embossed: 'Geprägt',
  raisedfoil: 'Raised Foil',
}

/** Words that say nothing about how the card looks. */
const NOISE = ['boosterfun', 'stamped', 'datestamped', 'setextension', 'bundle', 'buyabox']

export function versionLabel(version: Version) {
  const extras = version.frame_effects.map((effect) => EFFECTS[effect]).filter(Boolean)
  if (version.border === 'borderless') extras.push('Randlos')
  for (const type of version.promo_types) {
    if (NOISE.includes(type)) continue
    extras.push(PROMOS[type] ?? type)
  }
  if (!extras.length && version.promo) extras.push('Promo')
  return [...new Set(extras)].join(' · ')
}

/** "21,65 € · Foil 26,44 €", whichever of the two Cardmarket has. */
export function versionPrice(version: Version) {
  const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
  const parts: string[] = []
  if (version.price_eur != null) parts.push(euro(version.price_eur))
  if (version.price_eur_foil != null) parts.push(`Foil ${euro(version.price_eur_foil)}`)
  return parts.join(' · ')
}
