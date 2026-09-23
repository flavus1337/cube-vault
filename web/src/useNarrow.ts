import { useEffect, useState } from 'react'

/** True while the window is as narrow as a phone. */
export function useNarrow(query = '(max-width: 860px)') {
  const [narrow, setNarrow] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const media = matchMedia(query)
    const onChange = () => setNarrow(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])
  return narrow
}
