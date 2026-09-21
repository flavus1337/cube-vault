import { useEffect, useMemo, useState } from 'react'
import { addLands, BASICS, pipsOf, suggestLands } from './lands'
import { copyToClipboard, wantList } from './prices'
import { parseQuery } from './query'
import { fetchAll, supabase, type Card, type Copy, type CubeSet, type PrivateCard } from './supabase'

type Deck = { id: string; name: string; created_at: string }
type DeckCard = { deck_id: string; print_id: string; qty: number }

/* A card a deck can hold, from the player's own cards or from the cube. `key`
   is what deck_cards stores: the scanned print for own cards, the card id for
   cube cards. It carries the full card shape so the cube search works on it. */
type PoolCard = Card & { key: string; owned: number; source: 'mine' | 'cube' }

const GROUPS: [string, string][] = [
  ['W', 'Weiß'],
  ['U', 'Blau'],
  ['B', 'Schwarz'],
  ['R', 'Rot'],
  ['G', 'Grün'],
  ['M', 'Mehrfarbig'],
  ['C', 'Farblos'],
  ['L', 'Länder'],
]

const name = (c: PoolCard) => c.name_de || c.name
const isLand = (c: PoolCard) => /Land/i.test(c.type_de || c.type_line)

function groupOf(card: PoolCard) {
  if (isLand(card)) return 'L'
  if (!card.colors) return 'C'
  return card.colors.length > 1 ? 'M' : card.colors
}

function fromPrivate(card: PrivateCard): PoolCard {
  return {
    ...card,
    id: card.print_id,
    key: card.print_id,
    owned: card.qty,
    source: 'mine',
    // Own cards keep less data than cube cards; the search treats these as empty.
    oracle_text: '',
    text_de: null,
    color_identity: card.colors,
    keywords: [],
    legalities: null,
    layout: null,
    image_en: card.image,
    excluded: false,
    exclude_reason: null,
    rarity: card.rarity ?? 'common',
  }
}

function fromCube(card: Card, copies: number): PoolCard {
  return { ...card, key: card.id, owned: copies, source: 'cube' }
}

/* Ten cards from a shuffled deck, so you can see what an opening looks like.
   Every copy is its own card in the pile. */
function drawTen(cards: { row: DeckCard; card: PoolCard }[]) {
  const pile = cards.flatMap(({ row, card }) => Array<PoolCard>(row.qty).fill(card))
  for (let i = pile.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pile[i], pile[j]] = [pile[j], pile[i]]
  }
  return pile.slice(0, 10)
}

/* Decks are private: only their owner sees them. The cards in them can come
   from the player's own collection or from the shared cube. */
