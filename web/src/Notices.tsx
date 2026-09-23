import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Context, type Notices } from './notices'

/* The pages used to call alert(), confirm() and prompt(). Those block the
   browser, ignore the colours of the page and look like a lost 2005 website
   on a phone. This replaces them with a strip at the bottom and a dialog. */

type Ask = { text: string; label: string; danger: boolean; value: string | null }

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [note, setNote] = useState<{ text: string; kind: string } | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  const answer = useRef<(value: string | null) => void>(() => {})
  const timer = useRef<number>(0)

  const say = useCallback((text: string, kind: 'info' | 'error' = 'info') => {
    setNote({ text, kind })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setNote(null), kind === 'error' ? 8000 : 4000)
  }, [])

  const open = useCallback((next: Ask) => {
    setAsk(next)
    return new Promise<string | null>((resolve) => {
      answer.current = (value) => {
        setAsk(null)
        resolve(value)
      }
    })
  }, [])

  const notices: Notices = {
    say,
    confirm: (text, label = 'Löschen') =>
      open({ text, label, danger: true, value: null }).then((value) => value !== null),
    ask: (text, label = 'Speichern') => open({ text, label, danger: false, value: '' }),
  }

  return (
    <Context.Provider value={notices}>
      {children}
      {ask && (
        <div className="ask-backdrop" role="presentation" onClick={() => answer.current(null)}>
          <div
            className="ask"
            role="dialog"
            aria-modal="true"
            aria-label={ask.text}
            onClick={(e) => e.stopPropagation()}
          >
            <p>{ask.text}</p>
            {ask.value !== null && (
              <input
                autoFocus
                aria-label={ask.text}
                defaultValue={ask.value}
                onChange={(e) => setAsk({ ...ask, value: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && answer.current(ask.value ?? '')}
              />
            )}
            <div className="actions">
              <button onClick={() => answer.current(null)}>Abbrechen</button>
              <button
                className="primary"
                autoFocus={ask.value === null}
                onClick={() => answer.current(ask.value ?? '')}
              >
                {ask.label}
              </button>
            </div>
          </div>
        </div>
      )}
      {note && (
        <p className={`note note-${note.kind}`} role="status">
          {note.text}
          <button className="link-button" aria-label="Hinweis schließen" onClick={() => setNote(null)}>
            ✕
          </button>
        </p>
      )}
    </Context.Provider>
  )
}
