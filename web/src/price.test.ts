import assert from 'node:assert/strict'
import { test } from 'node:test'
import { priceFor } from './price.ts'

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
