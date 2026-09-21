import type { CardTag } from './tags'
import type { Card, Copy, CubeSet } from './supabase'

/* The cube is about 2 MB of cards that hardly ever change. Keeping them in
   localStorage means a visit only asks for the events since the last one.
   Card rows and prices are written without an event, so the copy expires. */
const KEY = 'cube-cards-v1'
const MAX_AGE = 6 * 60 * 60 * 1000

export type CubeCache = {
  at: number
  lastEvent: number
  cards: Card[]
  sets: CubeSet[]
  copies: Copy[]
  tags: CardTag[]
}

export function readCache(): CubeCache | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const cache = JSON.parse(raw) as CubeCache
    if (Date.now() - cache.at > MAX_AGE) return null
    return cache.cards?.length ? cache : null
  } catch {
    return null
  }
}

export function writeCache(cache: Omit<CubeCache, 'at'>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...cache, at: Date.now() }))
  } catch {
    // No space or no storage at all: the page just fetches everything again.
  }
}

export function clearCache() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing to do
  }
}
