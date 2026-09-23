import { useMemo, useRef, useState } from 'react'
import { clearCache } from './cache'
import CardDialog from './CardDialog'
import { useCube } from './cube'
import FilterDialog from './FilterDialog'
import { type AdvancedFilters, type AppliedFilterKey } from './filters'
import { summary } from './format'
import { COLOR_LABELS, COLORS, keywordLabel, RARITY, TYPES } from './mtg'
import { useNotices } from './notices'
import { copyToClipboard, refreshCubePrices, wantList } from './prices'
import { parseQuery } from './query'
import { CardSkeleton } from './Skeleton'
import { canEdit, supabase, type Card, type Role } from './supabase'
import { loadTags } from './tags'
import { useGrowing } from './useGrowing'


/** Shown under the search field until someone searches. */
const EXAMPLES: [string, string][] = [
  ['c:r', 'rot'],
  ['t:kreatur mv<=2', 'kleine Kreaturen'],
  ['is:missing', 'fehlt euch'],
  ['eur>5', 'teuer'],
  ['otag:removal', 'Entfernung'],
]

const name = (c: Card) => c.name_de || c.name
const type = (c: Card) => c.type_de || c.type_line

export default function CubePage({ role }: { role: Role }) {
  const notices = useNotices()
  // Cards, sets, scanned copies and oracle tags, cached between visits.
  const { cards, sets, copies, prints, tags, loading, error, reloadCopies, patchCard } = useCube()

  const [text, setText] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [colors, setColors] = useState<Set<string>>(new Set())
  const [rarities, setRarities] = useState<string[]>([])
  const [cardTypes, setCardTypes] = useState<string[]>([])
  const [cmcs, setCmcs] = useState<string[]>([])
  const [keywordList, setKeywordList] = useState<string[]>([])
  // On: only cards that need exactly the picked colours, e.g. mono blue.
  const [exactColors, setExactColors] = useState(false)
  const [setCodes, setSetCodes] = useState<string[]>([])
  const [sort, setSort] = useState('name')
  const [showExcluded, setShowExcluded] = useState(false)
  // The cube is what you own. Missing cards only exist after a whole-set import.
  const [show, setShow] = useState<'owned' | 'missing' | 'all'>('owned')
  const [selected, setSelected] = useState<Card | null>(null)
  const [filterDraft, setFilterDraft] = useState<AdvancedFilters | null>(null)
  const filterOpener = useRef<HTMLButtonElement>(null)
  const [notice, setNotice] = useState('')

  // Keywords that actually appear on the cards in the database.
  const keywords = useMemo(
    () => [...new Set(cards.flatMap((c) => c.keywords))].sort((a, b) => keywordLabel(a).localeCompare(keywordLabel(b), 'de')),
    [cards],
  )

  // Fields the cube does not store, e.g. "f:commander".
  const unknownFields = useMemo(() => parseQuery(text).unknown, [text])

  const filtered =
    Boolean(
      text ||
        colors.size ||
        rarities.length ||
        cardTypes.length ||
        cmcs.length ||
        keywordList.length ||
        setCodes.length ||
        showExcluded,
    ) ||
    exactColors ||
    show !== 'owned' ||
    sort !== 'name'

  function resetFilters() {
    setText('')
    setColors(new Set())
    setRarities([])
    setCardTypes([])
    setCmcs([])
    setKeywordList([])
    setExactColors(false)
    setSetCodes([])
    setShowExcluded(false)
    setShow('owned')
    setSort('name')
  }

  const cubeSets = useMemo(() => sets.filter((set) => set.in_cube), [sets])
  const appliedFilters = useMemo(() => {
    const result: { key: AppliedFilterKey; label: string }[] = []
    if (colors.size) {
      result.push({
        key: 'colors',
        label: `Farben: ${[...colors].map((color) => COLOR_LABELS[color]).join(', ')}${exactColors ? ' · exakt' : ''}`,
      })
    }
    if (setCodes.length)
      result.push({
        key: 'set',
        label: `Set: ${setCodes.map((code) => cubeSets.find((set) => set.code === code)?.name ?? code).join(', ')}`,
      })
    if (keywordList.length)
      result.push({ key: 'keyword', label: `Schlüsselwort: ${keywordList.map(keywordLabel).join(', ')}` })
    if (cardTypes.length) result.push({ key: 'type', label: `Typ: ${cardTypes.join(', ')}` })
    if (cmcs.length)
      result.push({ key: 'cmc', label: `Manawert: ${cmcs.map((v) => (v === '7' ? '7+' : v)).join(', ')}` })
    if (rarities.length)
      result.push({ key: 'rarity', label: `Seltenheit: ${rarities.map((v) => RARITY[v] ?? v).join(', ')}` })
    if (showExcluded) result.push({ key: 'excluded', label: 'Ausgeschlossene zeigen' })
    return result
  }, [colors, exactColors, setCodes, cubeSets, keywordList, cardTypes, cmcs, rarities, showExcluded])

  function removeAppliedFilter(key: AppliedFilterKey) {
    if (key === 'colors') {
      setColors(new Set())
      setExactColors(false)
    } else if (key === 'set') setSetCodes([])
    else if (key === 'keyword') setKeywordList([])
    else if (key === 'type') setCardTypes([])
    else if (key === 'cmc') setCmcs([])
    else if (key === 'rarity') setRarities([])
    else setShowExcluded(false)
  }

  function openFilters() {
    setFilterDraft({
      colors: new Set(colors),
      setCodes,
      keywordList,
      cardTypes,
      cmcs,
      rarities,
      sort,
      showExcluded,
      exactColors: colors.size > 0 && exactColors,
    })
  }

  function closeFilters() {
    setFilterDraft(null)
    requestAnimationFrame(() => filterOpener.current?.focus())
  }

  function applyFilters(draft: AdvancedFilters) {
    setColors(new Set(draft.colors))
    setSetCodes(draft.setCodes)
    setKeywordList(draft.keywordList)
    setCardTypes(draft.cardTypes)
    setCmcs(draft.cmcs)
    setRarities(draft.rarities)
    setSort(draft.sort)
    setShowExcluded(draft.showExcluded)
    setExactColors(draft.colors.size > 0 && draft.exactColors)
    closeFilters()
  }

  const matched = useMemo(() => {
    const colorsMatch = (c: Card) => {
      if (!colors.size) return true
      const have = c.colors.split('').filter(Boolean)
      const wanted = [...colors].filter((col) => col !== 'C')
      if (!exactColors) {
        return [...colors].every((col) => (col === 'C' ? !have.length : have.includes(col)))
      }
      if (!wanted.length) return !have.length // only colourless picked
      return have.length === wanted.length && wanted.every((col) => have.includes(col))
    }

    const inCube = new Set(sets.filter((s) => s.in_cube).map((s) => s.code))
    // The search understands the Scryfall style, e.g. "c:r mv<=2 -t:land".
    const query = parseQuery(text)
    const result = cards.filter(
      (c) =>
        inCube.has(c.set_code) &&
        (!setCodes.length || setCodes.includes(c.set_code)) &&
        (showExcluded || !c.excluded) &&
        (!rarities.length || rarities.includes(c.rarity)) &&
        (!cmcs.length || cmcs.some((v) => (v === '7' ? c.cmc >= 7 : c.cmc === Number(v)))) &&
        (!cardTypes.length ||
          cardTypes.some((label) => TYPES.find(([name]) => name === label)?.[2].test(type(c)) ?? false)) &&
        colorsMatch(c) &&
        (!keywordList.length || keywordList.some((key) => c.keywords.includes(key))) &&
        query.test({ card: c, copies: copies.get(c.id) ?? 0, tags: tags.get(c.id) }),
    )
    const byName = (a: Card, b: Card) => name(a).localeCompare(name(b), 'de')
    const sorters: Record<string, (a: Card, b: Card) => number> = {
      name: byName,
      cmc: (a, b) => a.cmc - b.cmc || byName(a, b),
      price: (a, b) => (b.price_eur ?? -1) - (a.price_eur ?? -1),
      number: (a, b) =>
        a.set_code.localeCompare(b.set_code) || parseInt(a.number, 10) - parseInt(b.number, 10),
    }
    return result.sort(sorters[sort])
  }, [cards, sets, copies, tags, text, colors, exactColors, rarities, cardTypes, cmcs, keywordList, setCodes, sort, showExcluded])

  // The grid shows one of the three views, the summary always the whole filter.
  const list = useMemo(
    () => matched.filter((c) => show === 'all' || (show === 'owned') === Boolean(copies.get(c.id))),
    [matched, show, copies],
  )
  const { visible, more, sentinel } = useGrowing(list)
  const owned = matched.filter((c) => copies.get(c.id))
  const missing = matched.filter((c) => !copies.get(c.id))
  /* Each stack is worth what its own printing and finish cost; only a stack
     without a price of its own falls back to the card's price. */
  const valueOf = (card: Card) =>
    (prints.get(card.id) ?? []).reduce(
      (sum, row) => sum + row.qty * (row.price_eur ?? card.price_eur ?? 0),
      0,
    )
  const line = summary(
    {
      cards: owned.length,
      copies: matched.reduce((sum, c) => sum + (copies.get(c.id) ?? 0), 0),
      value: matched.reduce((sum, c) => sum + valueOf(c), 0),
    },
    // Every missing card counts once: what one copy each would cost.
    { cards: missing.length, value: missing.reduce((sum, c) => sum + (c.price_eur ?? 0), 0) },
  )

  // Editors change the number of scanned copies right here.
  /* [printId] and [finish] say which stack changes: the foil of a printing is
     counted on its own, next to the normal copies. */
  async function changeCopies(
    card: Card,
    delta: number,
    printId?: string,
    finish = 'nonfoil',
    price?: number | null,
  ) {
    const known = prints.get(card.id) ?? []
    const id = printId ?? known[0]?.print_id ?? card.id
    const { error } = await supabase.rpc(delta > 0 ? 'add_copy' : 'remove_copy', {
      p_print_id: id,
      p_card_id: card.id,
      p_source: 'web', // the history says where a change came from
      p_finish: finish,
      ...(delta > 0
        ? { p_lang: known.find((c) => c.print_id === id)?.lang ?? 'en', p_price: price ?? null }
        : {}),
    })
    if (error) return notices.say(`Speichern fehlgeschlagen: ${error.message}`, 'error')
    await reloadCopies()
  }

  async function toggleExcluded(card: Card) {
    let reason: string | null = null
    if (!card.excluded) {
      reason = await notices.ask(`Warum soll „${name(card)}“ aus dem Cube?`, 'Ausschließen')
      if (reason === null) return
    }
    const patch = { excluded: !card.excluded, exclude_reason: card.excluded ? null : reason || null }
    const { error } = await supabase.from('cards').update(patch).eq('id', card.id)
    if (error) return notices.say(`Speichern fehlgeschlagen: ${error.message}`, 'error')
    const updated = { ...card, ...patch }
    patchCard(updated)
    setSelected(updated)
  }

  return (
    <main className="page">
      <h1 className="cube-title">Cube</h1>
      <div className="toolbar">
        <input
          id="search"
          type="search"
          placeholder="Suche, z. B. c:r mv<=2"
          aria-label="Suche"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="colors" role="group" aria-label="Farben">
          {COLORS.map((color) => (
            <button
              key={color}
              className={`pip pip-${color}`}
              aria-label={`${COLOR_LABELS[color]} filtern`}
              aria-pressed={colors.has(color)}
              onClick={() => {
                const next = new Set(colors)
                if (next.has(color)) next.delete(color)
                else next.add(color)
                setColors(next)
                if (!next.size) setExactColors(false)
              }}
            >
              {color}
            </button>
          ))}
        </div>
        <select id="show" aria-label="Anzeigen" value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
          <option value="owned">Vorhandene Karten</option>
          <option value="missing">Fehlende Karten</option>
          <option value="all">Alle Karten</option>
        </select>
        <button className="link-button" onClick={() => setShowHelp(!showHelp)} aria-expanded={showHelp}>
          Suchhilfe
        </button>
        <button
          ref={filterOpener}
          id="filters"
          aria-controls="advanced-filters"
          aria-expanded={filterDraft !== null}
          aria-haspopup="dialog"
          onClick={openFilters}
        >
          Filter · {appliedFilters.length}
        </button>
      </div>
      {/* Active filters on the left, plain text actions on the right. */}
      <div className="applied-filters" aria-label="Aktive Filter und Aktionen">
        {appliedFilters.map((filter) => (
          <button key={filter.key} className="filter-pill" onClick={() => removeAppliedFilter(filter.key)}>
            {filter.label}<span aria-hidden="true">×</span><span className="sr-only"> entfernen</span>
          </button>
        ))}
        {filtered && (
          <button className="link-button" onClick={resetFilters}>
            Alle Filter zurücksetzen
          </button>
        )}
        <span className="row-actions">
          <button
            className="link-button"
            onClick={async () => {
              await copyToClipboard(wantList(list.map((c) => ({ name: c.name, qty: 1 }))))
              setNotice(`${list.length} Karten in die Zwischenablage kopiert.`)
            }}
          >
            {show === 'missing' ? 'Einkaufsliste kopieren' : 'Liste kopieren'}
          </button>
          {canEdit(role) && (
            <button
              className="link-button"
              onClick={() =>
                refreshCubePrices(setNotice)
                  .then(clearCache)
                  .catch((e) => setNotice(`Fehler: ${e.message}`))
              }
            >
              Kartendaten aktualisieren
            </button>
          )}
          {canEdit(role) && (
            <button
              className="link-button"
              onClick={() =>
                loadTags(setNotice)
                  .then(clearCache)
                  .catch((e) => setNotice(`Fehler: ${e.message}`))
              }
            >
              Schlagwörter laden
            </button>
          )}
        </span>
      </div>
      {/* First visit: what this page is and what the search can do. */}
      {!text && !filtered && (
        <p className="muted intro">
          Der Cube sind die Karten, aus denen ihr draftet. Gescannt wird mit der App, hier siehst du
          alles davon. Probier die Suche:{' '}
          {EXAMPLES.map(([query, label]) => (
            <button key={query} className="example" onClick={() => setText(query)}>
              <code>{query}</code> {label}
            </button>
          ))}
        </p>
      )}
      {unknownFields.length > 0 && (
        <p className="warn notice">
          Die Suche kennt {unknownFields.map((field) => `${field}:`).join(', ')} nicht. Mögliche Felder
          stehen unter „Suchhilfe“.
        </p>
      )}
      {showHelp && (
        <div className="search-help">
          <p>Wörter ohne Doppelpunkt suchen in Name, Typ und Kartentext.</p>
          <ul>
            <li><code>c:r</code> rot · <code>c=ur</code> genau Blau-Rot · <code>c:c</code> farblos</li>
            <li><code>t:kreatur</code> Typ · <code>o:"opfere"</code> Kartentext · <code>kw:fliegend</code> Schlüsselwort</li>
            <li><code>mv&lt;=2</code> Manawert · <code>r&gt;=rare</code> Seltenheit · <code>eur&gt;5</code> Preis</li>
            <li><code>s:blb</code> Set · <code>copies&gt;1</code> mehrfach · <code>is:missing</code> fehlt euch</li>
            <li><code>f:commander</code> im Format erlaubt · <code>banned:legacy</code> · <code>restricted:vintage</code></li>
            <li><code>is:commander</code> taugt als Commander · <code>is:legendary</code> · <code>is:multicolor</code></li>
            <li><code>otag:removal</code> Schlagwort aus dem Tagger, auch <code>otag:ramp</code>, <code>otag:counterspell</code></li>
            <li><code>-t:land</code> schließt aus · <code>or</code> verknüpft · <code>( )</code> gruppiert</li>
          </ul>
        </div>
      )}
      {notice && <p className="muted notice">{notice}</p>}
      {filterDraft && (
        <FilterDialog
          draft={filterDraft}
          sets={cubeSets}
          keywords={keywords}
          onDraftChange={setFilterDraft}
          onApply={applyFilters}
          onDiscard={closeFilters}
        />
      )}
      <p className="muted summary">
        {line}
        {show === 'missing' && (
          <span className="hint"> · Karten aus geladenen Sets, von denen ihr keine Kopie habt</span>
        )}
      </p>

      {error ? (
        <p className="status">Laden fehlgeschlagen: {error}</p>
      ) : loading ? (
        <CardSkeleton count={12} />
      ) : !list.length ? (
        <p className="status">
          {cubeSets.length ? 'Keine Karten gefunden.' : 'Noch keine Karten. Scanne Karten mit der App.'}
        </p>
      ) : (
        <div className="grid">
          {visible.map((c) => {
            const count = copies.get(c.id) ?? 0
            return (
              <button
                key={c.id}
                className={`tile${c.excluded ? ' excluded' : ''}${count ? '' : ' missing'}`}
                title={`${name(c)} — ${type(c)}`}
                onClick={() => setSelected(c)}
              >
                {c.image ? <img src={c.image} alt={name(c)} loading="lazy" /> : <div className="noimg">{name(c)}</div>}
                {!count && <span className="sr-only">Fehlt in der Sammlung</span>}
                {count > 0 && <span className="badge">{count}×</span>}
                {c.excluded && <span className="badge out">ausgeschlossen</span>}
              </button>
            )
          })}
        </div>
      )}
      {more > 0 && (
        <div ref={sentinel} className="status">
          Noch {more} Karten …
        </div>
      )}

      {selected && (
        <CardDialog
          key={selected.id}
          card={selected}
          copies={copies.get(selected.id) ?? 0}
          prints={prints.get(selected.id) ?? []}
          editable={canEdit(role)}
          onChangeCopies={(delta, printId, finish, price) =>
            changeCopies(selected, delta, printId, finish, price)
          }
          onToggleExcluded={() => toggleExcluded(selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  )
}

