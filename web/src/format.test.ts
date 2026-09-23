import assert from 'node:assert/strict'
import { test } from 'node:test'
import { euro, finishLabel, summary } from './format.ts'

test('money reads German and says nothing about an unknown price', () => {
  assert.match(euro(12.5), /12,50/)
  assert.equal(euro(null), '–')
})

test('the summary counts cards, copies and what they are worth', () => {
  assert.equal(
    summary({ cards: 3, copies: 5, value: 12.5 }),
    `3 Karten · 5 Kopien · ${euro(12.5)}`,
  )
})

test('missing cards are added only when some are missing', () => {
  const owned = { cards: 3, copies: 5, value: 12.5 }
  assert.ok(summary(owned, { cards: 2, value: 4 }).includes('2 fehlen'))
  assert.ok(!summary(owned, { cards: 0, value: 0 }).includes('fehlen'))
})

test('a finish without a name reads as normal', () => {
  assert.equal(finishLabel('foil'), 'Foil')
  assert.equal(finishLabel(null), 'Normal')
})
