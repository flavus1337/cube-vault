import { useEffect, useMemo, useState } from 'react'
import { useCube } from './cube'
import { euro } from './format'
import { RowSkeleton } from './Skeleton'
import Summary from './Summary'
import { fetchAll, type CardEvent, type Profile, type Role } from './supabase'

const ROLES: Record<Role, string> = {
  waiting: 'Wartet',
  player: 'Spieler',
  editor: 'Editor',
  admin: 'Admin',
}

const day = (iso: string) => iso.slice(0, 10)
const germanDay = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })

/* What each player did to the cube. Only the shared cube can be counted:
   private cards and decks belong to their owner and the database does not
   hand them to anyone else, not even an admin. */
type PlayerRow = {
  id: string
  name: string
  role: Role
  added: number
  removed: number
  cards: Set<string>
  sets: Set<string>
  foils: number
  fromApp: number
  fromWeb: number
  first: string | null
  last: string | null
}

export default function AdminPage() {
  const cube = useCube()
  const [events, setEvents] = useState<CardEvent[] | null>(null)
  const [players, setPlayers] = useState<Profile[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stop = false
    Promise.all([fetchAll<CardEvent>('card_events', 'id'), fetchAll<Profile>('profiles', 'id')])
      .then(([events, profiles]) => {
        if (stop) return
        setEvents(events)
        setPlayers(profiles)
      })
      .catch((e) => !stop && setError((e as Error).message))
    return () => {
      stop = true
    }
  }, [])

  const rows = useMemo(() => {
    if (!events) return []
    const byPlayer = new Map<string, PlayerRow>()
    for (const player of players) {
      byPlayer.set(player.id, {
        id: player.id,
        name: player.name,
        role: player.role,
        added: 0,
        removed: 0,
        cards: new Set(),
        sets: new Set(),
        foils: 0,
        fromApp: 0,
        fromWeb: 0,
        first: null,
        last: null,
      })
    }
    for (const event of events) {
      if (!event.user_id) continue
      const row = byPlayer.get(event.user_id)
      if (!row || (event.action !== 'copy_added' && event.action !== 'copy_removed')) continue
      const delta = event.delta ?? 0
      if (delta > 0) row.added += delta
      else row.removed -= delta
      if (event.card_id) row.cards.add(event.card_id)
      if (event.set_code) row.sets.add(event.set_code)
      if (event.note?.includes('Foil')) row.foils += Math.max(delta, 0)
      // The note says where a change came from; older rows carry nothing.
      if (event.note?.includes('web')) row.fromWeb += Math.max(delta, 0)
      else row.fromApp += Math.max(delta, 0)
      if (!row.first || event.at < row.first) row.first = event.at
      if (!row.last || event.at > row.last) row.last = event.at
    }
    return [...byPlayer.values()].sort((a, b) => b.added - a.added || a.name.localeCompare(b.name, 'de'))
  }, [events, players])

  /** Scans per day for the last four weeks, for the bars. */
  const recent = useMemo(() => {
    const days: [string, number][] = []
    const counts = new Map<string, number>()
    for (const event of events ?? []) {
      if (event.action !== 'copy_added') continue
      const key = day(event.at)
      counts.set(key, (counts.get(key) ?? 0) + (event.delta ?? 0))
    }
    for (let i = 27; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const key = date.toISOString().slice(0, 10)
      days.push([key, counts.get(key) ?? 0])
    }
    return days
  }, [events])

  const inCube = useMemo(() => new Set(cube.sets.filter((s) => s.in_cube).map((s) => s.code)), [cube.sets])
  const cards = useMemo(
    () => cube.cards.filter((c) => inCube.has(c.set_code) && !c.excluded),
    [cube.cards, inCube],
  )
  const owned = cards.filter((c) => cube.copies.get(c.id))
  const figures = {
    cards: owned.length,
    copies: [...cube.copies.values()].reduce((sum, n) => sum + n, 0),
    value: owned.reduce(
      (sum, c) =>
        sum +
        (cube.prints.get(c.id) ?? []).reduce(
          (inner, row) => inner + row.qty * (row.price_eur ?? c.price_eur ?? 0),
          0,
        ),
      0,
    ),
    missing: {
      cards: cards.length - owned.length,
      value: cards
        .filter((c) => !cube.copies.get(c.id))
        .reduce((sum, c) => sum + (c.price_eur ?? 0), 0),
    },
  }

  const scans = (events ?? []).filter((e) => e.action === 'copy_added')
  const max = Math.max(1, ...recent.map(([, n]) => n))

  if (error) return <main className="page narrow"><p className="status">Laden fehlgeschlagen: {error}</p></main>
  if (!events) return <main className="page narrow"><h1>Übersicht</h1><RowSkeleton count={8} /></main>

  return (
    <main className="page narrow">
      <h1>Übersicht</h1>
      <p className="muted">
        Was im Cube steckt und wer ihn gefüllt hat. Eigene Karten und Decks der Spieler stehen hier
        nicht: die gibt die Datenbank niemandem heraus, auch keinem Admin.
      </p>

      <Summary {...figures} />

      <h2>Scans je Tag</h2>
      <div className="curve" role="img" aria-label={`Scans der letzten vier Wochen: ${recent.map(([d, n]) => `${germanDay(d)}: ${n}`).join(', ')}`}>
        {recent.map(([date, count]) => (
          <span key={date} className="curve-col" title={`${germanDay(date)}: ${count} Scans`}>
            <span className="curve-value">{count || ''}</span>
            <span className="curve-bar" style={{ height: `${(count / max) * 100}%` }} />
          </span>
        ))}
      </div>
      <p className="muted">
        {scans.reduce((sum, e) => sum + (e.delta ?? 0), 0)} Kopien insgesamt gescannt, davon{' '}
        {recent.reduce((sum, [, n]) => sum + n, 0)} in den letzten vier Wochen.
      </p>

      <h2>Spieler</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Spieler</th>
              <th>Rolle</th>
              <th className="num">Gescannt</th>
              <th className="num">Entfernt</th>
              <th className="num">Karten</th>
              <th className="num">Sets</th>
              <th className="num">Foils</th>
              <th>App / Website</th>
              <th>Zuletzt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.role === 'waiting' ? 'waiting' : undefined}>
                <td>{row.name}</td>
                <td>{ROLES[row.role]}</td>
                <td className="num">{row.added || '—'}</td>
                <td className="num">{row.removed || '—'}</td>
                <td className="num">{row.cards.size || '—'}</td>
                <td className="num">{row.sets.size || '—'}</td>
                <td className="num">{row.foils || '—'}</td>
                <td>
                  {row.added ? `${row.fromApp} / ${row.fromWeb}` : '—'}
                </td>
                <td>{row.last ? new Date(row.last).toLocaleDateString('de-DE') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Sets</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Set</th>
              <th className="num">Karten im Set</th>
              <th className="num">Davon vorhanden</th>
              <th className="num">Kopien</th>
              <th className="num">Wert</th>
            </tr>
          </thead>
          <tbody>
            {cube.sets
              .filter((set) => inCube.has(set.code))
              .map((set) => {
                const ofSet = cards.filter((c) => c.set_code === set.code)
                const have = ofSet.filter((c) => cube.copies.get(c.id))
                const copies = ofSet.reduce((sum, c) => sum + (cube.copies.get(c.id) ?? 0), 0)
                const value = have.reduce(
                  (sum, c) =>
                    sum +
                    (cube.prints.get(c.id) ?? []).reduce(
                      (inner, row) => inner + row.qty * (row.price_eur ?? c.price_eur ?? 0),
                      0,
                    ),
                  0,
                )
                return (
                  <tr key={set.code}>
                    <td>{set.name}</td>
                    <td className="num">{ofSet.length}</td>
                    <td className="num">{have.length}</td>
                    <td className="num">{copies}</td>
                    <td className="num">{euro(value)}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      <h2>Datenbank</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tabelle</th>
              <th className="num">Zeilen</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Karten</td><td className="num">{cube.cards.length}</td></tr>
            <tr><td>Kopien (Stapel)</td><td className="num">{cube.prints.size}</td></tr>
            <tr><td>Sets</td><td className="num">{cube.sets.length}</td></tr>
            <tr><td>Schlagwörter</td><td className="num">{cube.tags.size}</td></tr>
            <tr><td>Verlauf</td><td className="num">{events.length}</td></tr>
            <tr><td>Spieler</td><td className="num">{players.length}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="muted">
        Der freie Tarif von Supabase erlaubt 500 MB; die Karten sind der größte Teil davon und
        wachsen nur, wenn ein neues Set dazukommt.
      </p>
    </main>
  )
}
