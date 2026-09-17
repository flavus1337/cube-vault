import { useEffect, useMemo, useRef, useState } from 'react'
import { canEdit, fetchAll, supabase, type Card, type Copy, type CubeSet, type Role } from './supabase'

const RARITY: Record<string, string> = {
  common: 'Gewöhnlich',
  uncommon: 'Ungewöhnlich',
  rare: 'Selten',
  mythic: 'Mythisch selten',
}
const COLORS = ['W', 'U', 'B', 'R', 'G', 'C']
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

const countCopies = (rows: Copy[]) => {
  const counts = new Map<string, number>()
  for (const c of rows) counts.set(c.card_id, (counts.get(c.card_id) ?? 0) + c.qty)
  return counts
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
const euro = (n: number | null) =>
  n == null ? '–' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

export default function CubePage({ role }: { role: Role }) {
  const [cards, setCards] = useState<Card[]>([])
  const [sets, setSets] = useState<CubeSet[]>([])
  const [copies, setCopies] = useState<Map<string, number>>(new Map())
  // Prints scanned per card, most copies first: + and - act on the first one.
  const [prints, setPrints] = useState<Map<string, Copy[]>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [text, setText] = useState('')
  const [colors, setColors] = useState<Set<string>>(new Set())
  const [rarity, setRarity] = useState('')
  const [cardType, setCardType] = useState('')
  const [cmc, setCmc] = useState('')
  const [setCode, setSetCode] = useState('')
  const [sort, setSort] = useState('name')
  const [showExcluded, setShowExcluded] = useState(false)
  // The cube is what you own. Missing cards only exist after a whole-set import.
  const [show, setShow] = useState<'owned' | 'missing' | 'all'>('owned')
  const [selected, setSelected] = useState<Card | null>(null)

  useEffect(() => {
    let stop = false
    async function load() {
      try {
        const [cards, sets, copyRows] = await Promise.all([
          fetchAll<Card>('cards', 'id'),
          fetchAll<CubeSet>('sets', 'code'),
          fetchAll<Copy>('copies', 'print_id'),
        ])
        if (stop) return
        setCards(cards)
        setSets(sets)
        setCopies(countCopies(copyRows))
        setPrints(groupPrints(copyRows))
        setError(null)
      } catch (e) {
        if (!stop) setError((e as Error).message)
      } finally {
        if (!stop) setLoading(false)
      }
    }
    load()
    // Quietly pick up other people's scans. Filters, scrolling and the open
    // card stay as they are; a hidden tab skips the request.
    const timer = setInterval(() => {
      if (!document.hidden) load()
    }, 15000)
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [])

  const filtered =
    Boolean(text || colors.size || rarity || cardType || cmc || setCode || showExcluded) ||
    show !== 'owned' ||
    sort !== 'name'

  function resetFilters() {
    setText('')
    setColors(new Set())
    setRarity('')
    setCardType('')
    setCmc('')
    setSetCode('')
    setShowExcluded(false)
    setShow('owned')
    setSort('name')
  }

  const cubeSets = sets.filter((s) => s.in_cube)
  const list = useMemo(() => {
    const inCube = new Set(sets.filter((s) => s.in_cube).map((s) => s.code))
    const search = text.trim().toLowerCase()
    const result = cards.filter(
      (c) =>
        inCube.has(c.set_code) &&
        (!setCode || c.set_code === setCode) &&
        (showExcluded || !c.excluded) &&
        (show === 'all' || (show === 'owned') === Boolean(copies.get(c.id))) &&
        (!rarity || c.rarity === rarity) &&
        (!cmc || (cmc === '7' ? c.cmc >= 7 : c.cmc === Number(cmc))) &&
        (!cardType || (TYPES.find(([label]) => label === cardType)?.[1].test(type(c)) ?? true)) &&
        [...colors].every((col) => (col === 'C' ? !c.colors : c.colors.includes(col))) &&
        [c.name, c.name_de, c.type_line, c.type_de, c.set_code].join(' ').toLowerCase().includes(search),
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
  }, [cards, sets, copies, text, colors, rarity, cardType, cmc, setCode, sort, showExcluded, show])

  const ownedCount = list.filter((c) => copies.get(c.id)).length
  const copyCount = list.reduce((sum, c) => sum + (copies.get(c.id) ?? 0), 0)
  // Cardmarket price of the English print, times the copies you own.
  const value = list.reduce((sum, c) => sum + (c.price_eur ?? 0) * (copies.get(c.id) ?? 0), 0)

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
      <div className="toolbar">
        <input
          id="search"
          type="search"
          placeholder="Name, Typ oder Set"
          aria-label="Suche"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="colors">
          {COLORS.map((col) => (
            <button
              key={col}
              className={`pip pip-${col}`}
              aria-pressed={colors.has(col)}
              onClick={() => {
                const next = new Set(colors)
                if (next.has(col)) next.delete(col)
                else next.add(col)
                setColors(next)
              }}
            >
              {col}
            </button>
          ))}
        </div>
        <select id="set" aria-label="Set" value={setCode} onChange={(e) => setSetCode(e.target.value)}>
          <option value="">Alle Sets</option>
          {cubeSets.map((s) => (
            <option key={s.code} value={s.code}>
              {s.parent_code ? `↳ ${s.name}` : s.name}
            </option>
          ))}
        </select>
        <select id="type" aria-label="Kartentyp" value={cardType} onChange={(e) => setCardType(e.target.value)}>
          <option value="">Alle Typen</option>
          {TYPES.map(([label]) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>
        <select id="cmc" aria-label="Manawert" value={cmc} onChange={(e) => setCmc(e.target.value)}>
          <option value="">Jeder Manawert</option>
          {['0', '1', '2', '3', '4', '5', '6'].map((n) => (
            <option key={n} value={n}>
              {n} Mana
            </option>
          ))}
          <option value="7">7+ Mana</option>
        </select>
        <select id="rarity" aria-label="Seltenheit" value={rarity} onChange={(e) => setRarity(e.target.value)}>
          <option value="">Alle Seltenheiten</option>
          {Object.entries(RARITY).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select id="sort" aria-label="Sortierung" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name">Name</option>
          <option value="cmc">Manawert</option>
          <option value="price">Preis</option>
          <option value="number">Set-Nummer</option>
        </select>
        <label className="check">
          <input
            id="show-excluded"
            type="checkbox"
            checked={showExcluded}
            onChange={(e) => setShowExcluded(e.target.checked)}
          />
          Ausgeschlossene zeigen
        </label>
        {filtered && (
          <button id="reset" onClick={resetFilters}>
            Filter zurücksetzen
          </button>
        )}
        <select id="show" aria-label="Anzeigen" value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
          <option value="owned">Vorhandene Karten</option>
          <option value="missing">Fehlende Karten</option>
          <option value="all">Alle Karten</option>
        </select>
      </div>
      <p className="muted summary">
        {ownedCount} Karten · {copyCount} Kopien · {euro(value)}
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
    <dialog ref={ref} className="detail" onClose={onClose}>
      {card.image && <img src={hiRes ?? card.image} alt={name(card)} />}
      <h2>{name(card)}</h2>
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
