import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pipsOf, suggestLands } from './mana.ts'

test('coloured symbols count per colour, a card with two of them twice', () => {
  const pips = pipsOf([
    { mana_cost: '{1}{R}{R}', qty: 1 },
    { mana_cost: '{G}', qty: 2 },
    { mana_cost: '{3}', qty: 5 },
  ])
  assert.equal(pips.R, 2)
  assert.equal(pips.G, 2)
  assert.equal(pips.W, 0)
})

test('a hybrid symbol counts for both of its colours', () => {
  const pips = pipsOf([{ mana_cost: '{W/U}', qty: 1 }])
  assert.equal(pips.W, 1)
  assert.equal(pips.U, 1)
})

test('23 spells want 17 lands, split along the colours', () => {
  const lands = suggestLands(23, { W: 0, U: 10, B: 0, R: 10, G: 0 })
  assert.equal(
    lands.reduce((sum, share) => sum + share.count, 0),
    17,
  )
  assert.deepEqual(lands.map((share) => share.colour).sort(), ['R', 'U'])
})

test('rounding hands the leftover land to the colour that lost the most', () => {
  const lands = suggestLands(23, { W: 0, U: 7, B: 0, R: 2, G: 0 })
  assert.equal(
    lands.reduce((sum, share) => sum + share.count, 0),
    17,
  )
  assert.ok(lands.find((share) => share.colour === 'U')!.count > lands.find((share) => share.colour === 'R')!.count)
})

test('a deck without coloured symbols gets no suggestion', () => {
  assert.deepEqual(suggestLands(23, { W: 0, U: 0, B: 0, R: 0, G: 0 }), [])
})

test('an empty deck gets no suggestion', () => {
  assert.deepEqual(suggestLands(0, { W: 0, U: 4, B: 0, R: 0, G: 0 }), [])
})
