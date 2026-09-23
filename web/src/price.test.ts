import assert from 'node:assert/strict'
import { test } from 'node:test'
import { byPrice, priceFor, withinBudget } from './price.ts'

const german = { price_eur: null, price_eur_foil: null }
const english = { price_eur: 0.05, price_eur_foil: 0.07 }

test('a printing with its own price keeps it', () => {
  assert.equal(priceFor('nonfoil', english, { price_eur: 99, price_eur_foil: 99 }), 0.05)
})

test('a German printing takes the English price', () => {
  assert.equal(priceFor('nonfoil', german, english), 0.05)
})

test('a German foil takes the English foil price, not the plain one', () => {
  assert.equal(priceFor('foil', german, english), 0.07)
})

test('etched is priced like a foil until Scryfall says otherwise', () => {
  assert.equal(priceFor('etched', german, english), 0.07)
})

test('without any price the copy stays open', () => {
  assert.equal(priceFor('foil', german, german), null)
})

test('a budget takes the cheapest cards until the money is gone', () => {
  const cards = [{ price_eur: 5 }, { price_eur: 0.5 }, { price_eur: 2 }, { price_eur: 1 }]
  assert.deepEqual(
    withinBudget([...cards].sort(byPrice), 4).map((c) => c.price_eur),
    [0.5, 1, 2],
  )
})

test('no budget leaves the list alone', () => {
  const cards = [{ price_eur: 5 }, { price_eur: 1 }]
  assert.equal(withinBudget(cards, 0).length, 2)
})

test('a card without a price is left out of a budget', () => {
  const cards = [{ price_eur: null }, { price_eur: 0.5 }]
  assert.deepEqual(
    withinBudget([...cards].sort(byPrice), 1).map((c) => c.price_eur),
    [0.5],
  )
})

test('without a price a card sorts to the end, not to the front', () => {
  const cards = [{ price_eur: null }, { price_eur: 5 }, { price_eur: 1 }]
  assert.deepEqual(
    [...cards].sort(byPrice).map((c) => c.price_eur),
    [1, 5, null],
  )
})
