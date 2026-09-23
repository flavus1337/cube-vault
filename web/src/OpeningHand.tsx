import { isLand, name, type PoolCard } from './deck'

/* Ten cards off the top: the opening hand and what the first three turns
   would draw. Enough to see whether a deck has lands in it. */
export default function OpeningHand({
  cards,
  onClose,
}: {
  cards: PoolCard[]
  onClose: () => void
}) {
  return (
      <section className="hand">
        <h2>
          Starthand und drei Züge · {cards.filter(isLand).length} Länder unter {cards.length} Karten
          <button className="link-button" onClick={() => onClose()}>
            schließen
          </button>
        </h2>
        <h3>Starthand</h3>
        <div className="hand-cards">
          {cards.slice(0, 7).map((card, i) => (
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
          {cards.slice(7).map((card, i) => (
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
  )
}
