import type { Card } from './supabase'

/* A search language in the style of Scryfall, for the data this cube holds.

   Examples:
     kreatur c:r mv<=2        red creatures that cost two or less
     o:"opfere" -t:land       rules text has "opfere", not a land
     (c:u or c:b) r>=rare     blue or black, rare or better
     is:missing s:blb         cards of Bloomburrow you don't own yet

   Fields: name, t/type, o/oracle/text, c/color, id/identity, mv/cmc, r/rarity,
   s/set/e, kw/keyword, copies, eur/price, is:…
   Words without a field search name, type and rules text. "-" negates, "or"
   joins, brackets group, quotes keep a phrase together. */

export type CardInfo = { card: Card; copies: number }
export type Predicate = (info: CardInfo) => boolean

const COLOR_LETTERS = 'wubrg'
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'mythic']
const RARITY_NAMES: Record<string, string> = {
  c: 'common',
  u: 'uncommon',
  r: 'rare',
  m: 'mythic',
  gewöhnlich: 'common',
  ungewöhnlich: 'uncommon',
  selten: 'rare',
  mythisch: 'mythic',
}
const TYPE_WORDS: Record<string, RegExp> = {
  land: /Land/i,
  creature: /Kreatur|Creature/i,
  kreatur: /Kreatur|Creature/i,
  instant: /Spontanzauber|Instant/i,
  spontanzauber: /Spontanzauber|Instant/i,
  sorcery: /Hexerei|Sorcery/i,
  hexerei: /Hexerei|Sorcery/i,
  enchantment: /Verzauberung|Enchantment/i,
  verzauberung: /Verzauberung|Enchantment/i,
  artifact: /Artefakt|Artifact/i,
  artefakt: /Artefakt|Artifact/i,
  planeswalker: /Planeswalker/i,
}

const text = (card: Card) =>
  [card.name, card.name_de, card.type_line, card.type_de, card.oracle_text, card.text_de, card.set_code]
    .join(' ')
    .toLowerCase()
const typeLine = (card: Card) => `${card.type_line} ${card.type_de ?? ''}`
const rulesText = (card: Card) => `${card.oracle_text} ${card.text_de ?? ''}`.toLowerCase()

/** "3", ">=2", "<4": the operator comes from the term, the value from the text. */
function compare(value: number, operator: string, wanted: number) {
  switch (operator) {
    case '>':
      return value > wanted
    case '>=':
      return value >= wanted
    case '<':
      return value < wanted
    case '<=':
      return value <= wanted
    case '!=':
      return value !== wanted
    default:
      return value === wanted
  }
}

function colorTest(letters: string, operator: string): (have: string) => boolean {
  const wanted = new Set(
    letters
      .toLowerCase()
      .split('')
      .filter((letter) => COLOR_LETTERS.includes(letter)),
  )
  const colorless = /^(c|farblos|colorless)$/i.test(letters)
  return (have: string) => {
    const mine = new Set(have.toLowerCase().split('').filter(Boolean))
    if (colorless) return operator === '!=' ? mine.size > 0 : mine.size === 0
    const covers = [...wanted].every((letter) => mine.has(letter))
    const inside = [...mine].every((letter) => wanted.has(letter))
    switch (operator) {
      case '=':
        return covers && inside
      case '<=':
        return inside
      case '<':
        return inside && mine.size < wanted.size
      case '>':
        return covers && mine.size > wanted.size
      case '!=':
        return !(covers && inside)
      default: // ":" and ">=" mean "has at least these colours"
        return covers
    }
  }
}

function isTest(word: string): Predicate {
  const value = word.toLowerCase()
  if (value in TYPE_WORDS) return ({ card }) => TYPE_WORDS[value].test(typeLine(card))
  switch (value) {
    case 'owned':
    case 'vorhanden':
      return ({ copies }) => copies > 0
    case 'missing':
    case 'fehlend':
      return ({ copies }) => copies === 0
    case 'excluded':
    case 'ausgeschlossen':
      return ({ card }) => card.excluded
    case 'multicolor':
    case 'gold':
      return ({ card }) => card.colors.length > 1
    case 'colorless':
    case 'farblos':
      return ({ card }) => card.colors.length === 0
    case 'german':
    case 'deutsch':
      return ({ card }) => Boolean(card.name_de)
    default:
      return () => false
  }
}

