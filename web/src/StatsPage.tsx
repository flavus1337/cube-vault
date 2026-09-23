import { useMemo, useState } from 'react'
import { useCube } from './cube'
import { usePrivateCards } from './mine'
import { RowSkeleton } from './Skeleton'
import Summary from './Summary'
import { COLOR_GROUPS, colorGroupOf, isLand, RARITIES, TYPES } from './mtg'
import { type Card, type Copy, type PrivateCard } from './supabase'

// One row per card, no matter which list it came from.
type Row = {
  colors: string
  cmc: number
  type: string
  rarity: string | null
  price: number | null
  qty: number
  /** What the copies are worth together; foils cost more than the card. */
  value: number
}


const colorGroup = (row: Row) => colorGroupOf(row.colors, row.type)

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
  const { cards: mine, loading: mineLoading, error: mineError } = usePrivateCards()
  const error = source === 'cube' ? cube.error : mineError

  const { rows, missing } = useMemo(() => {
    if (source === 'mine') {
      if (mineLoading) return { rows: null, missing: null }
      // Own cards are cards you have, so nothing can be missing here.
      // Foil and normal of the same printing are one card here.
      const piles = new Map<string, Row>()
      for (const card of mine) {
        const seen = piles.get(card.print_id)
        if (seen) {
          seen.qty += card.qty
          seen.value += (card.price_eur ?? 0) * card.qty
        }
        else piles.set(card.print_id, privateRow(card))
      }
      return { rows: [...piles.values()], missing: null }
    }
    if (cube.loading) return { rows: null, missing: null }
    const inCube = new Set(cube.sets.filter((s) => s.in_cube).map((s) => s.code))
    const cards = cube.cards.filter((c) => inCube.has(c.set_code) && !c.excluded)
    const gap = cards.filter((c) => !cube.copies.get(c.id))
    return {
      rows: cards
        .filter((c) => cube.copies.get(c.id))
        .map((c) => cubeRow(c, cube.copies.get(c.id) ?? 0, cube.prints.get(c.id) ?? [])),
      missing: { cards: gap.length, value: gap.reduce((sum, c) => sum + (c.price_eur ?? 0), 0) },
    }
  }, [source, mine, mineLoading, cube.cards, cube.sets, cube.copies, cube.prints, cube.loading])

  const stats = useMemo(() => {
    if (!rows) return null
    const weigh = (list: Row[]) =>
      unit === 'copies' ? list.reduce((sum, row) => sum + row.qty, 0) : list.length
    const curve = ['0', '1', '2', '3', '4', '5', '6', '7+'].map((label) => {
      const value = label === '7+' ? 7 : Number(label)
      const hit = rows.filter(
        (row) => !isLand(row.type) && (label === '7+' ? row.cmc >= 7 : row.cmc === value),
      )
      return [label, weigh(hit)] as [string, number]
    })
    return {
      cards: rows.length,
      copies: rows.reduce((sum, row) => sum + row.qty, 0),
      value: rows.reduce((sum, row) => sum + row.value, 0),
      colors: COLOR_GROUPS.map(
        ([key, label]) => [label, weigh(rows.filter((row) => colorGroup(row) === key))] as [string, number],
      ),
      curve,
      types: TYPES.map(
        ([label, , words]) => [label, weigh(rows.filter((row) => words.test(row.type)))] as [string, number],
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
        <RowSkeleton count={8} />
      ) : !stats.cards ? (
        <p className="status">Noch keine Karten.</p>
      ) : (
        <>
          <Summary
            cards={stats.cards}
            copies={stats.copies}
            value={stats.value}
            missing={missing}
          />
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

const cubeRow = (c: Card, qty: number, copies: Copy[]): Row => ({
  colors: c.colors,
  cmc: c.cmc,
  type: c.type_de || c.type_line,
  rarity: c.rarity,
  price: c.price_eur,
  qty,
  value: copies.reduce((sum, row) => sum + row.qty * (row.price_eur ?? c.price_eur ?? 0), 0),
})

const privateRow = (c: PrivateCard): Row => ({
  colors: c.colors,
  cmc: c.cmc,
  type: c.type_de || c.type_line,
  rarity: c.rarity,
  price: c.price_eur,
  qty: c.qty,
  value: (c.price_eur ?? 0) * c.qty,
})
