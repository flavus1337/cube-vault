import { colorGroupOf, isLand as isLandType, RARITIES, RARITY, typeOf, TYPES, COLOR_GROUPS } from './mtg'
import type { Card, PrivateCard } from './supabase'

export type Deck = { id: string; name: string; created_at: string }
export type DeckCard = { deck_id: string; print_id: string; qty: number }
/** One row of a deck together with the card it stands for. */
export type DeckRow = { row: DeckCard; card: PoolCard }

/* A card a deck can hold, from the player's own cards or from the cube. `key`
   is what deck_cards stores: the scanned print for own cards, the card id for
   cube cards. It carries the full card shape so the cube search works on it. */
export type PoolCard = Card & { key: string; owned: number; source: 'mine' | 'cube' }


export const GROUP_BY: Record<string, string> = {
  type: 'Typ',
  color: 'Farbe',
  cmc: 'Manabetrag',
  rarity: 'Seltenheit',
}
export const SORT_BY: Record<string, string> = {
  name: 'Name',
  cmc: 'Manabetrag',
  price: 'Preis',
  qty: 'Anzahl',
}

export const name = (c: PoolCard) => c.name_de || c.name
export const typeLine = (c: PoolCard) => c.type_de || c.type_line
export const isLand = (c: PoolCard) => isLandType(typeLine(c))
export const groupOf = (c: PoolCard) => colorGroupOf(c.colors, typeLine(c))

export const columnOf = (card: PoolCard) => typeOf(typeLine(card), true)

/** The columns of the deck view: a label, the cards in it, and a colour dot. */
export function columnsOf(rows: { row: DeckCard; card: PoolCard }[], by: string) {
  const buckets = new Map<string, { row: DeckCard; card: PoolCard }[]>()
  const key = (card: PoolCard) => {
    if (by === 'color') return COLOR_GROUPS.find(([g]) => g === groupOf(card))![1]
    if (by === 'cmc') return card.cmc >= 7 ? '7+ Mana' : `${card.cmc} Mana`
    if (by === 'rarity') return RARITY[card.rarity] ?? 'Sonstiges'
    return columnOf(card)
  }
  for (const entry of rows) {
    const label = key(entry.card)
    buckets.set(label, [...(buckets.get(label) ?? []), entry])
  }
  const order =
    by === 'color'
      ? COLOR_GROUPS.map(([, label]) => label)
      : by === 'cmc'
        ? ['0 Mana', '1 Mana', '2 Mana', '3 Mana', '4 Mana', '5 Mana', '6 Mana', '7+ Mana']
        : by === 'rarity'
          ? RARITIES.map(([, label]) => label)
          : [...TYPES.map(([, plural]) => plural), 'Sonstiges']
  const rest = [...buckets.keys()].filter((label) => !order.includes(label))
  return [...order, ...rest]
    .filter((label) => buckets.has(label))
    .map((label) => ({
      label,
      dot: by === 'color' ? COLOR_GROUPS.find(([, l]) => l === label)?.[0] : null,
      rows: buckets.get(label)!,
    }))
}

export function fromPrivate(card: PrivateCard): PoolCard {
  return {
    ...card,
    id: card.print_id,
    key: card.print_id,
    owned: card.qty,
    source: 'mine',
    // Own cards keep less data than cube cards; the search treats these as empty.
    oracle_text: '',
    text_de: null,
    color_identity: card.colors,
    keywords: [],
    legalities: null,
    layout: null,
    image_en: card.image,
    excluded: false,
    exclude_reason: null,
    rarity: card.rarity ?? 'common',
  }
}

export function fromCube(card: Card, copies: number): PoolCard {
  return { ...card, key: card.id, owned: copies, source: 'cube' }
}

/* Ten cards from a shuffled deck, so you can see what an opening looks like.
   Every copy is its own card in the pile. */
export function drawTen(cards: { row: DeckCard; card: PoolCard }[]) {
  const pile = cards.flatMap(({ row, card }) => Array<PoolCard>(row.qty).fill(card))
  for (let i = pile.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pile[i], pile[j]] = [pile[j], pile[i]]
  }
  return pile.slice(0, 10)
}

/* Decks are private: only their owner sees them. The cards in them can come
   from the player's own collection or from the shared cube. */
