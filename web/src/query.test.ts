import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseQuery, type CardInfo } from './query.ts'
import type { Card } from './supabase.ts'

function card(fields: Partial<Card>, copies = 1, tags: string[] = []): CardInfo {
  return {
    copies,
    tags,
    card: {
      id: 'x', oracle_id: 'o', set_code: 'blb', number: '1', name: 'Test Card', name_de: null,
      type_line: 'Creature — Otter', type_de: 'Kreatur — Otter', oracle_text: '', text_de: null,
      mana_cost: '{1}{U}', cmc: 2, colors: 'U', color_identity: 'U', keywords: [], rarity: 'rare',
      layout: 'normal', image: null, image_en: null, price_eur: 1, excluded: false,
      legalities: null, exclude_reason: null, ...fields,
    } as Card,
  }
}

const hit = (query: string, info: CardInfo) => parseQuery(query).test(info)

test('plain words look at name, type and rules text', () => {
  const otter = card({ name_de: 'Sturmspalterin', text_de: 'Verursacht Trampelschaden' })
  assert.ok(hit('sturmspalterin', otter))
  assert.ok(hit('kreatur', otter))
  assert.ok(hit('trampelschaden', otter))
  assert.ok(!hit('drache', otter))
})

test('field terms with operators', () => {
  const bolt = card({ cmc: 1, colors: 'R', color_identity: 'R', rarity: 'common', price_eur: 3.5 })
  assert.ok(hit('c:r mv<=1', bolt))
  assert.ok(!hit('c:r mv>1', bolt))
  assert.ok(hit('r:common', bolt))
  assert.ok(hit('r>=common', bolt))
  assert.ok(!hit('r>=rare', bolt))
  assert.ok(hit('eur>3', bolt))
  assert.ok(hit('s:blb', bolt))
  assert.ok(!hit('s:tdm', bolt))
})

test('colours: at least, exactly, at most', () => {
  const gold = card({ colors: 'UR', color_identity: 'UR' })
  assert.ok(hit('c:u', gold))
  assert.ok(hit('c:ur', gold))
  assert.ok(!hit('c=u', gold))
  assert.ok(hit('c=ur', gold))
  assert.ok(hit('c<=urg', gold))
  assert.ok(!hit('c:b', gold))
  assert.ok(hit('c:c', card({ colors: '' })))
  assert.ok(!hit('c:c', gold))
})

test('negation, or, brackets', () => {
  const land = card({ type_line: 'Land', type_de: 'Land', colors: '', cmc: 0 })
  assert.ok(hit('-t:kreatur', land))
  assert.ok(!hit('-t:land', land))
  assert.ok(hit('t:land or t:kreatur', land))
  assert.ok(hit('(t:land or t:drache) mv<=0', land))
  assert.ok(!hit('-(t:land or t:drache)', land))
})

test('is: tests and copies', () => {
  const missing = card({ type_line: 'Land' }, 0)
  assert.ok(hit('is:missing', missing))
  assert.ok(!hit('is:owned', missing))
  assert.ok(hit('is:land', missing))
  assert.ok(hit('copies=0', missing))
  assert.ok(hit('is:excluded', card({ excluded: true })))
})

test('quotes keep a phrase together', () => {
  const card1 = card({ oracle_text: 'Sacrifice a creature: draw a card' })
  assert.ok(hit('o:"draw a card"', card1))
  assert.ok(!hit('o:"draw two cards"', card1))
})

test('keywords and an empty search', () => {
  const flyer = card({ keywords: ['Flying'] })
  assert.ok(hit('kw:flying', flyer))
  assert.ok(!hit('kw:trample', flyer))
  assert.ok(hit('', flyer))
  assert.ok(hit('   ', flyer))
})

test('unknown fields are reported', () => {
  assert.deepEqual(parseQuery('id:bg pow>=3 t:verzauberung').unknown, ['pow'])
  assert.deepEqual(parseQuery('c:r mv<=2').unknown, [])
})

test('formats come from the legalities', () => {
  const card1 = card({ legalities: { commander: 'legal', legacy: 'banned', vintage: 'restricted' } })
  assert.ok(hit('f:commander', card1))
  assert.ok(!hit('f:legacy', card1))
  assert.ok(hit('banned:legacy', card1))
  assert.ok(hit('restricted:vintage', card1))
  assert.deepEqual(parseQuery('id:bg f:commander t:verzauberung').unknown, [])
})

test('is:commander finds legends and the cards that say so', () => {
  const legend = card({ type_line: 'Legendary Creature — Elf', type_de: 'Legendäre Kreatur — Elf' })
  const plain = card({ type_line: 'Creature — Elf', type_de: 'Kreatur — Elf' })
  const partner = card({
    type_line: 'Planeswalker — Freyalise',
    type_de: 'Planeswalker — Freyalise',
    oracle_text: 'Freyalise can be your commander.',
  })
  assert.ok(hit('is:commander', legend))
  assert.ok(!hit('is:commander', plain))
  assert.ok(hit('is:commander', partner))
  assert.ok(hit('is:legendary', legend))
})

test('oracle tags come from the tag table', () => {
  const bolt = card({ name: 'Lightning Bolt' }, 1, ['removal', 'burn'])
  assert.ok(hit('otag:removal', bolt))
  assert.ok(hit('tag:burn', bolt))
  assert.ok(!hit('otag:ramp', bolt))
  assert.ok(hit('otag:removal or otag:ramp', bolt))
})
