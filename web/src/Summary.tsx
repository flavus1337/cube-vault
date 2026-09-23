import { euro } from './format'

/* The numbers of a page, each with its word over it. A bare row of five
   numbers and two prices left everyone guessing which price was which. */
export default function Summary(props: {
  cards: number
  copies: number
  value: number
  /** Cards nobody owns yet and what one copy each would cost. */
  missing?: { cards: number; value: number } | null
  /** Which figure the page is showing right now. */
  highlight?: 'owned' | 'missing'
  /** A sentence under the numbers, e.g. what counts as missing. */
  hint?: string
}) {
  const { cards, copies, value, missing, highlight = 'owned', hint } = props
  return (
    <div className="summary-bar">
      <dl className="deck-stats">
        <div className={highlight === 'owned' ? 'lead' : ''}>
          <dt>Karten</dt>
          <dd>{cards}</dd>
        </div>
        <div>
          <dt>Kopien</dt>
          <dd>{copies}</dd>
        </div>
        <div>
          <dt>Wert</dt>
          <dd>{euro(value)}</dd>
        </div>
        {missing && missing.cards > 0 && (
          <div className={highlight === 'missing' ? 'lead' : ''}>
            <dt>Fehlen</dt>
            <dd>
              {missing.cards} <span className="muted">· {euro(missing.value)}</span>
            </dd>
          </div>
        )}
      </dl>
      {hint && <p className="muted hint">{hint}</p>}
    </div>
  )
}
