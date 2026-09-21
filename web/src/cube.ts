import { useEffect, useMemo, useRef, useState } from 'react'
import { readCache, writeCache } from './cache'
import { fetchAll, supabase, type Card, type Copy, type CubeSet } from './supabase'
import type { CardTag } from './tags'

const countCopies = (rows: Copy[]) => {
  const counts = new Map<string, number>()
  for (const c of rows) counts.set(c.card_id, (counts.get(c.card_id) ?? 0) + c.qty)
  return counts
}

const groupTags = (rows: CardTag[]) => {
  const byCard = new Map<string, string[]>()
  for (const row of rows) byCard.set(row.card_id, [...(byCard.get(row.card_id) ?? []), row.tag])
  return byCard
}

const groupPrints = (rows: Copy[]) => {
  const byCard = new Map<string, Copy[]>()
  for (const c of rows) byCard.set(c.card_id, [...(byCard.get(c.card_id) ?? []), c])
  for (const list of byCard.values()) list.sort((a, b) => b.qty - a.qty)
  return byCard
}

type Store = { lastEvent: number; cards: Card[]; sets: CubeSet[]; copies: Copy[]; tags: CardTag[] }
const empty: Store = { lastEvent: 0, cards: [], sets: [], copies: [], tags: [] }

/* The cube for every page that shows it. The cards come from localStorage and
   only the events since the last visit are fetched, which keeps a visit at a
   few kilobytes instead of about 2 MB. */
export function useCube() {
  const [store, setStore] = useState<Store>(() => readCache() ?? empty)
  const [loading, setLoading] = useState(() => !readCache())
  const [error, setError] = useState<string | null>(null)
  const live = useRef<Store>(store)

  function apply(next: Store) {
    live.current = next
    setStore(next)
    setError(null)
    setLoading(false)
    writeCache(next)
  }

  useEffect(() => {
    let stop = false

    async function loadAll() {
      try {
        const [cards, sets, copies, tags, newest] = await Promise.all([
          fetchAll<Card>('cards', 'id'),
          fetchAll<CubeSet>('sets', 'code'),
          fetchAll<Copy>('copies', 'print_id'),
          fetchAll<CardTag>('card_tags', 'card_id'),
          supabase.from('card_events').select('id').order('id', { ascending: false }).limit(1).maybeSingle(),
        ])
        if (stop) return
        apply({ cards, sets, copies, tags, lastEvent: (newest.data?.id as number | undefined) ?? 0 })
      } catch (e) {
        if (!stop) {
          setError((e as Error).message)
          setLoading(false)
        }
      }
    }

    /* Other people's scans arrive as events, so only the cards named in the
       new events are fetched again. A hidden tab asks for nothing. */
    async function catchUp() {
      if (document.hidden) return
      const { data: events } = await supabase
        .from('card_events')
        .select('id, action, card_id')
        .gt('id', live.current.lastEvent)
        .order('id')
      if (stop || !events?.length) return
      const lastEvent = events[events.length - 1].id as number

      // A set came or went: which cards belong to the cube changes, so reload.
      if (events.some((e) => String(e.action).startsWith('set_'))) return loadAll()

      const ids = [...new Set(events.map((e) => e.card_id).filter((id): id is string => Boolean(id)))]
      if (!ids.length) return apply({ ...live.current, lastEvent })
      const [changedCards, changedCopies] = await Promise.all([
        supabase.from('cards').select('*').in('id', ids),
        supabase.from('copies').select('*').in('card_id', ids),
      ])
      if (stop) return
      apply({
        ...live.current,
        lastEvent,
        cards: [...live.current.cards.filter((c) => !ids.includes(c.id)), ...((changedCards.data ?? []) as Card[])],
        copies: [
          ...live.current.copies.filter((row) => !ids.includes(row.card_id)),
          ...((changedCopies.data ?? []) as Copy[]),
        ],
      })
    }

    // The cached cube is already on screen; only the events since then matter.
    if (live.current.cards.length) catchUp()
    else loadAll()
    const timer = setInterval(catchUp, 15000)
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [])

  // Kept stable, so the pages can memoize their filtering on them.
  const copies = useMemo(() => countCopies(store.copies), [store.copies])
  const prints = useMemo(() => groupPrints(store.copies), [store.copies])
  const tags = useMemo(() => groupTags(store.tags), [store.tags])

  return {
    cards: store.cards,
    sets: store.sets,
    copies,
    prints,
    tags,
    loading,
    error,
    /** After your own change, so you see it before the next catch-up. */
    async reloadCopies() {
      apply({ ...live.current, copies: await fetchAll<Copy>('copies', 'print_id') })
    },
    patchCard(card: Card) {
      apply({ ...live.current, cards: live.current.cards.map((c) => (c.id === card.id ? card : c)) })
    },
  }
}
