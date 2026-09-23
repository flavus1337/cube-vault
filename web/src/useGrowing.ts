import { useCallback, useRef, useState } from 'react'

/* A grid of a few thousand cards makes the phone crawl. This hands out the
   first cards and grows the list as the end of the grid comes into view. */
export function useGrowing<T>(list: T[], step = 120) {
  const [shown, setShown] = useState(step)
  const [seen, setSeen] = useState(list.length)

  /* A new filter means a new list: start at the top again. The length says
     that, not the array itself: a page that builds its list on every render
     would hand over a new array every time and never stop re-rendering. */
  if (seen !== list.length) {
    setSeen(list.length)
    setShown(step)
  }

  const observer = useRef<IntersectionObserver | null>(null)
  const sentinel = useCallback(
    (node: HTMLDivElement | null) => {
      observer.current?.disconnect()
      if (!node) return
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) setShown((n) => n + step)
      })
      observer.current.observe(node)
    },
    [step],
  )

  return { visible: list.slice(0, shown), more: Math.max(0, list.length - shown), sentinel }
}
