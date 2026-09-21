import { useEffect, useMemo, useRef, useState } from 'react'
import { euro, summary } from './format'
import { copyToClipboard, refreshCubePrices, wantList } from './prices'
import { parseQuery } from './query'
import { loadTags, type CardTag } from './tags'
import { canEdit, fetchAll, supabase, type Card, type Copy, type CubeSet, type Role } from './supabase'

const RARITY: Record<string, string> = {
  common: 'Gewöhnlich',
  uncommon: 'Ungewöhnlich',
  rare: 'Selten',
  mythic: 'Mythisch selten',
}
const COLORS = ['W', 'U', 'B', 'R', 'G', 'C']
const COLOR_LABELS: Record<string, string> = {
  W: 'Weiß',
  U: 'Blau',
  B: 'Schwarz',
  R: 'Rot',
  G: 'Grün',
  C: 'Farblos',
}
// German label with the words to look for in the type line (German or English).
const TYPES: [string, RegExp][] = [
  ['Kreatur', /Kreatur|Creature/i],
  ['Land', /Land/i],
  ['Spontanzauber', /Spontanzauber|Instant/i],
  ['Hexerei', /Hexerei|Sorcery/i],
  ['Verzauberung', /Verzauberung|Enchantment/i],
  ['Artefakt', /Artefakt|Artifact/i],
  ['Planeswalker', /Planeswalker/i],
]

// German keyword labels, taken from the German card texts on Scryfall
// (tools/keywords_de.py). Keywords without a clean label stay English.
const KEYWORDS: Record<string, string> = {
  Affinity: 'Affinität',
  Afterlife: 'Seelenwandlung',
  Alliance: 'Allianz',
  Ascend: 'Aufstieg',
  Battalion: 'Bataillon',
  Behold: 'Erblicken',
  Bloodrush: 'Blutrausch',
  Bloodthirst: 'Blutdurst',
  Changeling: 'Wandelwicht',
  Converge: 'Konvergenz',
  Convoke: 'Einberufen',
  Crew: 'Bemannen',
  Cycling: 'Umwandlung',
  Deathtouch: 'Todesberührung',
  Decayed: 'Verwesung',
  Defender: 'Verteidiger',
  'Double strike': 'Doppelschlag',
  Dredge: 'Ausgraben',
  Eerie: 'Unheimlich',
  Enchant: 'Verzaubert',
  Enrage: 'Erzürnen',
  Equip: 'Ausrüsten',
  Escape: 'Befreiung',
  Evoke: 'Herbeirufen',
  Evolve: 'Weiterentwicklung',
  Exhaust: 'Überstrapazieren',
  Extort: 'Abnötigen',
  Ferocious: 'Wildheit',
  'First strike': 'Erstschlag',
  Flash: 'Aufblitzen',
  Flashback: 'Rückblende',
  Flurry: 'Zaubergestöber',
  Flying: 'Fliegend',
  Forage: 'Hamstern',
  Forecast: 'Vorhersage',
  Forestcycling: 'Waldumwandlung',
  Forestwalk: 'Waldtarnung',
  Graft: 'Pfropfen',
  Harmonize: 'Harmonisieren',
  Haste: 'Eile',
  Haunt: 'Spuk',
  Hellbent: 'Versessenheit',
  Hexproof: 'Fluchsicher',
  Hideaway: 'Refugium',
  Impending: 'Unheilsdrohend',
  Imprint: 'Einprägen',
  Improvise: 'Improvisieren',
  Indestructible: 'Unzerstörbar',
  Islandcycling: 'Inselumwandlung',
  'Job select': 'Auftragsauswahl',
  'Jump-start': 'Katalyse',
  Kicker: 'Bonus',
  Landfall: 'Landung',
  Landwalk: 'Landtarnung',
  'Level Up': 'Stufe aufsteigen',
  Lifelink: 'Lebensverknüpfung',
  Magecraft: 'Magiefertigkeit',
  'Max speed': 'Maximaltempo',
  Menace: 'Bedrohlich',
  Metalcraft: 'Metallkunst',
  Mill: 'Millen',
  Mobilize: 'Mobilisieren',
  Morbid: 'Morbide',
  Mountaincycling: 'Gebirgsumwandlung',
  Offspring: 'Nachwuchs',
  Overload: 'Überlast',
  Parley: 'Verhandlungen',
  Plainscycling: 'Ebenenumwandlung',
  Protection: 'Schutz',
  Prowess: 'Bravour',
  Raid: 'Überfall',
  Ravenous: 'Unersättlich',
  Reach: 'Reichweite',
  Renew: 'Erneuerung',
  Replicate: 'Reproduktion',
  Riot: 'Aufruhr',
  Saddle: 'Aufsatteln',
  Scavenge: 'Ausplündern',
  Shroud: 'Verhüllt',
  Spectacle: 'Spektakel',
  'Start your engines!': 'Starte die Motoren',
  Storm: 'Sturm',
  Survival: 'Überlebenskunst',
  Suspend: 'Aussetzen',
  Swampcycling: 'Sumpfumwandlung',
  Swampwalk: 'Sumpftarnung',
  'Tempting offer': 'Verlockendes Angebot',
  Threshold: 'Grenzwert',
  Tiered: 'Stufenmagie',
  Toxic: 'Toxisch',
  Trample: 'Verursacht Trampelschaden',
  Transmute: 'Transmutation',
  Unleash: 'Entfesselt',
  Valiant: 'Tapfer',
  Vanishing: 'Verschwinden',
  Vigilance: 'Wachsamkeit',
  Ward: 'Abwehr',
}
const keywordLabel = (key: string) => KEYWORDS[key] ?? key

