import { useEffect, useState } from 'react'
import { fetchAll, supabase, type CardEvent, type Profile } from './supabase'

/* Who put this card into the cube, and when. The history holds it per card
   already; it was only ever shown as one long list over everything. */
export function CardHistory({ cardId }: { cardId: string }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<CardEvent[] | null>(null)
  const [players, setPlayers] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || rows) return
    let stop = false
    Promise.all([
      supabase
        .from('card_events')
        .select('*')
        .eq('card_id', cardId)
        .order('at', { ascending: false })
        .limit(20),
      fetchAll<Profile>('profiles', 'id'),
    ])
      .then(([events, profiles]) => {
        if (stop) return
        if (events.error) throw events.error
        setRows(events.data as CardEvent[])
        setPlayers(new Map(profiles.map((p) => [p.id, p.name])))
      })
      .catch((e) => !stop && setError((e as Error).message))
    return () => {
      stop = true
    }
  }, [open, rows, cardId])

  return (
    <div className="versions">
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Verlauf ausblenden' : 'Verlauf dieser Karte'}
      </button>
      {open && error && <p className="warn">Verlauf laden fehlgeschlagen: {error}</p>}
      {open && !rows && !error && <p className="muted">Lädt …</p>}
      {open && rows && !rows.length && <p className="muted">Zu dieser Karte gibt es noch nichts.</p>}
      {open && rows && rows.length > 0 && (
        <ul className="card-history">
          {rows.map((row) => (
            <li key={row.id}>
              <span className="when">
                {new Date(row.at).toLocaleDateString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit',
                })}
              </span>
              <span className="who">{players.get(row.user_id ?? '') ?? 'Unbekannt'}</span>
              <span className="what">
                {row.delta ? `${row.delta > 0 ? '+' : ''}${row.delta} Kopie${Math.abs(row.delta) === 1 ? '' : 'n'}` : row.action}
                {row.note && <span className="muted"> · {row.note.replace('scan', 'App').replace('web', 'Website')}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
