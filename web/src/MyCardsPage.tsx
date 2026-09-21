import { useEffect, useMemo, useRef, useState } from 'react'
import { cardmarket, euro, png, RARITY, summary } from './format'
import { copyToClipboard, refreshPrivatePrices, wantList } from './prices'
import { fetchAll, supabase, type PrivateCard } from './supabase'

const name = (c: PrivateCard) => c.name_de || c.name
const type = (c: PrivateCard) => c.type_de || c.type_line

/* Cards a player owns outside the cube. The database only ever returns the
   rows of the player who is logged in. */
export default function MyCardsPage() {
  const [cards, setCards] = useState<PrivateCard[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [notice, setNotice] = useState('')
  // Held by id, so the copy count in the dialog follows the reloaded rows.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  async function load(quiet = false) {
    try {
      const rows = await fetchAll<PrivateCard>('private_cards', 'print_id')
      setCards(rows)
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

  async function change(card: PrivateCard, delta: number) {
    const { error } = await supabase.rpc(delta > 0 ? 'add_private_copy' : 'remove_private_copy', {
      ...(delta > 0 ? { card: { ...card, owner: undefined, qty: undefined, added_at: undefined } } : { p_print_id: card.print_id }),
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

  const selected = cards.find((c) => c.print_id === selectedId) ?? null
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
            <div key={c.print_id} className="tile private">
              <button
                className="tile-open"
                title={`${name(c)} — ${type(c)}`}
                aria-label={`${name(c)} ansehen`}
                onClick={() => setSelectedId(c.print_id)}
              >
                {c.image ? (
                  <img src={c.image} alt={name(c)} loading="lazy" />
                ) : (
                  <div className="noimg">{name(c)}</div>
                )}
              </button>
              <span className="badge">{c.qty}×</span>
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
          key={selected.print_id}
          card={selected}
          onChange={(delta) => change(selected, delta)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </main>
  )
}

/* The same detail view as in the cube, for the few fields own cards carry.
   Scanning keeps no rules text for them. */
function CardDialog(props: {
  card: PrivateCard
  onChange: (delta: number) => Promise<void>
  onClose: () => void
}) {
  const { card, onChange, onClose } = props
  const ref = useRef<HTMLDialogElement>(null)
  const [hiRes, setHiRes] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  // Show the cached grid image first, swap in the PNG once it has loaded.
  useEffect(() => {
    if (!card.image) return
    const img = new Image()
    img.onload = () => setHiRes(img.src)
    img.src = png(card.image)
    return () => {
      img.onload = null
    }
  }, [card.image])

  async function step(delta: number) {
    setBusy(true)
    await onChange(delta)
    setBusy(false)
  }

  return (
    <dialog ref={ref} className="detail" aria-labelledby="my-card-title" onClose={onClose}>
      {card.image && <img src={hiRes ?? card.image} alt={name(card)} />}
      <h2 id="my-card-title">{name(card)}</h2>
      {card.name_de && card.name_de !== card.name && <p className="muted">{card.name}</p>}
      <p>{type(card)}</p>
      <p className="muted">
        {card.set_code.toUpperCase()} #{card.number} · {RARITY[card.rarity ?? ''] ?? card.rarity} ·{' '}
        {euro(card.price_eur)} · {card.qty}× vorhanden
      </p>
      <div className="copies">
        <button disabled={busy || card.qty === 0} onClick={() => step(-1)} aria-label="Eine Kopie weniger">
          −
        </button>
        <strong>{card.qty}</strong>
        <button disabled={busy} onClick={() => step(1)} aria-label="Eine Kopie mehr">
          +
        </button>
      </div>
      <p>
        <a href={cardmarket(card.name)} target="_blank" rel="noopener">
          Bei Cardmarket suchen
        </a>
      </p>
      <div className="actions">
        <button className="primary" onClick={() => ref.current?.close()}>
          Schließen
        </button>
      </div>
    </dialog>
  )
}
