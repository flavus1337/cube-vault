import { useEffect, useMemo, useState } from 'react'
import { readMine, writeMine } from './cache'
import CardDetail, { CopyRows } from './CardDetail'
import { euro, finishLabel, summary } from './format'
import { copyToClipboard, refreshPrivatePrices, wantList } from './prices'
import { fetchAll, supabase, type PrivateCard } from './supabase'
import { privateCardFrom, type Version } from './versions'

const key = (c: PrivateCard) => `${c.print_id}-${c.finish}`
const name = (c: PrivateCard) => c.name_de || c.name
const type = (c: PrivateCard) => c.type_de || c.type_line

/* Cards a player owns outside the cube. The database only ever returns the
   rows of the player who is logged in. */
export default function MyCardsPage() {
  const [cards, setCards] = useState<PrivateCard[]>(() => readMine() ?? [])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!readMine())
  const [text, setText] = useState('')
  const [notice, setNotice] = useState('')
  // Held by id, so the copy count in the dialog follows the reloaded rows.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  async function load(quiet = false) {
    try {
      const rows = await fetchAll<PrivateCard>('private_cards', 'print_id')
      setCards(rows)
      writeMine(rows)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  useEffect(() => {
    let stop = false
    fetchAll<PrivateCard>('private_cards', 'print_id')
      .then((rows) => {
        if (stop) return
        setCards(rows)
        writeMine(rows)
        setError(null)
      })
      .catch((e) => {
        if (!stop) setError((e as Error).message)
      })
      .finally(() => {
        if (!stop) setLoading(false)
      })
    return () => {
      stop = true
    }
  }, [])

  /* A printing from the version list: Scryfall gives the card, the database
     puts it next to the ones you scanned. */
  async function addVersion(row: Record<string, unknown>) {
    const { error } = await supabase.rpc('add_private_copy', { card: row })
    if (error) return alert(`Speichern fehlgeschlagen: ${error.message}`)
    load(true)
  }

  async function change(card: PrivateCard, delta: number, finish = card.finish) {
    const { error } = await supabase.rpc(delta > 0 ? 'add_private_copy' : 'remove_private_copy', {
      ...(delta > 0
        ? { card: { ...card, finish, owner: undefined, qty: undefined, added_at: undefined } }
        : { p_print_id: card.print_id, p_finish: finish }),
    })
    if (error) return alert(`Speichern fehlgeschlagen: ${error.message}`)
    load(true)
  }

  const list = useMemo(() => {
    const search = text.trim().toLowerCase()
    return cards
      .filter((c) => [c.name, c.name_de, c.type_line, c.type_de, c.set_code].join(' ').toLowerCase().includes(search))
      .sort((a, b) => name(a).localeCompare(name(b), 'de'))
  }, [cards, text])

  const selected = cards.find((c) => key(c) === selectedId) ?? null
  // Every finish of a printing is its own stack.
  const sameCard = selected
    ? cards.filter((c) => c.print_id === selected.print_id)
    : []
  const copies = list.reduce((sum, c) => sum + c.qty, 0)
  const value = list.reduce((sum, c) => sum + (c.price_eur ?? 0) * c.qty, 0)

  return (
    <main className="page">
      <h1 className="cube-title">Meine Karten</h1>
      <p className="muted">Nur du siehst diese Karten. Sie gehören nicht zum Cube.</p>
      <div className="toolbar">
        <input
          id="my-search"
          type="search"
          placeholder="Name, Typ oder Set"
          aria-label="Suche"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          onClick={async () => {
            await copyToClipboard(wantList(list))
            setNotice(`${list.length} Karten in die Zwischenablage kopiert.`)
          }}
        >
          Liste kopieren
        </button>
        <button
          onClick={() =>
            refreshPrivatePrices(setNotice)
              .then(() => load(true))
              .catch((e) => setNotice(`Fehler: ${e.message}`))
          }
        >
          Preise aktualisieren
        </button>
        {notice && <span className="muted">{notice}</span>}
      </div>
      <p className="muted summary">
        {summary({ cards: list.length, copies, value })}
      </p>

      {error ? (
        <p className="status">Laden fehlgeschlagen: {error}</p>
      ) : loading ? (
        <p className="status">Lädt …</p>
      ) : !list.length ? (
        <p className="status">
          Noch nichts hier. Stelle den Scanner in der App auf „Meine Karten“ und scanne los.
        </p>
      ) : (
        <div className="grid">
          {list.map((c) => (
            <div key={key(c)} className="tile private">
              <button
                className="tile-open"
                title={`${name(c)} — ${type(c)}`}
                aria-label={`${name(c)} ansehen`}
                onClick={() => setSelectedId(key(c))}
              >
                {c.image ? (
                  <img src={c.image} alt={name(c)} loading="lazy" />
                ) : (
                  <div className="noimg">{name(c)}</div>
                )}
              </button>
              <span className="badge">{c.qty}×</span>
              {c.finish !== 'nonfoil' && <span className="badge out">{finishLabel(c.finish)}</span>}
              <div className="copies">
                <button aria-label={`Eine Kopie von ${name(c)} weniger`} onClick={() => change(c, -1)}>
                  −
                </button>
                <button aria-label={`Eine Kopie von ${name(c)} mehr`} onClick={() => change(c, 1)}>
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <CardDialog
          key={key(selected)}
          card={selected}
          rows={sameCard}
          owned={cards}
          onChange={(delta, finish) => change(selected, delta, finish)}
          onAddVersion={async (version, finish) =>
            addVersion(await privateCardFrom(version, finish))
          }
          onClose={() => setSelectedId(null)}
        />
      )}
    </main>
  )
}

/* Own cards carry no rules text, the scanner does not keep it. */
function CardDialog(props: {
  card: PrivateCard
  rows: PrivateCard[]
  /** All your cards, so the version list can mark the ones you have. */
  owned: PrivateCard[]
  onChange: (delta: number, finish: string) => Promise<void>
  onAddVersion: (version: Version, finish: string) => Promise<void>
  onClose: () => void
}) {
  const { card, rows, owned, onChange, onAddVersion, onClose } = props
  const copies = rows.reduce((sum, row) => sum + row.qty, 0)
  const value = rows.reduce((sum, row) => sum + row.qty * (row.price_eur ?? 0), 0)

  return (
    <CardDetail
      card={card}
      note={`${copies}× vorhanden · ${euro(value)}`}
      ownedPrints={owned.flatMap((row) => [row.print_id, `${row.set_code}/${row.number}`])}
      ownedLabel="bei dir"
      onAddVersion={onAddVersion}
      onClose={onClose}
    >
      <CopyRows
        rows={rows.map((row) => ({ print_id: row.print_id, finish: row.finish, qty: row.qty }))}
        onChange={(_print, finish, delta) => onChange(delta, finish)}
        onAdd={(finish) => onChange(1, finish)}
      />
    </CardDetail>
  )
}