type AdvancedFilters = {
  colors: Set<string>
  setCodes: string[]
  keywordList: string[]
  cardTypes: string[]
  cmcs: string[]
  rarities: string[]
  sort: string
  showExcluded: boolean
  exactColors: boolean
}

type AppliedFilterKey = 'colors' | 'set' | 'keyword' | 'type' | 'cmc' | 'rarity' | 'excluded'

const EMPTY_ADVANCED: Omit<AdvancedFilters, 'colors'> = {
  setCodes: [],
  keywordList: [],
  cardTypes: [],
  cmcs: [],
  rarities: [],
  sort: 'name',
  showExcluded: false,
  exactColors: false,
}

const SORTS: Record<string, string> = {
  name: 'Name',
  cmc: 'Manawert',
  price: 'Preis',
  number: 'Set-Nummer',
}

const countCopies = (rows: Copy[]) => {
  const counts = new Map<string, number>()
  for (const c of rows) counts.set(c.card_id, (counts.get(c.card_id) ?? 0) + c.qty)
  return counts
}

const groupTags = (rows: CardTag[]) => {
  const byCard = new Map<string, string[]>()
  for (const row of rows) byCard.set(row.card_id, [...(byCard.get(row.card_id) ?? []), row.tag])
  return byCard
}

const groupPrints = (rows: Copy[]) => {
  const byCard = new Map<string, Copy[]>()
  for (const c of rows) byCard.set(c.card_id, [...(byCard.get(c.card_id) ?? []), c])
  for (const list of byCard.values()) list.sort((a, b) => b.qty - a.qty)
  return byCard
}

const name = (c: Card) => c.name_de || c.name
const type = (c: Card) => c.type_de || c.type_line
// Sharpest Scryfall image (745×1040 PNG), only for the detail view.
const png = (url: string) => url.replace('/normal/', '/png/').replace('.jpg', '.png')

