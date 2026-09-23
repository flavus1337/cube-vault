import { createContext, useContext } from 'react'

/* What a page can say to the person in front of it: a short line at the
   bottom, a yes-or-no question, or a question with one line of text. The
   provider lives in Notices.tsx. */

export type Notices = {
  /** A short line at the bottom of the page, gone after a few seconds. */
  say: (text: string, kind?: 'info' | 'error') => void
  /** Yes or no. Resolves to false when the person closes the dialog. */
  confirm: (text: string, label?: string) => Promise<boolean>
  /** One line of text, or null when the person closes the dialog. */
  ask: (text: string, label?: string) => Promise<string | null>
}

export const Context = createContext<Notices | null>(null)

export function useNotices() {
  const notices = useContext(Context)
  if (!notices) throw new Error('NoticeProvider fehlt')
  return notices
}
