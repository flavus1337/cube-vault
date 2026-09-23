import CardDetail, { CopyRows } from './CardDetail'
import { euro } from './format'
import type { Card, Copy } from './supabase'

export default function CardDialog(props: {
  card: Card
  copies: number
  prints: Copy[]
  editable: boolean
  onChangeCopies: (
    delta: number,
    printId?: string,
    finish?: string,
    price?: number | null,
    printing?: { set: string; number: string },
  ) => Promise<void>
  onToggleExcluded: () => void
  onClose: () => void
}) {
  const { card, copies, prints, editable, onChangeCopies, onToggleExcluded, onClose } = props

  const rows = [...prints]
    .sort((a, b) => a.finish.localeCompare(b.finish) || a.lang.localeCompare(b.lang))
    .map((row) => ({
      print_id: row.print_id,
      finish: row.finish ?? 'nonfoil',
      qty: row.qty,
      /* Which printing this stack is. Without it a Comic-Con foil reads the
         same as a foil of the card's own printing. */
      label: [
        row.set_code ? `${row.set_code.toUpperCase()} #${row.number}` : null,
        row.lang.toUpperCase(),
      ]
        .filter(Boolean)
        .join(' · '),
      /* The card price is the plain one of the main printing, so it stands in
         only for plain copies. A foil keeps its own price or shows none. */
      price: row.price_eur ?? (row.finish === 'foil' || row.finish === 'etched' ? null : card.price_eur),
    }))

  // What the copies are worth together, each stack with its own price.
  const value = prints.reduce(
    (sum, row) => sum + row.qty * (row.price_eur ?? (row.finish === 'nonfoil' ? (card.price_eur ?? 0) : 0)),
    0,
  )

  return (
    <CardDetail
      card={card}
      noteLabel="Im Cube"
      note={copies ? `${copies} ${copies === 1 ? 'Kopie' : 'Kopien'} · ${euro(value)}` : 'keine Kopie'}
      onClose={onClose}
      ownedPrints={[
        ...prints.map((row) => row.print_id),
        ...(copies ? [`${card.set_code}/${card.number}`] : []),
      ]}
      onAddVersion={
        editable
          ? (version, finish) =>
              onChangeCopies(
                1,
                version.id,
                finish,
                finish === 'nonfoil' ? version.price_eur : version.price_eur_foil,
                { set: version.set, number: version.number },
              )
          : undefined
      }
      actions={
        editable ? (
          <button onClick={onToggleExcluded}>{card.excluded ? 'Wieder aufnehmen' : 'Ausschließen'}</button>
        ) : null
      }
    >
      {editable && (
        <CopyRows
          rows={rows.length ? rows : [{ print_id: card.id, finish: 'nonfoil', qty: 0 }]}
          onChange={(printId, finish, delta) => onChangeCopies(delta, printId, finish)}
          onAdd={(finish) => onChangeCopies(1, rows[0]?.print_id ?? card.id, finish)}
        />
      )}
      {card.excluded && (
        <p className="warn">Ausgeschlossen{card.exclude_reason ? `: ${card.exclude_reason}` : ''}</p>
      )}
    </CardDetail>
  )
}
