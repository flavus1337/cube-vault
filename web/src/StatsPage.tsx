import { useEffect, useMemo, useState } from 'react'
import { readMine, writeMine } from './cache'
import { useCube } from './cube'
import { summary } from './format'
import { fetchAll, type Card, type PrivateCard } from './supabase'

// One row per card, no matter which list it came from.
type Row = {
  colors: string
  cmc: number
  type: string
  rarity: string | null
  price: number | null
  qty: number
}

const COLOR_GROUPS: [string, string][] = [
  ['W', 'Weiß'],
  ['U', 'Blau'],
  ['B', 'Schwarz'],
  ['R', 'Rot'],
  ['G', 'Grün'],
  ['M', 'Mehrfarbig'],
  ['C', 'Farblos'],
  ['L', 'Land'],
]
const TYPE_WORDS: Record<string, RegExp> = {
  Kreatur: /Kreatur|Creature/i,
  Spontanzauber: /Spontanzauber|Instant/i,
  Hexerei: /Hexerei|Sorcery/i,
  Verzauberung: /Verzauberung|Enchantment/i,
  Artefakt: /Artefakt|Artifact/i,
  Planeswalker: /Planeswalker/i,
  Land: /Land/i,
}
const RARITIES: [string, string][] = [
  ['common', 'Gewöhnlich'],
  ['uncommon', 'Ungewöhnlich'],
  ['rare', 'Selten'],
  ['mythic', 'Mythisch selten'],
]

// A land counts as land, everything else by its colours.
function colorGroup(row: Row) {
  if (TYPE_WORDS.Land.test(row.type)) return 'L'
  if (!row.colors) return 'C'
  return row.colors.length > 1 ? 'M' : row.colors
}