function term(field: string, operator: string, value: string): Predicate {
  const wanted = value.toLowerCase()
  const number = parseFloat(value.replace(',', '.'))
  switch (field) {
    case 'name':
      return ({ card }) => `${card.name} ${card.name_de ?? ''}`.toLowerCase().includes(wanted)
    case 't':
    case 'type':
    case 'typ':
      return ({ card }) => typeLine(card).toLowerCase().includes(wanted)
    case 'o':
    case 'oracle':
    case 'text':
      return ({ card }) => rulesText(card).includes(wanted)
    case 'c':
    case 'color':
    case 'farbe': {
      const test = colorTest(value, operator)
      return ({ card }) => test(card.colors)
    }
    case 'id':
    case 'identity': {
      const test = colorTest(value, operator)
      return ({ card }) => test(card.color_identity)
    }
    case 'mv':
    case 'cmc':
    case 'manawert':
      return ({ card }) => compare(card.cmc, operator, number)
    case 'r':
    case 'rarity':
    case 'seltenheit': {
      const name = RARITY_NAMES[wanted] ?? wanted
      const rank = RARITY_ORDER.indexOf(name)
      return ({ card }) =>
        rank < 0
          ? card.rarity === name
          : compare(RARITY_ORDER.indexOf(card.rarity), operator, rank)
    }
    case 's':
    case 'set':
    case 'e':
      return ({ card }) => card.set_code.toLowerCase() === wanted
    case 'kw':
    case 'keyword':
      return ({ card }) => card.keywords.some((key) => key.toLowerCase().includes(wanted))
    case 'copies':
    case 'kopien':
      return ({ copies }) => compare(copies, operator, number)
    case 'eur':
    case 'price':
    case 'preis':
      return ({ card }) => compare(card.price_eur ?? 0, operator, number)
    case 'is':
      return isTest(value)
    default: // unknown field: treat the whole thing as plain words
      return ({ card }) => text(card).includes(`${field}${operator}${wanted}`)
  }
}

type Token = { kind: 'word' | 'or' | '(' | ')'; value?: string; negated?: boolean }

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  const pattern = /\s*(-?)(\(|\)|(?:[\w:!<>=äöüß]+)?(?:"[^"]*"|[^\s()"]+)*)/gy
  let match: RegExpExecArray | null
  pattern.lastIndex = 0
  while ((match = pattern.exec(input))) {
    const [, minus, raw] = match
    if (!raw) break
    if (raw === '(' || raw === ')') tokens.push({ kind: raw, negated: minus === '-' })
    else if (/^or$/i.test(raw)) tokens.push({ kind: 'or' })
    else if (/^and$/i.test(raw)) continue
    else tokens.push({ kind: 'word', value: raw, negated: minus === '-' })
  }
  return tokens
}

function parseTerm(raw: string): Predicate {
  const match = raw.match(/^([\wäöüß]+)(>=|<=|!=|[:=<>])(.*)$/)
  if (!match) {
    const words = raw.replace(/"/g, '').toLowerCase()
    return ({ card }) => text(card).includes(words)
  }
  const [, field, operator, rest] = match
  return term(field.toLowerCase(), operator, rest.replace(/"/g, ''))
}

/** Turns the search text into a test. An empty search lets everything through. */
export function parseQuery(input: string): Predicate {
  const tokens = tokenize(input.trim())
  let at = 0

  function parseOr(): Predicate {
    const parts = [parseAnd()]
    while (tokens[at]?.kind === 'or') {
      at++
      parts.push(parseAnd())
    }
    return (info) => parts.some((part) => part(info))
  }

  function parseAnd(): Predicate {
    const parts: Predicate[] = []
    while (at < tokens.length && tokens[at].kind !== 'or' && tokens[at].kind !== ')') {
      parts.push(parseSingle())
    }
    if (!parts.length) return () => true
    return (info) => parts.every((part) => part(info))
  }

  function parseSingle(): Predicate {
    const token = tokens[at++]
    if (token.kind === '(') {
      const inner = parseOr()
      if (tokens[at]?.kind === ')') at++
      return token.negated ? (info) => !inner(info) : inner
    }
    const test = parseTerm(token.value ?? '')
    return token.negated ? (info) => !test(info) : test
  }

  const test = parseOr()
  return test
}
