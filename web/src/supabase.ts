import { createClient } from '@supabase/supabase-js'

// Same public values as lib/config.dart. The database only answers approved logins.
const SUPABASE_URL = 'https://uoskervlqeexiepcnynj.supabase.co'
const SUPABASE_KEY = 'sb_publishable_0Sr1Qjue1dzwbSAr-TH5sQ_dZxtFcAM'

// PKCE returns "?code=…" instead of tokens in the hash, which the hash routes use.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { flowType: 'pkce' } })

export type Role = 'waiting' | 'player' | 'editor' | 'admin'

export type Profile = {
  id: string
  name: string
  avatar_url: string | null
  discord_id: string | null
  role: Role
  created_at: string
}

export type CubeSet = {
  code: string
  name: string
  released_at: string | null
  icon_svg_uri: string | null
  in_cube: boolean
  // Bonus sheets and commander decks belong to a main set, e.g. blc to blb.
  parent_code: string | null
  added_by: string | null
  added_at: string
}

export type Card = {
  id: string
  oracle_id: string
  set_code: string
  number: string
  name: string
  name_de: string | null
  type_line: string
  type_de: string | null
  oracle_text: string
  text_de: string | null
  mana_cost: string
  cmc: number
  colors: string
  color_identity: string
  keywords: string[]
  rarity: string
  layout: string | null
  image: string | null
  image_en: string | null
  price_eur: number | null
  // Scryfall's legalities: {"commander": "legal", "legacy": "banned", …}
  legalities: Record<string, string> | null
  excluded: boolean
  exclude_reason: string | null
}

/** One stack of the same print in the same finish: 'nonfoil', 'foil' or 'etched'. */
export type Copy = {
  print_id: string
  card_id: string
  lang: string
  qty: number
  finish: string
  /** What this printing in this finish costs; null falls back to the card. */
  price_eur: number | null
  /** Which printing this copy is, e.g. "psdc" "1★"; null for older rows. */
  set_code: string | null
  number: string | null
}

export type CardEvent = {
  id: number
  at: string
  user_id: string | null
  action: string
  set_code: string | null
  card_id: string | null
  player_id: string | null
  delta: number | null
  note: string | null
}

/** Reads a whole table. PostgREST returns at most 1000 rows per request. */
export async function fetchAll<T>(table: string, orderBy: string, columns = '*'): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy)
      .range(from, from + 999)
    if (error) throw error
    rows.push(...(data as T[]))
    if (data.length < 1000) return rows
  }
}

export const canEdit = (role: Role) => role === 'editor' || role === 'admin'

export type PrivateCard = {
  print_id: string
  oracle_id: string
  set_code: string
  set_name: string | null
  number: string
  name: string
  name_de: string | null
  type_line: string
  type_de: string | null
  mana_cost: string
  cmc: number
  colors: string
  rarity: string | null
  image: string | null
  price_eur: number | null
  lang: string
  finish: string
  qty: number
  added_at: string
}
