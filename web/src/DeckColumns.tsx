import { name, type DeckRow } from './deck'

/* The deck as stacks of cards, one column per group. Only the name strip of
   a card shows; the card under the pointer comes to the front. */
export default function DeckColumns({
  columns,
  usedElsewhere,
  onPick,
}: {
  columns: { label: string; dot: string | null | undefined; rows: DeckRow[] }[]
  /** Copies of this card that other decks already hold. */
  usedElsewhere: (key: string) => number
  onPick: (key: string) => void
}) {
  return (
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
                  onClick={() => onPick(card.key)}
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
  )
}
