import { useEffect, useMemo, useState } from 'react'
import { readMine, writeMine } from './cache'
import CardDetail from './CardDetail'
import { useCube } from './cube'
import { euro } from './format'
import { addLands, BASICS, pipsOf, suggestLands } from './lands'
import { copyToClipboard, wantList } from './prices'
import { parseQuery } from './query'
import { fetchAll, supabase, type Card, type PrivateCard } from './supabase'

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

/* How the deck can be split into columns, the way Archidekt does it. */
const TYPE_ORDER: [string, RegExp][] = [
  ['Kreaturen', /Kreatur|Creature/i],
  ['Planeswalker', /Planeswalker/i],
  ['Spontanzauber', /Spontanzauber|Instant/i],
  ['Hexereien', /Hexerei|Sorcery/i],
  ['Länder', /Land/i],
  ['Artefakte', /Artefakt|Artifact/i],
  ['Verzauberungen', /Verzauberung|Enchantment/i],
]
const RARITY_ORDER: [string, string][] = [
  ['common', 'Gewöhnlich'],
  ['uncommon', 'Ungewöhnlich'],
  ['rare', 'Selten'],
  ['mythic', 'Mythisch selten'],
]
const GROUP_BY: Record<string, string> = {
  type: 'Typ',
  color: 'Farbe',
  cmc: 'Manabetrag',
  rarity: 'Seltenheit',
}
const SORT_BY: Record<string, string> = {
  name: 'Name',
  cmc: 'Manabetrag',
  price: 'Preis',
  qty: 'Anzahl',
}

const name = (c: PoolCard) => c.name_de || c.name
const isLand = (c: PoolCard) => /Land/i.test(c.type_de || c.type_line)

function groupOf(card: PoolCard) {
  if (isLand(card)) return 'L'
  if (!card.colors) return 'C'
  return card.colors.length > 1 ? 'M' : card.colors
}

const typeOf = (card: PoolCard) =>
  TYPE_ORDER.find(([, words]) => words.test(card.type_de || card.type_line))?.[0] ?? 'Sonstiges'

/** The columns of the deck view: a label, the cards in it, and a colour dot. */
function columnsOf(rows: { row: DeckCard; card: PoolCard }[], by: string) {
  const buckets = new Map<string, { row: DeckCard; card: PoolCard }[]>()
  const key = (card: PoolCard) => {
    if (by === 'color') return GROUPS.find(([g]) => g === groupOf(card))![1]
    if (by === 'cmc') return card.cmc >= 7 ? '7+ Mana' : `${card.cmc} Mana`
    if (by === 'rarity') return RARITY_ORDER.find(([r]) => r === card.rarity)?.[1] ?? 'Sonstiges'
    return typeOf(card)
  }
  for (const entry of rows) {
    const label = key(entry.card)
    buckets.set(label, [...(buckets.get(label) ?? []), entry])
  }
  const order =
    by === 'color'
      ? GROUPS.map(([, label]) => label)
      : by === 'cmc'
        ? ['0 Mana', '1 Mana', '2 Mana', '3 Mana', '4 Mana', '5 Mana', '6 Mana', '7+ Mana']
        : by === 'rarity'
          ? RARITY_ORDER.map(([, label]) => label)
          : [...TYPE_ORDER.map(([label]) => label), 'Sonstiges']
  const rest = [...buckets.keys()].filter((label) => !order.includes(label))
  return [...order, ...rest]
    .filter((label) => buckets.has(label))
    .map((label) => ({
      label,
      dot: by === 'color' ? GROUPS.find(([, l]) => l === label)?.[0] : null,
      rows: buckets.get(label)!,
    }))
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
  const cubeData = useCube()
  const [privateCards, setPrivateCards] = useState<PrivateCard[]>(() => readMine() ?? [])
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
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  /* Own cards are small and only you change them; the cube comes from the
     shared cache. Putting a card into a deck writes one small row. */
  async function loadPools() {
    const rows = await fetchAll<PrivateCard>('private_cards', 'print_id')
    setPrivateCards(rows)
    writeMine(rows)
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

  const mine = useMemo(() => privateCards.map(fromPrivate), [privateCards])
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
            <div className="deck-columns">
              {columns.map(({ label, dot, rows }) => (
                <section key={label} className="deck-column">
                  <h3>
                    {dot && <span className={`dot dot-${dot}`} aria-hidden="true" />}
                    {label} <span className="muted">{rows.reduce((sum, x) => sum + x.row.qty, 0)}</span>
                  </h3>
                  <div className="deck-stack">
                    {rows.map(({ row, card }) => {
                      const elsewhere = usedElsewhere(card.key)
                      const short = Math.max(0, row.qty + elsewhere - card.owned)
                      return (
                        <button
                          key={card.key}
                          className={`stack-card${short ? ' short' : ''}`}
                          title={`${name(card)} · ${card.cmc} Mana${short ? ` · ${short} fehlen` : ''}`}
                          aria-label={`${name(card)}, ${row.qty} im Deck`}
                          onClick={() => setSelectedKey(card.key)}
                        >
                          {card.image ? (
                            <img src={card.image} alt={name(card)} loading="lazy" />
                          ) : (
                            <div className="noimg">{name(card)}</div>
                          )}
                          <span className="badge">{row.qty}×</span>
                          {short > 0 && <span className="badge out">{short} fehlen</span>}
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </section>

          <section className="pool">
            <h3 className="side-title">Karten hinzufügen</h3>
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
                  <div key={card.key} className="tile-wrap">
                    <button
                      className="tile"
                      title={`${name(card)} — ${card.type_de || card.type_line}`}
                      aria-label={`${name(card)} ins Deck`}
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
                    <button
                      className="peek"
                      title="Karte ansehen"
                      aria-label={`${name(card)} ansehen`}
                      onClick={() => setSelectedKey(card.key)}
                    >
                      ⌕
                    </button>
                  </div>
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
          note={`${selectedQty}× im Deck · ${selected.owned} vorhanden`}
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