export default function CubePage({ role }: { role: Role }) {
  const [cards, setCards] = useState<Card[]>([])
  const [sets, setSets] = useState<CubeSet[]>([])
  const [copies, setCopies] = useState<Map<string, number>>(new Map())
  // Prints scanned per card, most copies first: + and - act on the first one.
  const [prints, setPrints] = useState<Map<string, Copy[]>>(new Map())
  // Oracle tags per card, e.g. removal or ramp.
  const [tags, setTags] = useState<Map<string, string[]>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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

  useEffect(() => {
    let stop = false
    let lastEvent = 0

    async function loadAll() {
      try {
        const [cards, sets, copyRows, tagRows, newest] = await Promise.all([
          fetchAll<Card>('cards', 'id'),
          fetchAll<CubeSet>('sets', 'code'),
          fetchAll<Copy>('copies', 'print_id'),
          fetchAll<CardTag>('card_tags', 'card_id'),
          supabase.from('card_events').select('id').order('id', { ascending: false }).limit(1).maybeSingle(),
        ])
        if (stop) return
        setCards(cards)
        setSets(sets)
        setCopies(countCopies(copyRows))
        setPrints(groupPrints(copyRows))
        setTags(groupTags(tagRows))
        setError(null)
        lastEvent = (newest.data?.id as number | undefined) ?? 0
      } catch (e) {
        if (!stop) setError((e as Error).message)
      } finally {
        if (!stop) setLoading(false)
      }
    }

    /* Other people's scans arrive as events. Reloading every card each time
       would move about 2 MB, so only the cards named in the new events are
       fetched again. A hidden tab asks for nothing. */
    async function catchUp() {
      if (document.hidden) return
      const { data: events } = await supabase
        .from('card_events')
        .select('id, action, card_id')
        .gt('id', lastEvent)
        .order('id')
      if (stop || !events?.length) return
      lastEvent = events[events.length - 1].id as number

      // A set came or went: which cards belong to the cube changes, so reload.
      if (events.some((e) => String(e.action).startsWith('set_'))) return loadAll()

      const ids = [...new Set(events.map((e) => e.card_id).filter((id): id is string => Boolean(id)))]
      if (!ids.length) return
      const [changedCards, changedCopies] = await Promise.all([
        supabase.from('cards').select('*').in('id', ids),
        supabase.from('copies').select('*').in('card_id', ids),
      ])
      if (stop) return
      const fresh = (changedCards.data ?? []) as Card[]
      setCards((all) => [...all.filter((c) => !ids.includes(c.id)), ...fresh])
      const rows = (changedCopies.data ?? []) as Copy[]
      setCopies((all) => {
        const next = new Map(all)
        for (const id of ids) next.delete(id)
        for (const [id, qty] of countCopies(rows)) next.set(id, qty)
        return next
      })
      setPrints((all) => {
        const next = new Map(all)
        for (const id of ids) next.delete(id)
        for (const [id, list] of groupPrints(rows)) next.set(id, list)
        return next
      })
    }

    loadAll()
    const timer = setInterval(catchUp, 15000)
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [])

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
          cardTypes.some((label) => TYPES.find(([name]) => name === label)?.[1].test(type(c)) ?? false)) &&
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
  const list = matched.filter(
    (c) => show === 'all' || (show === 'owned') === Boolean(copies.get(c.id)),
  )
  const owned = matched.filter((c) => copies.get(c.id))
  const missing = matched.filter((c) => !copies.get(c.id))
  const line = summary(
    {
      cards: owned.length,
      copies: matched.reduce((sum, c) => sum + (copies.get(c.id) ?? 0), 0),
      // Cardmarket price of the English print, times the copies you own.
      value: matched.reduce((sum, c) => sum + (c.price_eur ?? 0) * (copies.get(c.id) ?? 0), 0),
    },
    // Every missing card counts once: what one copy each would cost.
    { cards: missing.length, value: missing.reduce((sum, c) => sum + (c.price_eur ?? 0), 0) },
  )

  // Editors change the number of scanned copies right here.
  async function changeCopies(card: Card, delta: number) {
    const known = prints.get(card.id) ?? []
    const printId = known[0]?.print_id ?? card.id
    const { error } = await supabase.rpc(delta > 0 ? 'add_copy' : 'remove_copy', {
      p_print_id: printId,
      p_card_id: card.id,
      p_source: 'web', // the history says where a change came from
      ...(delta > 0 ? { p_lang: known[0]?.lang ?? 'en' } : {}),
    })
    if (error) return alert(`Speichern fehlgeschlagen: ${error.message}`)
    const copyRows = await fetchAll<Copy>('copies', 'print_id')
    setCopies(countCopies(copyRows))
    setPrints(groupPrints(copyRows))
  }

  async function toggleExcluded(card: Card) {
    let reason: string | null = null
    if (!card.excluded) {
      reason = prompt(`Warum soll „${name(card)}“ aus dem Cube?`)
      if (reason === null) return
    }
    const patch = { excluded: !card.excluded, exclude_reason: card.excluded ? null : reason || null }
    const { error } = await supabase.from('cards').update(patch).eq('id', card.id)
    if (error) return alert(`Speichern fehlgeschlagen: ${error.message}`)
    const updated = { ...card, ...patch }
    setCards((all) => all.map((c) => (c.id === card.id ? updated : c)))
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
              onClick={() => refreshCubePrices(setNotice).catch((e) => setNotice(`Fehler: ${e.message}`))}
            >
              Kartendaten aktualisieren
            </button>
          )}
          {canEdit(role) && (
            <button
              className="link-button"
              onClick={() => loadTags(setNotice).catch((e) => setNotice(`Fehler: ${e.message}`))}
            >
              Schlagwörter laden
            </button>
          )}
        </span>
      </div>
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
      </p>

      {error ? (
        <p className="status">Laden fehlgeschlagen: {error}</p>
      ) : loading ? (
        <p className="status">Lädt …</p>
      ) : !list.length ? (
        <p className="status">
          {cubeSets.length ? 'Keine Karten gefunden.' : 'Noch keine Karten. Scanne Karten mit der App.'}
        </p>
      ) : (
        <div className="grid">
          {list.map((c) => {
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

      {selected && (
        <CardDialog
          key={selected.id}
          card={selected}
          copies={copies.get(selected.id) ?? 0}
          editable={canEdit(role)}
          onChangeCopies={(delta) => changeCopies(selected, delta)}
          onToggleExcluded={() => toggleExcluded(selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  )
}

function FilterDialog(props: {
  draft: AdvancedFilters
  sets: CubeSet[]
  keywords: string[]
  onDraftChange: (draft: AdvancedFilters) => void
  onApply: (draft: AdvancedFilters) => void
  onDiscard: () => void
}) {
  const { draft, sets, keywords, onDraftChange, onApply, onDiscard } = props
  const ref = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [setSearch, setSetSearch] = useState('')
  const [keywordSearch, setKeywordSearch] = useState('')
  const setDraft = <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) =>
    onDraftChange({ ...draft, [key]: value })
  /** Picking several values is the point: a click adds or removes one. */
  const toggle = (key: 'setCodes' | 'keywordList' | 'cardTypes' | 'cmcs' | 'rarities', value: string) =>
    onDraftChange({
      ...draft,
      [key]: draft[key].includes(value) ? draft[key].filter((v) => v !== value) : [...draft[key], value],
    })

  const visibleSets = sets.filter((set) =>
    `${set.name} ${set.code}`.toLocaleLowerCase('de').includes(setSearch.trim().toLocaleLowerCase('de')),
  )
  const visibleKeywords = keywords.filter((key) =>
    `${keywordLabel(key)} ${key}`.toLocaleLowerCase('de').includes(keywordSearch.trim().toLocaleLowerCase('de')),
  )

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (dialog.isConnected && !dialog.open) dialog.showModal()
    const focusFrame = requestAnimationFrame(() => closeButton.current?.focus())
    return () => {
      cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
    }
  }, [])

  function closeOnBackdrop(event: React.MouseEvent<HTMLDialogElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const onDialog =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    if (!onDialog) event.currentTarget.close()
  }

  return (
    <dialog
      ref={ref}
      id="advanced-filters"
      className="filter-dialog"
      aria-labelledby="advanced-filters-title"
      onClick={closeOnBackdrop}
      onClose={onDiscard}
    >
      <div className="filter-dialog-head">
        <div>
          <p className="filter-eyebrow">Kartensuche</p>
          <h2 id="advanced-filters-title">Erweiterte Filter</h2>
        </div>
        <button ref={closeButton} className="dialog-close" aria-label="Filter schließen" onClick={() => ref.current?.close()}>
          ×
        </button>
      </div>

      <div className="filter-dialog-body">
        <fieldset className="filter-fieldset searchable-options">
          <legend>Set</legend>
          <label htmlFor="filter-set-search">Sets durchsuchen</label>
          <input
            id="filter-set-search"
            type="search"
            placeholder="Name oder Code"
            value={setSearch}
            onChange={(event) => setSetSearch(event.target.value)}
          />
          <div className="radio-list">
            {!setSearch && (
              <label>
                <input type="checkbox" checked={!draft.setCodes.length} onChange={() => setDraft('setCodes', [])} />
                Alle Sets
              </label>
            )}
            {visibleSets.map((set) => (
              <label key={set.code}>
                <input
                  type="checkbox"
                  value={set.code}
                  checked={draft.setCodes.includes(set.code)}
                  onChange={() => toggle('setCodes', set.code)}
                />
                <span>{set.parent_code ? `↳ ${set.name}` : set.name}<small>{set.code.toUpperCase()}</small></span>
              </label>
            ))}
            {!visibleSets.length && <p className="muted option-empty">Kein Set gefunden.</p>}
          </div>
        </fieldset>

        <fieldset className="filter-fieldset searchable-options">
          <legend>Schlüsselwort</legend>
          <label htmlFor="filter-keyword-search">Schlüsselwörter durchsuchen</label>
          <input
            id="filter-keyword-search"
            type="search"
            placeholder="Begriff"
            value={keywordSearch}
            onChange={(event) => setKeywordSearch(event.target.value)}
          />
          <div className="radio-list">
            {!keywordSearch && (
              <label>
                <input
                  type="checkbox"
                  checked={!draft.keywordList.length}
                  onChange={() => setDraft('keywordList', [])}
                />
                Alle Schlüsselwörter
              </label>
            )}
            {visibleKeywords.map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  value={key}
                  checked={draft.keywordList.includes(key)}
                  onChange={() => toggle('keywordList', key)}
                />
                {keywordLabel(key)}
              </label>
            ))}
            {!visibleKeywords.length && <p className="muted option-empty">Kein Schlüsselwort gefunden.</p>}
          </div>
        </fieldset>

        <fieldset className="filter-fieldset">
          <legend>Kartentyp</legend>
          <div className="choice-pills">
            <button aria-pressed={!draft.cardTypes.length} onClick={() => setDraft('cardTypes', [])}>
              Alle
            </button>
            {TYPES.map(([label]) => (
              <button
                key={label}
                aria-pressed={draft.cardTypes.includes(label)}
                onClick={() => toggle('cardTypes', label)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="filter-fieldset">
          <legend>Manawert</legend>
          <div className="choice-pills">
            <button aria-pressed={!draft.cmcs.length} onClick={() => setDraft('cmcs', [])}>
              Alle
            </button>
            {['0', '1', '2', '3', '4', '5', '6', '7'].map((value) => (
              <button key={value} aria-pressed={draft.cmcs.includes(value)} onClick={() => toggle('cmcs', value)}>
                {value === '7' ? '7+' : value}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="filter-fieldset">
          <legend>Seltenheit</legend>
          <div className="choice-pills">
            <button aria-pressed={!draft.rarities.length} onClick={() => setDraft('rarities', [])}>
              Alle
            </button>
            {Object.entries(RARITY).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={draft.rarities.includes(value)}
                onClick={() => toggle('rarities', value)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="filter-fieldset">
          <legend>Sortierung</legend>
          <div className="choice-pills">
            {Object.entries(SORTS).map(([value, label]) => (
              <button key={value} aria-pressed={draft.sort === value} onClick={() => setDraft('sort', value)}>{label}</button>
            ))}
          </div>
        </fieldset>

        <fieldset className="filter-fieldset filter-toggles">
          <legend>Weitere Optionen</legend>
          <button aria-pressed={draft.showExcluded} onClick={() => setDraft('showExcluded', !draft.showExcluded)}>
            Ausgeschlossene zeigen
          </button>
          <button
            aria-pressed={draft.colors.size > 0 && draft.exactColors}
            disabled={!draft.colors.size}
            onClick={() => setDraft('exactColors', !draft.exactColors)}
          >
            Nur gewählte Farben
          </button>
          {!draft.colors.size && <p className="muted option-hint">Wähle zuerst mindestens eine Farbe in der Filterleiste.</p>}
        </fieldset>
      </div>

      <div className="filter-dialog-actions">
        <button onClick={() => onDraftChange({ colors: new Set(draft.colors), ...EMPTY_ADVANCED })}>Zurücksetzen</button>
        <button className="primary" onClick={() => onApply(draft)}>Filter anwenden</button>
      </div>
    </dialog>
  )
}

function CardDialog(props: {
  card: Card
  copies: number
  editable: boolean
  onChangeCopies: (delta: number) => Promise<void>
  onToggleExcluded: () => void
  onClose: () => void
}) {
  const { card, copies, editable, onChangeCopies, onToggleExcluded, onClose } = props
  const [busy, setBusy] = useState(false)

  async function change(delta: number) {
    setBusy(true)
    await onChangeCopies(delta)
    setBusy(false)
  }
  const ref = useRef<HTMLDialogElement>(null)
  const [hiRes, setHiRes] = useState<string | null>(null)

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  // Show the cached grid image first, swap in the PNG once it has loaded.
  // The dialog is keyed by card id, so hiRes starts empty for every card.
  useEffect(() => {
    if (!card.image) return
    const img = new Image()
    img.onload = () => setHiRes(img.src)
    img.src = png(card.image)
    return () => {
      img.onload = null
    }
  }, [card.image])

  return (
    <dialog ref={ref} className="detail" aria-labelledby="card-detail-title" onClose={onClose}>
      {card.image && <img src={hiRes ?? card.image} alt={name(card)} />}
      <h2 id="card-detail-title">{name(card)}</h2>
      {card.name_de && card.name_de !== card.name && <p className="muted">{card.name}</p>}
      <p>{type(card)}</p>
      <p className="rules">{card.text_de || card.oracle_text}</p>
      <p className="muted">
        {card.set_code.toUpperCase()} #{card.number} · {RARITY[card.rarity] ?? card.rarity} · {euro(card.price_eur)} ·{' '}
        {copies}× gescannt
      </p>
      {editable && (
        <div className="copies">
          <button id="fewer" disabled={busy || copies === 0} onClick={() => change(-1)} aria-label="Eine Kopie weniger">
            −
          </button>
          <strong>{copies}</strong>
          <button id="more" disabled={busy} onClick={() => change(1)} aria-label="Eine Kopie mehr">
            +
          </button>
        </div>
      )}
      <p>
        <a
          href={`https://www.cardmarket.com/de/Magic/Products/Search?searchString=${encodeURIComponent(card.name)}`}
          target="_blank"
          rel="noopener"
        >
          Bei Cardmarket suchen
        </a>
      </p>
      {card.excluded && (
        <p className="warn">Ausgeschlossen{card.exclude_reason ? `: ${card.exclude_reason}` : ''}</p>
      )}
      <div className="actions">
        {editable && (
          <button onClick={onToggleExcluded}>{card.excluded ? 'Wieder aufnehmen' : 'Ausschließen'}</button>
        )}
        <button className="primary" onClick={() => ref.current?.close()}>
          Schließen
        </button>
      </div>
    </dialog>
  )
}
