/* What the filter dialog carries while it is open: the draft of every choice,
   and what an empty draft looks like. */

export type AdvancedFilters = {
  colors: Set<string>
  setCodes: string[]
  keywordList: string[]
  cardTypes: string[]
  cmcs: string[]
  rarities: string[]
  sort: string
  showExcluded: boolean
  exactColors: boolean
}

export type AppliedFilterKey = 'colors' | 'set' | 'keyword' | 'type' | 'cmc' | 'rarity' | 'excluded'

export const EMPTY_ADVANCED: Omit<AdvancedFilters, 'colors'> = {
  setCodes: [],
  keywordList: [],
  cardTypes: [],
  cmcs: [],
  rarities: [],
  sort: 'name',
  showExcluded: false,
  exactColors: false,
}

export const SORTS: Record<string, string> = {
  name: 'Name',
  cmc: 'Manawert',
  price: 'Preis',
  number: 'Set-Nummer',
}

