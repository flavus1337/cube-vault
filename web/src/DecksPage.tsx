import { useEffect, useMemo, useState } from 'react'
import CardDetail from './CardDetail'
import { CardSkeleton } from './Skeleton'
import { useCube } from './cube'
import {
  columnsOf,
  drawTen,
  fromCube,
  fromPrivate,
  GROUP_BY,
  isLand,
  name,
  SORT_BY,
  type Deck,
  type DeckCard,
  type PoolCard,
} from './deck'
import CardTile from './CardTile'
import DeckColumns from './DeckColumns'
import { euro } from './format'
import OpeningHand from './OpeningHand'
import { addLands } from './lands'
import { BASICS, pipsOf, suggestLands } from './mana'
import { copyToClipboard, wantList } from './prices'
import { usePrivateCards } from './mine'
import { useNarrow } from './useNarrow'
import { useNotices } from './notices'
import { parseQuery } from './query'
import { fetchAll, supabase } from './supabase'

export default function DecksPage() {
  const notices = useNotices()
  const cubeData = useCube()
  const { cards: privateCards, reload: reloadPrivate } = usePrivateCards()
  const [decks, setDecks] = useState<Deck[]>([])
  const [deckCards, setDeckCards] = useState<DeckCard[]>([])
  const [current, setCurrent] = useState('')
  const [source, setSource] = useState<'mine' | 'cube'>('mine')
  const [text, setText] = useState('')
  const [hand, setHand] = useState<PoolCard[] | null>(null)
  // The card shown in the detail view, held by key so its numbers stay fresh.
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // How the deck itself is shown: columns, order inside them, and a search.
  const [groupBy, setGroupBy] = useState('type')
  const [deckSort, setDeckSort] = useState('cmc')
  const [deckText, setDeckText] = useState('')
  const [busyLands, setBusyLands] = useState(false)
  /* On a phone the deck fills the screen and the cards to add sit far below
     it. There they are a bar at the top that opens when you need it. */
  const narrow = useNarrow()
  const [poolOpen, setPoolOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)


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
    loadDecks()
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

  const mine = useMemo(() => {
    // A deck does not care about the finish, so foil and normal are one pile.
    const byPrint = new Map<string, PoolCard>()
    for (const row of privateCards) {
      const seen = byPrint.get(row.print_id)
      if (seen) seen.owned += row.qty
      else byPrint.set(row.print_id, fromPrivate(row))
    }
    return [...byPrint.values()]
  }, [privateCards])
  const cube = useMemo(() => {
    const inCube = new Set(cubeData.sets.filter((s) => s.in_cube).map((s) => s.code))
    return cubeData.cards
      .filter((c) => inCube.has(c.set_code) && !c.excluded && cubeData.copies.get(c.id))
      .map((c) => fromCube(c, cubeData.copies.get(c.id) ?? 0))
  }, [cubeData.cards, cubeData.sets, cubeData.copies])

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
    const deckName = await notices.ask('Name des Decks?', 'Anlegen')
    if (!deckName) return
    const { data, error } = await supabase.from('decks').insert({ name: deckName }).select().single()
    if (error) return notices.say(`Speichern fehlgeschlagen: ${error.message}`, 'error')
    setDecks((all) => [...all, data as Deck])
    setCurrent((data as Deck).id)
  }

  async function removeDeck() {
    const deck = decks.find((d) => d.id === current)
    if (!deck || !(await notices.confirm(`„${deck.name}“ löschen?`))) return
    const { error } = await supabase.from('decks').delete().eq('id', deck.id)
    if (error) return notices.say(`Löschen fehlgeschlagen: ${error.message}`, 'error')
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
      notices.say(`Speichern fehlgeschlagen: ${error.message}`, 'error')
      void loadDecks()
    }
  }

  const deckList = inDeck
    .map((d) => ({ row: d, card: byKey.get(d.print_id) }))
    .filter((x): x is { row: DeckCard; card: PoolCard } => Boolean(x.card))
    .sort((a, b) => a.card.cmc - b.card.cmc || name(a.card).localeCompare(name(b.card), 'de'))

  /* What the columns show: the same search language as everywhere else, and
     the order you picked. The numbers above stay about the whole deck. */
  const shownInDeck = (() => {
    const matches = parseQuery(deckText).test
    const byName = (a: PoolCard, b: PoolCard) => name(a).localeCompare(name(b), 'de')
    const sorters: Record<string, (a: (typeof deckList)[number], b: (typeof deckList)[number]) => number> = {
      name: (a, b) => byName(a.card, b.card),
      cmc: (a, b) => a.card.cmc - b.card.cmc || byName(a.card, b.card),
      price: (a, b) => (b.card.price_eur ?? -1) - (a.card.price_eur ?? -1),
      qty: (a, b) => b.row.qty - a.row.qty || byName(a.card, b.card),
    }
    return deckList.filter((x) => matches({ card: x.card, copies: x.card.owned })).sort(sorters[deckSort])
  })()

  const columns = columnsOf(shownInDeck, groupBy)

  const selected = selectedKey ? (byKey.get(selectedKey) ?? null) : null
  const selectedQty = inDeck.find((row) => row.print_id === selectedKey)?.qty ?? 0

  const total = deckList.reduce((sum, x) => sum + x.row.qty, 0)
  const spells = deckList
    .filter((x) => !isLand(x.card))
    .map((x) => ({ mana_cost: x.card.mana_cost, qty: x.row.qty }))
  const suggestion = suggestLands(
    spells.reduce((sum, x) => sum + x.qty, 0),
    pipsOf(spells),
  )
  /* Basics already in the deck, by colour. Scryfall keeps the English name on
     German prints, so that is what they are recognized by. */
  const basicsInDeck = Object.fromEntries(
    BASICS.map(([colour, english]) => [
      colour,
      deckList.filter((x) => x.card.name === english).reduce((sum, x) => sum + x.row.qty, 0),
    ]),
  )
  const wantedLands = suggestion
    .map((share) => ({ ...share, have: basicsInDeck[share.colour] ?? 0 }))
    .filter((share) => share.count > share.have)
  // Enough lands in the deck, whatever their colours: nothing left to add.
  const landsWanted = suggestion.reduce((sum, share) => sum + share.count, 0)
  const lands = deckList.filter((x) => isLand(x.card)).reduce((sum, x) => sum + x.row.qty, 0)
  /* Copies the deck wants but nobody has: what you own minus what the other
     decks already hold. Buying them costs the price of the English print. */
  const short = deckList.map((x) => ({
    card: x.card,
    n: Math.max(0, x.row.qty + usedElsewhere(x.card.key) - x.card.owned),
  }))
  const deckValue = deckList.reduce((sum, x) => sum + (x.card.price_eur ?? 0) * x.row.qty, 0)
  const shortCards = short.reduce((sum, x) => sum + x.n, 0)
  const shortValue = short.reduce((sum, x) => sum + x.n * (x.card.price_eur ?? 0), 0)
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
        <h1 className="cube-title">Decks</h1>
        <CardSkeleton count={8} />
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

      {hand && <OpeningHand cards={hand} onClose={() => setHand(null)} />}

      {!current ? (
        <p className="status">Wähle ein Deck oder lege eines an.</p>
      ) : (
        <div className="builder">
          <section className="deck-main">
            <dl className="deck-stats">
              <div>
                <dt>Karten</dt>
                <dd>{total}</dd>
              </div>
              <div>
                <dt>Länder</dt>
                <dd>{lands}</dd>
              </div>
              <div>
                <dt>Zauber</dt>
                <dd>{total - lands}</dd>
              </div>
              <div>
                <dt>Wert</dt>
                <dd>{euro(deckValue)}</dd>
              </div>
              {shortCards > 0 && (
                <div className="warn">
                  <dt>Fehlen</dt>
                  <dd title="Kopien, die du nicht hast oder die in anderen Decks stecken">
                    {shortCards} · {euro(shortValue)}
                  </dd>
                </div>
              )}
            </dl>

            <div className="deck-head">
              <div>
                <h3 className="side-title">
                  Manakurve <span className="muted">Karten je Manabetrag, ohne Länder</span>
                </h3>
                <div
                  className="curve"
                  role="img"
                  aria-label={`Manakurve: ${curve.map(([label, n]) => `${n} Karten mit ${label} Mana`).join(', ')}`}
                >
                  {curve.map(([label, n]) => (
                    <span key={label} className="curve-col">
                      <span className="curve-value">{n || ''}</span>
                      <span
                        className="curve-bar"
                        style={{ height: `${Math.max(...curve.map(([, m]) => m), 1) ? (n / Math.max(...curve.map(([, m]) => m), 1)) * 100 : 0}%` }}
                      />
                      <span className="curve-label">{label}</span>
                    </span>
                  ))}
                </div>
              </div>
              {suggestion.length > 0 && (
                <div className="lands-hint">
                  <p>
                    <strong>
                      {suggestion
                        .map(({ colour, count }) => `${count} ${BASICS.find(([key]) => key === colour)![2]}`)
                        .join(' · ')}
                    </strong>
                    <span className="muted">
                      Standardländer, passend zu den Farben deiner {total - lands} Zauber
                    </span>
                  </p>
                  {lands >= landsWanted || !wantedLands.length ? (
                    <p className="muted">Deine {lands} Länder reichen.</p>
                  ) : (
                    <button
                      className="primary"
                      disabled={busyLands}
                      onClick={async () => {
                        setBusyLands(true)
                        try {
                          await addLands(current, wantedLands)
                          await Promise.all([reloadPrivate(), loadDecks()])
                        } catch (e) {
                          notices.say(`Länder hinzufügen fehlgeschlagen: ${(e as Error).message}`, 'error')
                        } finally {
                          setBusyLands(false)
                        }
                      }}
                    >
                      {busyLands ? 'wird hinzugefügt …' : 'Länder hinzufügen'}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="toolbar">
              <input
                id="deck-filter"
                type="search"
                placeholder="Im Deck suchen, z. B. t:kreatur mv<=3"
                aria-label="Im Deck suchen"
                value={deckText}
                onChange={(e) => setDeckText(e.target.value)}
              />
              <select
                id="deck-group"
                aria-label="Spalten nach"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value)}
              >
                {Object.entries(GROUP_BY).map(([key, label]) => (
                  <option key={key} value={key}>
                    Spalten: {label}
                  </option>
                ))}
              </select>
              <select
                id="deck-sort"
                aria-label="Sortieren nach"
                value={deckSort}
                onChange={(e) => setDeckSort(e.target.value)}
              >
                {Object.entries(SORT_BY).map(([key, label]) => (
                  <option key={key} value={key}>
                    Sortieren: {label}
                  </option>
                ))}
              </select>
              {deckText && (
                <button className="link-button" onClick={() => setDeckText('')}>
                  Suche zurücksetzen
                </button>
              )}
            </div>
            {deckText && (
              <p className="muted summary">
                {shownInDeck.reduce((sum, x) => sum + x.row.qty, 0)} von {total} Karten
              </p>
            )}

            {!deckList.length && <p className="status">Noch leer. Karten rechts antippen.</p>}
            {deckList.length > 0 && !shownInDeck.length && (
              <p className="status">Keine Karte im Deck passt zur Suche.</p>
            )}
            <DeckColumns
              columns={columns}
              usedElsewhere={usedElsewhere}
              onPick={setSelectedKey}
            />
          </section>

          <section className={`pool${narrow && !poolOpen ? ' folded' : ''}`}>
            {narrow ? (
              <button
                className="pool-toggle"
                aria-expanded={poolOpen}
                onClick={() => setPoolOpen(!poolOpen)}
              >
                Karten hinzufügen
                <span aria-hidden="true">{poolOpen ? '▲' : '▼'}</span>
              </button>
            ) : (
              <h3 className="side-title">Karten hinzufügen</h3>
            )}
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
                  <CardTile
                    key={card.key}
                    image={card.image}
                    name={`${name(card)} — ${card.type_de || card.type_line}`}
                    meta={`${card.set_code.toUpperCase()} #${card.number} · ${euro(card.price_eur)}`}
                    note={
                      <button
                        className="note-link"
                        title="Karte ansehen"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedKey(card.key)
                        }}
                      >
                        {card.owned} vorhanden
                        {inThisDeck > 0 && <strong> · {inThisDeck} im Deck</strong>}
                      </button>
                    }
                    onClick={() => change(card.key, 1)}
                  />
                )
              })}
            </div>
            {!pool.length && <p className="status">Keine Karten gefunden.</p>}
          </section>
        </div>
      )}

      {selected && (
        <CardDetail
          card={selected}
          noteLabel="In diesem Deck"
          note={`${selectedQty} von ${selected.owned} vorhandenen`}
          onClose={() => setSelectedKey(null)}
        >
          <div className="copies">
            <button
              disabled={!current || selectedQty === 0}
              onClick={() => change(selected.key, -1)}
              aria-label="Eine Kopie weniger"
            >
              −
            </button>
            <strong>{selectedQty}</strong>
            <button disabled={!current} onClick={() => change(selected.key, 1)} aria-label="Eine Kopie mehr">
              +
            </button>
          </div>
        </CardDetail>
      )}
    </main>
  )
}
