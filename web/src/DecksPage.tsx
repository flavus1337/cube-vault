import { useEffect, useMemo, useState } from 'react'
import { copyToClipboard, wantList } from './prices'
import { fetchAll, supabase, type PrivateCard } from './supabase'

type Deck = { id: string; name: string; created_at: string }
type DeckCard = { deck_id: string; print_id: string; qty: number }

const name = (c: PrivateCard) => c.name_de || c.name
const isLand = (c: PrivateCard) => /Land/i.test(c.type_de || c.type_line)

/* Ten cards from a shuffled deck, so you can see what an opening looks like.
   Every copy is its own card in the pile. */
function drawTen(cards: { row: { qty: number }; card: PrivateCard }[]) {
  const pile = cards.flatMap(({ row, card }) => Array<PrivateCard>(row.qty).fill(card))
  for (let i = pile.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pile[i], pile[j]] = [pile[j], pile[i]]
  }
  return pile.slice(0, 10)
}

/* Decks are built from a player's own cards, never from the cube. Everything
   here is private: the database only returns the rows of the player. */
export default function DecksPage() {
  const [cards, setCards] = useState<PrivateCard[]>([])
  const [decks, setDecks] = useState<Deck[]>([])
  const [deckCards, setDeckCards] = useState<DeckCard[]>([])
  const [current, setCurrent] = useState('')
  const [text, setText] = useState('')
  const [hand, setHand] = useState<PrivateCard[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const [cards, decks, deckCards] = await Promise.all([
        fetchAll<PrivateCard>('private_cards', 'print_id'),
        fetchAll<Deck>('decks', 'created_at'),
        fetchAll<DeckCard>('deck_cards', 'deck_id'),
      ])
      setCards(cards)
      setDecks(decks)
      setDeckCards(deckCards)
      setCurrent((id) => id || decks[0]?.id || '')
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let stop = false
    Promise.all([
      fetchAll<PrivateCard>('private_cards', 'print_id'),
      fetchAll<Deck>('decks', 'created_at'),
      fetchAll<DeckCard>('deck_cards', 'deck_id'),
    ])
      .then(([cards, decks, deckCards]) => {
        if (stop) return
        setCards(cards)
        setDecks(decks)
        setDeckCards(deckCards)
        setCurrent((id) => id || decks[0]?.id || '')
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

  const byPrint = useMemo(() => new Map(cards.map((c) => [c.print_id, c])), [cards])
  const inDeck = useMemo(
    () => deckCards.filter((d) => d.deck_id === current),
    [deckCards, current],
  )
  // How many copies of a card sit in other decks, to warn about double use.
  const usedElsewhere = (printId: string) =>
    deckCards.filter((d) => d.print_id === printId && d.deck_id !== current).reduce((s, d) => s + d.qty, 0)

  const pool = useMemo(() => {
    const search = text.trim().toLowerCase()
    return cards
      .filter((c) => [c.name, c.name_de, c.type_line, c.type_de, c.set_code].join(' ').toLowerCase().includes(search))
      .sort((a, b) => name(a).localeCompare(name(b), 'de'))
  }, [cards, text])

  async function newDeck() {
    const deckName = prompt('Name des Decks?')
    if (!deckName) return
    const { data, error } = await supabase.from('decks').insert({ name: deckName }).select().single()
    if (error) return alert(`Speichern fehlgeschlagen: ${error.message}`)
    setCurrent((data as Deck).id)
    void load()
  }

  async function removeDeck() {
    const deck = decks.find((d) => d.id === current)
    if (!deck || !confirm(`„${deck.name}“ löschen?`)) return
    const { error } = await supabase.from('decks').delete().eq('id', deck.id)
    if (error) return alert(`Löschen fehlgeschlagen: ${error.message}`)
    setCurrent('')
    void load()
  }

  async function change(printId: string, delta: number) {
    if (!current) return
    const row = inDeck.find((d) => d.print_id === printId)
    const qty = (row?.qty ?? 0) + delta
    const query =
      qty <= 0
        ? supabase.from('deck_cards').delete().eq('deck_id', current).eq('print_id', printId)
        : supabase.from('deck_cards').upsert({ deck_id: current, print_id: printId, qty })
    const { error } = await query
    if (error) return alert(`Speichern fehlgeschlagen: ${error.message}`)
    void load()
  }

  const deckList = inDeck
    .map((d) => ({ row: d, card: byPrint.get(d.print_id) }))
    .filter((x): x is { row: DeckCard; card: PrivateCard } => Boolean(x.card))
    .sort((a, b) => a.card.cmc - b.card.cmc || name(a.card).localeCompare(name(b.card), 'de'))

  const total = deckList.reduce((sum, x) => sum + x.row.qty, 0)
  const lands = deckList.filter((x) => isLand(x.card)).reduce((sum, x) => sum + x.row.qty, 0)
  const curve = ['0', '1', '2', '3', '4', '5', '6', '7+'].map((label) => {
    const value = label === '7+' ? 7 : Number(label)
    return [
      label,
      deckList
        .filter((x) => !isLand(x.card) && (label === '7+' ? x.card.cmc >= 7 : x.card.cmc === value))
        .reduce((sum, x) => sum + x.row.qty, 0),
    ] as [string, number]
  })

  if (error) return <main className="page"><p className="status">Laden fehlgeschlagen: {error}</p></main>
  if (loading) return <main className="page"><p className="status">Lädt …</p></main>

  return (
    <main className="page">
      <h1 className="cube-title">Decks</h1>
      <p className="muted">Gebaut aus deinen eigenen Karten. Nur du siehst sie.</p>
      <div className="toolbar">
        <select id="deck" aria-label="Deck" value={current} onChange={(e) => setCurrent(e.target.value)}>
          <option value="">Kein Deck gewählt</option>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button className="primary" onClick={newDeck}>
          Neues Deck
        </button>
        {current && <button onClick={removeDeck}>Deck löschen</button>}
        {current && total > 0 && (
          <>
            <button onClick={() => setHand(drawTen(deckList))}>{hand ? 'Neu ziehen' : '10 Karten ziehen'}</button>
            <button onClick={() => copyToClipboard(wantList(deckList.map((x) => ({ name: x.card.name, qty: x.row.qty }))))}>
              Deckliste kopieren
            </button>
          </>
        )}
      </div>

      {hand && (
        <section className="hand">
          <h2>
            Gezogen: {hand.length} Karten, davon {hand.filter(isLand).length} Länder
            <button className="link-button" onClick={() => setHand(null)}>
              schließen
            </button>
          </h2>
          <div className="hand-cards">
            {hand.map((card, i) => (
              <figure key={`${card.print_id}-${i}`}>
                {card.image ? (
                  <img src={card.image} alt={name(card)} loading="lazy" />
                ) : (
                  <div className="noimg">{name(card)}</div>
                )}
                <figcaption>{name(card)}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {!current ? (
        <p className="status">Wähle ein Deck oder lege eines an.</p>
      ) : (
        <div className="deck-layout">
          <section>
            <h2>
              Deck · {total} Karten, davon {lands} Länder
            </h2>
            <p className="muted">
              Kurve: {curve.map(([label, n]) => `${label}: ${n}`).join(' · ')}
            </p>
            {!deckList.length && <p className="status">Noch leer. Karten rechts antippen.</p>}
            <ul className="deck-list">
              {deckList.map(({ row, card }) => {
                const elsewhere = usedElsewhere(card.print_id)
                const tooMany = row.qty + elsewhere > card.qty
                return (
                  <li key={card.print_id}>
                    <button aria-label={`Eine ${name(card)} weniger`} onClick={() => change(card.print_id, -1)}>
                      −
                    </button>
                    <span className="deck-qty">{row.qty}×</span>
                    <span className="deck-name">
                      {name(card)}
                      <span className="muted"> · {card.cmc} Mana</span>
                      {tooMany && (
                        <span className="warn">
                          {' '}
                          · du hast {card.qty}, in Decks {row.qty + elsewhere}
                        </span>
                      )}
                    </span>
                    <button aria-label={`Eine ${name(card)} mehr`} onClick={() => change(card.print_id, 1)}>
                      +
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <section>
            <h2>Meine Karten</h2>
            <input
              id="deck-search"
              type="search"
              placeholder="Name, Typ oder Set"
              aria-label="Karten suchen"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <ul className="deck-list">
              {pool.map((card) => (
                <li key={card.print_id}>
                  <span className="deck-qty">{card.qty}×</span>
                  <span className="deck-name">
                    {name(card)}
                    <span className="muted"> · {card.set_code.toUpperCase()} #{card.number}</span>
                  </span>
                  <button aria-label={`${name(card)} ins Deck`} onClick={() => change(card.print_id, 1)}>
                    +
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  )
}
