/* A grid of empty cards while the real ones are on their way. The page keeps
   its shape, so nothing jumps once the cards arrive. */
export function CardSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="tile skeleton" />
      ))}
    </div>
  )
}

/** Empty rows for a table that is still loading. */
export function RowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="row-skeletons" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  )
}
