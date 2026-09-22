import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cardmarket, euro, FINISHES, finishLabel, png, RARITY } from './format'
import { versionLabel, versionPrice, versionsOf, type Version } from './versions'

/* What the detail view needs. Own cards keep fewer fields than cube cards,
   so everything but the printing is optional. */
export type DetailCard = {
  oracle_id?: string
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
  /** Scryfall ids of the printings you own, marked in the version list. */
  ownedPrints?: string[]
  /** What the mark says, e.g. "im Cube" or "bei dir". */
  ownedLabel?: string
  /** Lets an editor put a printing from the list into the cube. */
  onAddVersion?: (version: Version, finish: string) => Promise<void>
  onClose: () => void
}) {
  const { card, note, children, actions, ownedPrints, ownedLabel, onAddVersion, onClose } = props
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
      <Versions
        card={card}
        owned={ownedPrints ?? []}
        ownedLabel={ownedLabel ?? 'im Cube'}
        onAdd={onAddVersion}
      />
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

/* Every printing Scryfall knows, fetched when you open the list. */
function Versions(props: {
  card: DetailCard
  owned: string[]
  ownedLabel: string
  onAdd?: (version: Version, finish: string) => Promise<void>
}) {
  const { card, owned, ownedLabel, onAdd } = props
  /* A German print has its own Scryfall id, so set and number count too. */
  const have = (version: Version) =>
    owned.includes(version.id) || owned.includes(`${version.set}/${version.number}`)
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<Version[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    if (!open || list || !card.oracle_id) return
    versionsOf(card.oracle_id)
      .then(setList)
      .catch((e) => setError((e as Error).message))
  }, [open, list, card.oracle_id])

  if (!card.oracle_id) return null
  return (
    <div className="versions">
      <button className="link-button" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Versionen ausblenden' : 'Andere Versionen zeigen'}
      </button>
      {open && error && <p className="warn">Versionen laden fehlgeschlagen: {error}</p>}
      {open && !list && !error && <p className="muted">Lädt …</p>}
      {open && list && (
        <ul className="version-list">
          {list.map((version) => (
            <li key={version.id} className={have(version) ? 'have' : ''}>
              {version.image && <img src={version.image} alt="" loading="lazy" />}
              <span className="version-text">
                <strong>
                  {version.set.toUpperCase()} #{version.number}
                </strong>
                <span className="muted">
                  {[version.set_name, versionLabel(version), versionPrice(version)]
                    .filter(Boolean)
                    .join(' · ')}
                  {have(version) && ` · ${ownedLabel}`}
                </span>
              </span>
              {onAdd && (
                <span className="version-add">
                  {version.finishes.map((finish) => (
                    <button
                      key={finish}
                      disabled={Boolean(busy)}
                      title={`Eine Kopie als ${finishLabel(finish)} eintragen`}
                      onClick={async () => {
                        setBusy(version.id + finish)
                        try {
                          await onAdd(version, finish)
                        } finally {
                          setBusy('')
                        }
                      }}
                    >
                      + {finishLabel(finish)}
                    </button>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* The copies of one card, one row per printing and finish, so a foil can be
   counted next to the normal cards instead of turning the whole stack foil. */
export function CopyRows(props: {
  rows: { print_id: string; finish: string; lang?: string; qty: number; label?: string }[]
  onChange: (print_id: string, finish: string, delta: number) => Promise<void>
  /** Adds a finish that is not in the list yet, on the card's main printing. */
  onAdd?: (finish: string) => Promise<void>
}) {
  const { rows, onChange, onAdd } = props
  const [busy, setBusy] = useState(false)

  async function run(work: () => Promise<void>) {
    setBusy(true)
    try {
      await work()
    } finally {
      setBusy(false)
    }
  }

  const missing = FINISHES.filter(([key]) => !rows.some((row) => row.finish === key))
  return (
    <div className="copy-rows">
      {rows.map((row) => (
        <div key={`${row.print_id}-${row.finish}`} className="copy-row">
          <span>
            {finishLabel(row.finish)}
            {row.label && <span className="muted"> · {row.label}</span>}
          </span>
          <span className="copies">
            <button
              disabled={busy}
              aria-label={`Eine Kopie ${finishLabel(row.finish)} weniger`}
              onClick={() => run(() => onChange(row.print_id, row.finish, -1))}
            >
              −
            </button>
            <strong>{row.qty}</strong>
            <button
              disabled={busy}
              aria-label={`Eine Kopie ${finishLabel(row.finish)} mehr`}
              onClick={() => run(() => onChange(row.print_id, row.finish, 1))}
            >
              +
            </button>
          </span>
        </div>
      ))}
      {onAdd && missing.length > 0 && (
        <div className="copy-add">
          {missing.map(([key, label]) => (
            <button key={key} disabled={busy} onClick={() => run(() => onAdd(key))}>
              + {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
