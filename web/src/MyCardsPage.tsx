import { useMemo, useState } from 'react'
import CardDetail, { CopyRows } from './CardDetail'
import CardTile from './CardTile'
import Summary from './Summary'
import { CardSkeleton } from './Skeleton'
import { euro, finishLabel } from './format'
import { usePrivateCards } from './mine'
import { useNotices } from './notices'
import { copyToClipboard, refreshPrivatePrices, wantList } from './prices'
import { supabase, type PrivateCard } from './supabase'
import { useGrowing } from './useGrowing'
import { privateCardFrom, type Version } from './versions'

const key = (c: PrivateCard) => `${c.print_id}-${c.finish}`
const name = (c: PrivateCard) => c.name_de || c.name
const type = (c: PrivateCard) => c.type_de || c.type_line

/* Cards a player owns outside the cube. The database only ever returns the
   rows of the player who is logged in. */
export default function MyCardsPage() {
  const messages = useNotices()
  const { cards, loading, error, reload } = usePrivateCards()
  const [text, setText] = useState('')
  const [notice, setNotice] = useState('')
  // The card shown in the detail view, held by id so its numbers stay fresh.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  /* A printing from the version list: Scryfall gives the card, the database
     puts it next to the ones you scanned. */
  async function addVersion(row: Record<string, unknown>) {
    const { error } = await supabase.rpc('add_private_copy', { card: row })
    if (error) return messages.say(`Speichern fehlgeschlagen: ${error.message}`, 'error')
    await reload()
  }

  async function change(card: PrivateCard, delta: number, finish = card.finish) {
    const { error } = await supabase.rpc(delta > 0 ? 'add_private_copy' : 'remove_private_copy', {
      ...(delta > 0
        ? { card: { ...card, finish, owner: undefined, qty: undefined, added_at: undefined } }
        : { p_print_id: card.print_id, p_finish: finish }),
    })
    if (error) return messages.say(`Speichern fehlgeschlagen: ${error.message}`, 'error')
    await reload()
  }

  const list = useMemo(() => {
    const search = text.trim().toLowerCase()
    return cards
      .filter((c) => [c.name, c.name_de, c.type_line, c.type_de, c.set_code].join(' ').toLowerCase().includes(search))
      .sort((a, b) => name(a).localeCompare(name(b), 'de'))
  }, [cards, text])

  const { visible, more, sentinel } = useGrowing(list)
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
              .then(() => reload())
              .catch((e) => setNotice(`Fehler: ${e.message}`))
          }
        >
          Preise aktualisieren
        </button>
        {notice && <span className="muted">{notice}</span>}
      </div>
      <Summary cards={list.length} copies={copies} value={value} />

      {error ? (
        <p className="status">Laden fehlgeschlagen: {error}</p>
      ) : loading ? (
        <CardSkeleton count={8} />
      ) : !list.length ? (
        <p className="status">
          Noch nichts hier. Stelle den Scanner in der App auf „Meine Karten“ und scanne los.
        </p>
      ) : (
        <div className="grid">
          {visible.map((c) => (
            <CardTile
              key={key(c)}
              image={c.image}
              name={`${name(c)} — ${type(c)}`}
              meta={`${c.set_code.toUpperCase()} #${c.number} · ${euro(c.price_eur)} · ${finishLabel(c.finish)}`}
              note={`${c.qty}× ${finishLabel(c.finish)}`}
              onClick={() => setSelectedId(key(c))}
            >
              <span className="note-buttons">
                <button aria-label={`Eine Kopie von ${name(c)} weniger`} onClick={() => change(c, -1)}>
                  −
                </button>
                <button aria-label={`Eine Kopie von ${name(c)} mehr`} onClick={() => change(c, 1)}>
                  +
                </button>
              </span>
            </CardTile>
          ))}
        </div>
      )}
      {more > 0 && (
        <div ref={sentinel} className="status">
          Noch {more} Karten …
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
      noteLabel="Bei dir"
      note={`${copies} ${copies === 1 ? 'Kopie' : 'Kopien'} · ${euro(value)}`}
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
