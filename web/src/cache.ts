import type { CardTag } from './tags'
import type { Card, Copy, CubeSet, PrivateCard } from './supabase'

/* The cube is a few megabytes of cards that hardly ever change. It lives in
   IndexedDB, not in localStorage: that one holds about 5 MB per site and threw
   the whole cube away once it was full. A visit then only asks for the events
   since the last one. Card rows and prices are written without an event, so
   the copy expires after a while. */
const DB = 'cube-vault'
const STORE = 'cube'
const KEY = 'cube-v3'
const MAX_AGE = 6 * 60 * 60 * 1000

export type CubeCache = {
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

/** Anything older than this is fetched again. */
async function read<T>(key: string, maxAge: number): Promise<T | null> {
  try {
    const box = await run<{ at: number; value: T } | undefined>('readonly', (store) => store.get(key))
    if (!box || Date.now() - box.at > maxAge) return null
    return box.value
  } catch {
    return null
  }
}

async function write(key: string, value: unknown) {
  try {
    await run('readwrite', (store) => store.put({ at: Date.now(), value }, key))
  } catch {
    // No storage at all: the page just fetches everything again.
  }
}

async function remove(key: string) {
  try {
    await run('readwrite', (store) => store.delete(key))
  } catch {
    // nothing to do
  }
}

export async function readCache(): Promise<CubeCache | null> {
  const cache = await read<CubeCache>(KEY, MAX_AGE)
  return cache?.cards?.length ? cache : null
}

export const writeCache = (cache: CubeCache) => write(KEY, cache)
export const clearCache = () => remove(KEY)

/* Own cards are few and only you change them, so the page shows the stored
   ones at once and replaces them with whatever the database answers. */
const MINE = 'mine-v3'
const MINE_MAX_AGE = 24 * 60 * 60 * 1000

export const readMine = () => read<PrivateCard[]>(MINE, MINE_MAX_AGE)
export const writeMine = (cards: PrivateCard[]) => write(MINE, cards)
