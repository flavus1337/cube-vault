import { useCallback, useEffect, useState } from 'react'
import { downloadBackup } from './backup'
import { importSet } from './importSet'
import { useNotices } from './notices'
import { RowSkeleton } from './Skeleton'
import {
  canEdit,
  fetchAll,
  supabase,
  type Card,
  type CardEvent,
  type Copy,
  type CubeSet,
  type Profile,
  type Role,
} from './supabase'

const ACTIONS: Record<string, string> = {
  set_added: 'Set hinzugefügt',
  set_removed: 'Set aus dem Cube genommen',
  set_included: 'Set wieder im Cube',
  set_deleted: 'Set gelöscht',
  card_excluded: 'Karte ausgeschlossen',
  card_included: 'Karte wieder aufgenommen',
  copy_added: 'Kopie gescannt',
  copy_removed: 'Kopie entfernt',
  player_role: 'Rolle geändert',
}

// What the copy_added / copy_removed events record as their source.
const SOURCES: Record<string, string> = { scan: 'Scanner', web: 'Website' }

const ROLES: Record<Role, string> = {
  waiting: 'Wartet',
  player: 'Spieler',
  editor: 'Editor',
  admin: 'Admin',
}

export function HistoryPage() {
  const [events, setEvents] = useState<CardEvent[] | null>(null)
  const [players, setPlayers] = useState<Map<string, string>>(new Map())
  const [cardNames, setCardNames] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase
        .from('card_events')
        .select('*')
        .order('at', { ascending: false })
        .limit(200)
      if (error) throw error
      const ids = [...new Set(data.map((e) => e.card_id).filter(Boolean))]
      const [profiles, cards] = await Promise.all([
        fetchAll<Profile>('profiles', 'id'),
        ids.length ? supabase.from('cards').select('id, name, name_de').in('id', ids) : null,
      ])
      if (cards?.error) throw cards.error
      setPlayers(new Map(profiles.map((p) => [p.id, p.name])))
      setCardNames(new Map((cards?.data ?? []).map((c) => [c.id, c.name_de || c.name])))
      setEvents(data)
    })().catch((e) => setError(e.message))
  }, [])

  return (
    <main className="page narrow">
      <h1>Verlauf</h1>
      {error ? (
        <p className="status">Laden fehlgeschlagen: {error}</p>
      ) : !events ? (
        <RowSkeleton />
      ) : !events.length ? (
        <p className="status">Noch keine Änderungen.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Wer</th>
                <th>Was</th>
                <th>Karte / Spieler</th>
                <th>Set</th>
                <th className="num">±</th>
                <th>Notiz</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{new Date(e.at).toLocaleString('de-DE')}</td>
                  <td>{(e.user_id && players.get(e.user_id)) ?? '–'}</td>
                  <td>{ACTIONS[e.action] ?? e.action}</td>
                  <td>
                    {e.card_id
                      ? (cardNames.get(e.card_id) ?? e.card_id)
                      : e.player_id
                        ? (players.get(e.player_id) ?? '–')
                        : ''}
                  </td>
                  <td>{e.set_code?.toUpperCase()}</td>
                  <td className="num">{e.delta ? (e.delta > 0 ? `+${e.delta}` : e.delta) : ''}</td>
                  <td>{e.note ? (SOURCES[e.note] ?? e.note) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

export function SetsPage({ role }: { role: Role }) {
  const notices = useNotices()
  const [saving, setSaving] = useState(false)
  const [sets, setSets] = useState<CubeSet[] | null>(null)
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  // Per set: how many of its cards have at least one scanned copy.
  const [owned, setOwned] = useState<Map<string, number>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [progress, setProgress] = useState('')
  const [importing, setImporting] = useState(false)
  const [linking, setLinking] = useState(false)
  const editable = canEdit(role)

  const load = useCallback(() => {
    Promise.all([
      fetchAll<CubeSet>('sets', 'code'),
      fetchAll<Pick<Card, 'id' | 'set_code'>>('cards', 'id', 'id, set_code'),
      fetchAll<Copy>('copies', 'print_id'),
    ])
      .then(([sets, cards, copyRows]) => {
        const counts = new Map<string, number>()
        for (const c of cards) counts.set(c.set_code, (counts.get(c.set_code) ?? 0) + 1)

        const setOf = new Map(cards.map((c) => [c.id, c.set_code]))
        const scanned = new Set(copyRows.map((row) => row.card_id))
        const ownedPerSet = new Map<string, number>()
        for (const cardId of scanned) {
          const code = setOf.get(cardId)
          if (code) ownedPerSet.set(code, (ownedPerSet.get(code) ?? 0) + 1)
        }

        setSets(sets.sort((a, b) => (b.released_at ?? '').localeCompare(a.released_at ?? '')))
        setCounts(counts)
        setOwned(ownedPerSet)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  /** Bonus sheets belong to a main set; Scryfall knows it for most of them. */
  async function linkParents() {
    setLinking(true)
    setProgress('Zuordnung bei Scryfall holen …')
    try {
      const known = new Set((sets ?? []).map((set) => set.code))
      let linked = 0
      for (const set of (sets ?? []).filter((set) => !set.parent_code)) {
        const res = await fetch(`https://api.scryfall.com/sets/${set.code}`, {
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) continue
        const parent = (await res.json()).parent_set_code as string | undefined
        if (!parent || !known.has(parent)) continue
        const { error } = await supabase.from('sets').update({ parent_code: parent }).eq('code', set.code)
        if (error) throw error
        linked++
      }
      setProgress(
        linked
          ? `Fertig: ${linked} Sets zugeordnet.`
          : 'Scryfall kennt für die übrigen Sets kein Hauptset. Setze es von Hand.',
      )
      load()
    } catch (e) {
      setProgress(`Zuordnung fehlgeschlagen: ${(e as Error).message}`)
    } finally {
      setLinking(false)
    }
  }

  async function setParent(set: CubeSet, parent: string) {
    const { error } = await supabase
      .from('sets')
      .update({ parent_code: parent || null })
      .eq('code', set.code)
    if (error) return notices.say(`Speichern fehlgeschlagen: ${error.message}`, 'error')
    load()
  }

  async function toggle(set: CubeSet) {
    const { error } = await supabase.from('sets').update({ in_cube: !set.in_cube }).eq('code', set.code)
    if (error) return notices.say(`Speichern fehlgeschlagen: ${error.message}`, 'error')
    load()
  }

  async function runImport(event: React.FormEvent) {
    event.preventDefault()
    if (!code.trim()) return
    setImporting(true)
    try {
      await importSet(code, setProgress)
      setCode('')
      load()
    } catch (e) {
      setProgress(`Import fehlgeschlagen: ${(e as Error).message}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <main className="page narrow">
      <h1>Sets</h1>
      {editable && (
        <form className="import" onSubmit={runImport}>
          <p className="muted">
            Sets kommen automatisch dazu, wenn ihr die erste Karte scannt. Ein ganzes Set zu laden ist
            optional: Dann seht ihr im Cube auch, welche Karten noch fehlen.
          </p>
          <label htmlFor="set-code">Scryfall-Setcode</label>
          <input
            id="set-code"
            placeholder="z. B. blb"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={importing}
          />
          <button className="primary" disabled={importing || !code.trim()}>
            Ganzes Set laden
          </button>
          <button type="button" disabled={linking} onClick={linkParents}>
            {linking ? 'wird zugeordnet …' : 'Zuordnung von Scryfall holen'}
          </button>
          <button
            type="button"
            disabled={saving}
            title="Lädt Sets, Karten, Kopien, Schlagwörter, deine eigenen Karten, Decks und den Verlauf als JSON-Datei"
            onClick={async () => {
              setSaving(true)
              try {
                await downloadBackup(setProgress)
              } catch (e) {
                setProgress(`Backup fehlgeschlagen: ${(e as Error).message}`)
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Backup läuft …' : 'Backup herunterladen'}
          </button>
          {progress && <p className="muted progress">{progress}</p>}
        </form>
      )}
      {error ? (
        <p className="status">Laden fehlgeschlagen: {error}</p>
      ) : !sets ? (
        <RowSkeleton />
      ) : !sets.length ? (
        <p className="status">Noch keine Sets. Scanne die erste Karte mit der App.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Set</th>
                <th>Code</th>
                <th>Gehört zu</th>
                <th>Erschienen</th>
                <th className="num">Vorhanden</th>
                <th className="num">Karten im Set</th>
                <th>Im Cube</th>
              </tr>
            </thead>
            <tbody>
              {sets.map((s) => (
                <tr key={s.code}>
                  <td>
                    <span className="setname">
                      {s.icon_svg_uri && <img src={s.icon_svg_uri} alt="" />}
                      {s.name}
                    </span>
                  </td>
                  <td>{s.code.toUpperCase()}</td>
                  <td>
                    {editable ? (
                      <select
                        id={`parent-${s.code}`}
                        aria-label={`Hauptset von ${s.name}`}
                        value={s.parent_code ?? ''}
                        onChange={(e) => setParent(s, e.target.value)}
                      >
                        <option value="">—</option>
                        {sets
                          .filter((p) => p.code !== s.code)
                          .map((p) => (
                            <option key={p.code} value={p.code}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    ) : (
                      (sets.find((p) => p.code === s.parent_code)?.name ?? s.parent_code ?? '—')
                    )}
                  </td>
                  <td className="nowrap">{s.released_at && new Date(s.released_at).toLocaleDateString('de-DE')}</td>
                  <td className="num">{owned.get(s.code) ?? 0}</td>
                  <td className="num">{counts.get(s.code) ?? 0}</td>
                  <td>
                    {editable ? (
                      <label className="check">
                        <input
                          id={`in-cube-${s.code}`}
                          type="checkbox"
                          checked={s.in_cube}
                          onChange={() => toggle(s)}
                        />
                        {s.in_cube ? 'Ja' : 'Nein'}
                      </label>
                    ) : s.in_cube ? (
                      'Ja'
                    ) : (
                      'Nein'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

export function PlayersPage({ me }: { me: Profile }) {
  const notices = useNotices()
  const [players, setPlayers] = useState<Profile[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchAll<Profile>('profiles', 'created_at')
      .then((all) => setPlayers(all.sort((a, b) => Number(b.role === 'waiting') - Number(a.role === 'waiting'))))
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function changeRole(player: Profile, role: Role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', player.id)
    if (error) return notices.say(`Speichern fehlgeschlagen: ${error.message}`, 'error')
    load()
  }

  return (
    <main className="page narrow">
      <h1>Spieler</h1>
      {error ? (
        <p className="status">Laden fehlgeschlagen: {error}</p>
      ) : !players ? (
        <RowSkeleton />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Spieler</th>
                <th>Seit</th>
                <th>Rolle</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className={p.role === 'waiting' ? 'waiting' : undefined}>
                  <td>
                    <span className="player">
                      {p.avatar_url && <img src={p.avatar_url} alt="" />}
                      {p.name}
                    </span>
                  </td>
                  <td className="nowrap">{new Date(p.created_at).toLocaleDateString('de-DE')}</td>
                  <td>
                    <select
                      id={`role-${p.id}`}
                      aria-label={`Rolle von ${p.name}`}
                      value={p.role}
                      // Admins can't change their own role, so the cube never loses its last admin by accident.
                      disabled={p.id === me.id}
                      onChange={(e) => changeRole(p, e.target.value as Role)}
                    >
                      {Object.entries(ROLES).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
