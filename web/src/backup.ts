import { fetchAll } from './supabase'

/* A copy of everything the database holds for you, as one JSON file. The
   scanned copies are the part nobody can get back from Scryfall. */
const TABLES: [string, string][] = [
  ['sets', 'code'],
  ['cards', 'id'],
  ['copies', 'print_id'],
  ['card_tags', 'card_id'],
  ['private_cards', 'print_id'],
  ['decks', 'id'],
  ['deck_cards', 'deck_id'],
  ['card_events', 'id'],
]

export async function downloadBackup(progress: (text: string) => void) {
  const data: Record<string, unknown[]> = {}
  for (const [table, order] of TABLES) {
    progress(`Backup … ${table}`)
    data[table] = await fetchAll(table, order)
  }
  const file = {
    taken_at: new Date().toISOString(),
    counts: Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length])),
    ...data,
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `cube-vault-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
  progress(
    `Backup geladen: ${data.copies.length} Kopien-Zeilen, ${data.private_cards.length} eigene Karten.`,
  )
}
