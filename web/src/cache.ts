import type { CardTag } from './tags'
import type { Card, Copy, CubeSet, PrivateCard } from './supabase'

/* The cube is a few megabytes of cards that hardly ever change. It lives in
   IndexedDB, not in localStorage: that one holds about 5 MB per site and threw
   the whole cube away once it was full. A visit then only asks for the events
   since the last one. Card rows and prices are written without an event, so
   the copy expires after a while. */
const DB = 'cube-vault'
const STORE = 'cube'
// v3: the cube moved out of localStorage; older copies are ignored.
const KEY = 'cube-v3'
const MAX_AGE = 6 * 60 * 60 * 1000

export type CubeCache = {
  at: number
  lastEvent: number
  cards: Card[]
  sets: CubeSet[]
  copies: Copy[]
  tags: CardTag[]
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = work(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result as T)
        request.onerror = () => reject(request.error)
      }),
  )
}

export async function readCache(): Promise<CubeCache | null> {
  try {
    const cache = await run<CubeCache | undefined>('readonly', (store) => store.get(KEY))
    if (!cache || Date.now() - cache.at > MAX_AGE) return null
    return cache.cards?.length ? cache : null
  } catch {
    return null
  }
}

export async function writeCache(cache: Omit<CubeCache, 'at'>) {
  try {
    await run('readwrite', (store) => store.put({ ...cache, at: Date.now() }, KEY))
  } catch {
    // No storage at all: the page just fetches everything again.
  }
}

export async function clearCache() {
  try {
    await run('readwrite', (store) => store.delete(KEY))
  } catch {
    // nothing to do
  }
}

/* Own cards are few and only you change them, so the page shows the stored
   ones at once and replaces them with whatever the database answers. */
const MINE = 'my-cards-v2'

export function readMine(): PrivateCard[] | null {
  try {
    const raw = localStorage.getItem(MINE)
    return raw ? (JSON.parse(raw) as PrivateCard[]) : null
  } catch {
    return null
  }
}

export function writeMine(cards: PrivateCard[]) {
  try {
    localStorage.setItem(MINE, JSON.stringify(cards))
  } catch {
    // No space or no storage at all: the page just fetches them again.
  }
}
