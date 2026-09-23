import { useState } from 'react'

/* The first visit needs three sentences: where the cards come from, what this
   page is, what the search can do. After that it only gets in the way, so it
   stays closed once you send it away. */
const KEY = 'cube-intro-v1'

const read = () => {
  try {
    return localStorage.getItem(KEY) === 'done'
  } catch {
    return false
  }
}

/** Search examples to press, so the query language is not a secret. */
const EXAMPLES: [string, string][] = [
  ['c:r', 'rot'],
  ['t:kreatur mv<=2', 'kleine Kreaturen'],
  ['is:missing', 'fehlt euch'],
  ['eur>5', 'teuer'],
  ['otag:removal', 'Entfernung'],
]

export default function FirstVisit({
  apkUrl,
  onExample,
}: {
  apkUrl: string
  onExample: (query: string) => void
}) {
  const [done, setDone] = useState(read)
  if (done) return null

  function dismiss() {
    setDone(true)
    try {
      localStorage.setItem(KEY, 'done')
    } catch {
      // Without storage it comes back next time; nothing breaks.
    }
  }

  return (
    <aside className="intro-card">
      <button className="dialog-close" aria-label="Hinweis ausblenden" onClick={dismiss}>
        ×
      </button>
      <h2>Willkommen im Cube</h2>
      <ol>
        <li>
          <a href={apkUrl} target="_blank" rel="noopener">
            App laden
          </a>{' '}
          und mit Discord anmelden.
        </li>
        <li>Karten scannen — in den Cube für alle oder in deine eigenen Karten.</li>
        <li>Hier suchen, filtern, Decks bauen.</li>
      </ol>
      <p className="muted">
        Der Cube sind die Karten, aus denen ihr draftet. Die Suche versteht mehr, als sie zeigt:
      </p>
      <p className="examples">
        {EXAMPLES.map(([query, label]) => (
          <button key={query} className="example" onClick={() => onExample(query)}>
            <code>{query}</code> {label}
          </button>
        ))}
      </p>
    </aside>
  )
}