export default function DecksPage() {
  const [mine, setMine] = useState<PoolCard[]>([])
  const [cube, setCube] = useState<PoolCard[]>([])
  const [decks, setDecks] = useState<Deck[]>([])
  const [deckCards, setDeckCards] = useState<DeckCard[]>([])
  const [current, setCurrent] = useState('')
  const [source, setSource] = useState<'mine' | 'cube'>('mine')
  const [text, setText] = useState('')
  const [hand, setHand] = useState<PoolCard[] | null>(null)
  const [busyLands, setBusyLands] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  /* The pools hold every card of the cube, so they are loaded once. Putting a
     card into a deck only writes one small row. */
  async function loadPools() {
    const [privateCards, cards, sets, copies] = await Promise.all([
      fetchAll<PrivateCard>('private_cards', 'print_id'),
      fetchAll<Card>('cards', 'id'),
      fetchAll<CubeSet>('sets', 'code'),
      fetchAll<Copy>('copies', 'print_id'),
    ])
    const inCube = new Set(sets.filter((s) => s.in_cube).map((s) => s.code))
    const owned = new Map<string, number>()
    for (const copy of copies) owned.set(copy.card_id, (owned.get(copy.card_id) ?? 0) + copy.qty)

    setMine(privateCards.map(fromPrivate))
    setCube(
      cards
        .filter((c) => inCube.has(c.set_code) && !c.excluded && owned.has(c.id))
        .map((c) => fromCube(c, owned.get(c.id) ?? 0)),
    )
  }

  async function loadDecks() {
    const [decks, deckCards] = await Promise.all([
      fetchAll<Deck>('decks', 'created_at'),
      fetchAll<DeckCard>('deck_cards', 'deck_id'),
    ])
    setDecks(decks)
    setDeckCards(deckCards)
    setCurrent((id) => id || decks[0]?.id || '')
  }

  useEffect(() => {
    let stop = false
    Promise.all([loadPools(), loadDecks()])
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

  const byKey = useMemo(
    () => new Map([...mine, ...cube].map((card) => [card.key, card])),
    [mine, cube],
  )
  const inDeck = useMemo(() => deckCards.filter((d) => d.deck_id === current), [deckCards, current])
  // How many copies of a card sit in other decks, to warn about double use.
  const usedElsewhere = (key: string) =>
    deckCards.filter((d) => d.print_id === key && d.deck_id !== current).reduce((s, d) => s + d.qty, 0)

  const POOL_LIMIT = 60
  const pool = useMemo(() => {
    // The same search language as the cube page, e.g. "c:r mv<=2 -t:land".
    const matches = parseQuery(text).test
    return (source === 'mine' ? mine : cube)
      .filter((card) => matches({ card, copies: card.owned }))
      .sort((a, b) => name(a).localeCompare(name(b), 'de'))
  }, [mine, cube, source, text])
  const shown = pool.slice(0, POOL_LIMIT)

  async function newDeck() {
    const deckName = prompt('Name des Decks?')
    if (!deckName) return
    const { data, error } = await supabase.from('decks').insert({ name: deckName }).select().single()
    if (error) return alert(`Speichern fehlgeschlagen: ${error.message}`)
    setDecks((all) => [...all, data as Deck])
    setCurrent((data as Deck).id)
  }

  async function removeDeck() {
    const deck = decks.find((d) => d.id === current)
    if (!deck || !confirm(`„${deck.name}“ löschen?`)) return
    const { error } = await supabase.from('decks').delete().eq('id', deck.id)
    if (error) return alert(`Löschen fehlgeschlagen: ${error.message}`)
    setDeckCards((rows) => rows.filter((row) => row.deck_id !== deck.id))
    setDecks((all) => all.filter((d) => d.id !== deck.id))
    setCurrent('')
  }

  async function change(key: string, delta: number) {
    if (!current) return
    const qty = (inDeck.find((d) => d.print_id === key)?.qty ?? 0) + delta
    // Show the change at once, then write it; a failed write reloads the deck.
    setDeckCards((rows) => {
      const others = rows.filter((row) => !(row.deck_id === current && row.print_id === key))
      return qty > 0 ? [...others, { deck_id: current, print_id: key, qty }] : others
    })
    const { error } =
      qty <= 0
        ? await supabase.from('deck_cards').delete().eq('deck_id', current).eq('print_id', key)
        : await supabase.from('deck_cards').upsert({ deck_id: current, print_id: key, qty })
    if (error) {
      alert(`Speichern fehlgeschlagen: ${error.message}`)
      void loadDecks()
    }
  }

  const deckList = inDeck
    .map((d) => ({ row: d, card: byKey.get(d.print_id) }))
    .filter((x): x is { row: DeckCard; card: PoolCard } => Boolean(x.card))
    .sort((a, b) => a.card.cmc - b.card.cmc || name(a.card).localeCompare(name(b.card), 'de'))

  const total = deckList.reduce((sum, x) => sum + x.row.qty, 0)
  const spells = deckList
    .filter((x) => !isLand(x.card))
    .map((x) => ({ mana_cost: x.card.mana_cost, qty: x.row.qty }))
  const suggestion = suggestLands(
    spells.reduce((sum, x) => sum + x.qty, 0),
    pipsOf(spells),
  )
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

  if (error)
    return (
      <main className="page">
        <p className="status">Laden fehlgeschlagen: {error}</p>
      </main>
    )
  if (loading)
    return (
      <main className="page">
        <p className="status">Lädt …</p>
      </main>
    )

  return (
    <main className="page">
      <h1 className="cube-title">Decks</h1>
      <p className="muted">
        Bau aus deinen eigenen Karten oder aus dem Cube. Deine Decks sieht nur du.
      </p>
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
            <button onClick={() => setHand(drawTen(deckList))}>
              {hand ? 'Neu ziehen' : '10 Karten ziehen'}
            </button>
            <button
              onClick={() =>
                copyToClipboard(wantList(deckList.map((x) => ({ name: x.card.name, qty: x.row.qty }))))
              }
            >
              Deckliste kopieren
            </button>
          </>
        )}
      </div>

      {hand && (
        <section className="hand">
          <h2>
            Starthand und drei Züge · {hand.filter(isLand).length} Länder unter {hand.length} Karten
            <button className="link-button" onClick={() => setHand(null)}>
              schließen
            </button>
          </h2>
          <h3>Starthand</h3>
          <div className="hand-cards">
            {hand.slice(0, 7).map((card, i) => (
              <figure key={`${card.key}-${i}`}>
                {card.image ? (
                  <img src={card.image} alt={name(card)} loading="lazy" />
                ) : (
                  <div className="noimg">{name(card)}</div>
                )}
                <figcaption>{name(card)}</figcaption>
              </figure>
            ))}
          </div>
          <h3>Nachgezogen</h3>
          <div className="hand-cards">
            {hand.slice(7).map((card, i) => (
              <figure key={`${card.key}-draw-${i}`}>
                {card.image ? (
                  <img src={card.image} alt={name(card)} loading="lazy" />
                ) : (
                  <div className="noimg">{name(card)}</div>
                )}
                <figcaption>
                  <strong>Zug {i + 1}</strong> · {name(card)}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {!current ? (
        <p className="status">Wähle ein Deck oder lege eines an.</p>
      ) : (
        <div className="builder">
          <section className="deck-side">
            <h2>
              Deck · {total} Karten, davon {lands} Länder
            </h2>
            <p className="muted">Kurve: {curve.map(([label, n]) => `${label}: ${n}`).join(' · ')}</p>
            {suggestion.length > 0 && (
              <p className="muted lands-hint">
                Empfehlung:{' '}
                {suggestion
                  .map(({ colour, count }) => `${count} ${BASICS.find(([key]) => key === colour)![2]}`)
                  .join(' · ')}
                <button
                  className="link-button"
                  disabled={busyLands}
                  onClick={async () => {
                    setBusyLands(true)
                    try {
                      await addLands(current, suggestion)
                      await Promise.all([loadPools(), loadDecks()])
                    } catch (e) {
                      alert(`Länder hinzufügen fehlgeschlagen: ${(e as Error).message}`)
                    } finally {
                      setBusyLands(false)
                    }
                  }}
                >
                  {busyLands ? 'wird hinzugefügt …' : 'Länder hinzufügen'}
                </button>
              </p>
            )}
            {!deckList.length && <p className="status">Noch leer. Karten rechts antippen.</p>}
            {GROUPS.map(([key, label]) => {
              const rows = deckList.filter(({ card }) => groupOf(card) === key)
              if (!rows.length) return null
              const count = rows.reduce((sum, x) => sum + x.row.qty, 0)
              return (
                <div key={key} className="deck-group">
                  <h3>
                    <span className={`dot dot-${key}`} aria-hidden="true" />
                    {label} · {count}
                  </h3>
                  <ul className="deck-list">
                    {rows.map(({ row, card }) => {
                      const elsewhere = usedElsewhere(card.key)
                      const tooMany = row.qty + elsewhere > card.owned
                      return (
                        <li key={card.key}>
                          <button
                            aria-label={`Eine ${name(card)} weniger`}
                            onClick={() => change(card.key, -1)}
                          >
                            −
                          </button>
                          <span className="deck-qty">{row.qty}×</span>
                          <span className="deck-name" title={`${name(card)} · ${card.cmc} Mana`}>
                            {name(card)}
                            <span className="muted"> · {card.cmc}</span>
                            {tooMany && (
                              <span className="warn">
                                {' '}
                                · vorhanden {card.owned}
                                {elsewhere > 0 && `, ${elsewhere} in anderen Decks`}
                              </span>
                            )}
                          </span>
                          <button
                            aria-label={`Eine ${name(card)} mehr`}
                            onClick={() => change(card.key, 1)}
                          >
                            +
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </section>

          <section className="pool">
            <div className="toolbar">
              <input
                id="deck-search"
                type="search"
                placeholder="Suche, z. B. c:r mv<=2"
                aria-label="Karten suchen"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <select
                id="deck-source"
                aria-label="Kartenpool"
                value={source}
                onChange={(e) => setSource(e.target.value as typeof source)}
              >
                <option value="mine">Meine Karten</option>
                <option value="cube">Cube</option>
              </select>
            </div>
            <p className="muted summary">
              {pool.length} Karten im Pool{pool.length > shown.length && `, ${shown.length} gezeigt`}
            </p>
            <div className="grid">
              {shown.map((card) => {
                const inThisDeck = inDeck.find((row) => row.print_id === card.key)?.qty ?? 0
                return (
                  <button
                    key={card.key}
                    className="tile"
                    title={`${name(card)} — ${card.type_de || card.type_line}`}
                    onClick={() => change(card.key, 1)}
                  >
                    {card.image ? (
                      <img src={card.image} alt={name(card)} loading="lazy" />
                    ) : (
                      <div className="noimg">{name(card)}</div>
                    )}
                    {inThisDeck > 0 && <span className="badge">{inThisDeck}×</span>}
                    <span className="badge out">{card.owned} da</span>
                  </button>
                )
              })}
            </div>
            {!pool.length && <p className="status">Keine Karten gefunden.</p>}
          </section>
        </div>
      )}
    </main>
  )
}
