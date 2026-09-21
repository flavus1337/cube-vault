import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cardmarket, euro, png, RARITY } from './format'

/* What the detail view needs. Own cards keep fewer fields than cube cards,
   so everything but the printing is optional. */
export type DetailCard = {
  name: string
  name_de?: string | null
  type_line: string
  type_de?: string | null
  oracle_text?: string | null
  text_de?: string | null
  set_code: string
  number: string
  rarity?: string | null
  price_eur: number | null
  image: string | null
}

/** The card in big, with room for the buttons each page brings along. */
export default function CardDetail(props: {
  card: DetailCard
  /** Added to the line with set, rarity and price, e.g. "3× im Deck". */
  note?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  onClose: () => void
}) {
  const { card, note, children, actions, onClose } = props
  const ref = useRef<HTMLDialogElement>(null)
  const [hiRes, setHiRes] = useState<string | null>(null)
  const title = card.name_de || card.name

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  // Show the cached grid image first, swap in the PNG once it has loaded.
  useEffect(() => {
    if (!card.image) return
    const img = new Image()
    img.onload = () => setHiRes(img.src)
    img.src = png(card.image)
    return () => {
      img.onload = null
    }
  }, [card.image])

  const rules = card.text_de || card.oracle_text
  return (
    <dialog ref={ref} className="detail" aria-labelledby="card-detail-title" onClose={onClose}>
      {card.image && <img src={hiRes ?? card.image} alt={title} />}
      <h2 id="card-detail-title">{title}</h2>
      {card.name_de && card.name_de !== card.name && <p className="muted">{card.name}</p>}
      <p>{card.type_de || card.type_line}</p>
      {rules && <p className="rules">{rules}</p>}
      <p className="muted">
        {card.set_code.toUpperCase()} #{card.number}
        {card.rarity && ` · ${RARITY[card.rarity] ?? card.rarity}`} · {euro(card.price_eur)}
        {note && <> · {note}</>}
      </p>
      {children}
      <p>
        <a href={cardmarket(card.name)} target="_blank" rel="noopener">
          Bei Cardmarket suchen
        </a>
      </p>
      <div className="actions">
        {actions}
        <button className="primary" onClick={() => ref.current?.close()}>
          Schließen
        </button>
      </div>
    </dialog>
  )
}
