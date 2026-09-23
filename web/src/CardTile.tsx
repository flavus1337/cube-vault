import type { ReactNode } from 'react'

/* One card in a grid. Nothing is drawn over the picture: the name, the mana
   cost and the power and toughness stay readable, and every number gets its
   word in the line below. Set, price and rarity appear while the pointer
   rests on the card. */
export default function CardTile(props: {
  image: string | null
  name: string
  /** The line under the card, e.g. "3× im Cube". */
  note: ReactNode
  /** Over the lower edge of the card while the pointer is on it. */
  meta?: string
  /** Added to the tile, e.g. "missing" or "excluded". */
  look?: string
  onClick?: () => void
  /** Buttons that belong next to the note, e.g. plus and minus. */
  children?: ReactNode
}) {
  const { image, name, note, meta, look = '', onClick, children } = props
  return (
    <div className="card-cell">
      <button
        className={`tile ${look}`.trim()}
        title={name}
        aria-label={name}
        onClick={onClick}
        type="button"
      >
        {image ? <img src={image} alt={name} loading="lazy" /> : <div className="noimg">{name}</div>}
        {meta && <span className="tile-meta">{meta}</span>}
      </button>
      <span className="tile-note">
        {note}
        {children}
      </span>
    </div>
  )
}
