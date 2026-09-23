import assert from 'node:assert/strict'
import { test } from 'node:test'
import { colorGroupOf, isLand, RARITY, typeOf } from './mtg.ts'

test('a card is filed under the first type that matches', () => {
  assert.equal(typeOf('Artefaktkreatur — Golem'), 'Kreatur')
  assert.equal(typeOf('Legendäre Verzauberung'), 'Verzauberung')
  assert.equal(typeOf('Creature — Sliver'), 'Kreatur')
  assert.equal(typeOf('Kreatur — Otter', true), 'Kreaturen')
  assert.equal(typeOf('Spielstein'), 'Sonstiges')
})

test('lands are lands in both languages', () => {
  assert.ok(isLand('Standardland — Wald'))
  assert.ok(isLand('Basic Land — Forest'))
  assert.ok(!isLand('Kreatur — Elf'))
})

test('colours group into one, several, none or land', () => {
  assert.equal(colorGroupOf('U', 'Kreatur — Otter'), 'U')
  assert.equal(colorGroupOf('WU', 'Kreatur — Vogel'), 'M')
  assert.equal(colorGroupOf('', 'Artefakt'), 'C')
  assert.equal(colorGroupOf('G', 'Land — Wald'), 'L')
})

test('rarities read in German', () => {
  assert.equal(RARITY.mythic, 'Mythisch selten')
})
