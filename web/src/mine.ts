import { useEffect, useState } from 'react'
import { readMine, writeMine } from './cache'
import { fetchAll, type PrivateCard } from './supabase'

/* Your own cards, for the three pages that show them. Kept outside the hook,
   so switching pages shows them at once; the browser's copy carries them over
   to the next visit, and the database has the last word. */
let shared: PrivateCard[] | null = null

export function usePrivateCards() {
  const [cards, setCards] = useState<PrivateCard[]>(shared ?? [])
  const [loading, setLoading] = useState(!shared)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stop = false

    function take(rows: PrivateCard[]) {
      shared = rows
      if (stop) return
      setCards(rows)
      setLoading(false)
    }

    // The stored cards fill the page while the fresh ones are on their way.
    if (!shared) readMine().then((rows) => rows && !shared && take(rows))
    fetchAll<PrivateCard>('private_cards', 'print_id')
      .then((rows) => {
        take(rows)
        void writeMine(rows)
        if (!stop) setError(null)
      })
      .catch((e) => {
        if (!stop) {
          setError((e as Error).message)
          setLoading(false)
        }
      })
    return () => {
      stop = true
    }
  }, [])

  return {
    cards,
    loading,
    error,
    /** After your own change, so you see it before the next visit. */
    async reload() {
      const rows = await fetchAll<PrivateCard>('private_cards', 'print_id')
      shared = rows
      setCards(rows)
      void writeMine(rows)
    },
  }
}