function Bars(props: { title: string; data: [string, number][]; color?: (key: string) => string }) {
  const { title, data, color } = props
  const max = Math.max(1, ...data.map(([, n]) => n))
  const total = data.reduce((sum, [, n]) => sum + n, 0)
  return (
    <section className="bars">
      <h2>{title}</h2>
      {data.map(([label, n]) => (
        <div key={label} className="bar-row">
          <span className="bar-label">{label}</span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${(n / max) * 100}%`, background: color?.(label) ?? 'var(--accent)' }}
            />
          </span>
          <span className="bar-value">
            {n}
            {total > 0 && <span className="muted"> · {Math.round((n / total) * 100)} %</span>}
          </span>
        </div>
      ))}
    </section>
  )
}

export default function StatsPage() {
  const [source, setSource] = useState<'cube' | 'mine'>('cube')
  // Count each card once, or every copy you own.
  const [unit, setUnit] = useState<'cards' | 'copies'>('cards')
  // Both lists come from the same cache the other pages use.
  const cube = useCube()
  const [mine, setMine] = useState<PrivateCard[] | null>(() => readMine())
  const [mineError, setMineError] = useState<string | null>(null)
  const error = source === 'cube' ? cube.error : mineError

  useEffect(() => {
    let stop = false
    fetchAll<PrivateCard>('private_cards', 'print_id')
      .then((rows) => {
        if (stop) return
        setMine(rows)
        writeMine(rows)
      })
      .catch((e) => {
        if (!stop) setMineError((e as Error).message)
      })
    return () => {
      stop = true
    }
  }, [])

  const { rows, missing } = useMemo(() => {
    if (source === 'mine') {
      // Own cards are cards you have, so nothing can be missing here.
      // Foil and normal of the same printing are one card here.
      const piles = new Map<string, Row>()
      for (const card of mine ?? []) {
        const seen = piles.get(card.print_id)
        if (seen) seen.qty += card.qty
        else piles.set(card.print_id, privateRow(card))
      }
      return { rows: mine ? [...piles.values()] : null, missing: null }
    }
    if (cube.loading) return { rows: null, missing: null }
    const inCube = new Set(cube.sets.filter((s) => s.in_cube).map((s) => s.code))
    const cards = cube.cards.filter((c) => inCube.has(c.set_code) && !c.excluded)
    const gap = cards.filter((c) => !cube.copies.get(c.id))
    return {
      rows: cards.filter((c) => cube.copies.get(c.id)).map((c) => cubeRow(c, cube.copies.get(c.id) ?? 0)),
      missing: { cards: gap.length, value: gap.reduce((sum, c) => sum + (c.price_eur ?? 0), 0) },
    }
  }, [source, mine, cube.cards, cube.sets, cube.copies, cube.loading])

  const stats = useMemo(() => {
    if (!rows) return null
    const weigh = (list: Row[]) =>
      unit === 'copies' ? list.reduce((sum, row) => sum + row.qty, 0) : list.length
    const curve = ['0', '1', '2', '3', '4', '5', '6', '7+'].map((label) => {
      const value = label === '7+' ? 7 : Number(label)
      const hit = rows.filter(
        (row) =>
          !TYPE_WORDS.Land.test(row.type) && (label === '7+' ? row.cmc >= 7 : row.cmc === value),
      )
      return [label, weigh(hit)] as [string, number]
    })
    return {
      cards: rows.length,
      copies: rows.reduce((sum, row) => sum + row.qty, 0),
      value: rows.reduce((sum, row) => sum + (row.price ?? 0) * row.qty, 0),
      colors: COLOR_GROUPS.map(
        ([key, label]) => [label, weigh(rows.filter((row) => colorGroup(row) === key))] as [string, number],
      ),
      curve,
      types: Object.keys(TYPE_WORDS).map(
        (type) => [type, weigh(rows.filter((row) => TYPE_WORDS[type].test(row.type)))] as [string, number],
      ),
      rarities: RARITIES.map(
        ([key, label]) => [label, weigh(rows.filter((row) => row.rarity === key))] as [string, number],
      ),
    }
  }, [rows, unit])

  const colorOf = (label: string) => {
    const key = COLOR_GROUPS.find(([, name]) => name === label)?.[0]
    if (key === 'M') return 'linear-gradient(90deg, var(--W), var(--U), var(--B), var(--R), var(--G))'
    if (key === 'L') return 'var(--line-strong)'
    return key ? `var(--${key})` : 'var(--accent)'
  }

  return (
    <main className="page narrow">
      <h1 className="cube-title">Auswertung</h1>
      <div className="toolbar">
        <select
          id="stats-source"
          aria-label="Quelle"
          value={source}
          onChange={(e) => setSource(e.target.value as typeof source)}
        >
          <option value="cube">Cube</option>
          <option value="mine">Meine Karten</option>
        </select>
        <select
          id="stats-unit"
          aria-label="Grundlage"
          value={unit}
          onChange={(e) => setUnit(e.target.value as typeof unit)}
        >
          <option value="cards">Karten zählen</option>
          <option value="copies">Kopien zählen</option>
        </select>
      </div>

      {error ? (
        <p className="status">Laden fehlgeschlagen: {error}</p>
      ) : !stats ? (
        <p className="status">Lädt …</p>
      ) : !stats.cards ? (
        <p className="status">Noch keine Karten.</p>
      ) : (
        <>
          <p className="muted summary">
            {summary(stats, missing ?? undefined)}
          </p>
          {source === 'cube' && (
            <p className="muted">
              Für einen Draft mit acht Spielern und drei Päckchen zu 15 Karten braucht ihr 360 Karten.
              {stats.cards >= 360 ? ' Das reicht.' : ` Es fehlen noch ${360 - stats.cards}.`}
            </p>
          )}
          <Bars title="Karten je Farbe" data={stats.colors} color={colorOf} />
          <Bars title="Manakurve, ohne Länder" data={stats.curve} />
          <Bars title="Kartentypen" data={stats.types} />
          <Bars title="Seltenheit" data={stats.rarities} />
        </>
      )}
    </main>
  )
}

const cubeRow = (c: Card, qty: number): Row => ({
  colors: c.colors,
  cmc: c.cmc,
  type: c.type_de || c.type_line,
  rarity: c.rarity,
  price: c.price_eur,
  qty,
})

const privateRow = (c: PrivateCard): Row => ({
  colors: c.colors,
  cmc: c.cmc,
  type: c.type_de || c.type_line,
  rarity: c.rarity,
  price: c.price_eur,
  qty: c.qty,
})
