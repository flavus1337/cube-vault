import assert from 'node:assert/strict'
import { test } from 'node:test'

/* The hook resets when the number of cards changes, not when the array is a
   new one: a page that filters on every render hands over a new array every
   time, and comparing those would never stop re-rendering. */
const resets = (seen: number, list: unknown[]) => seen !== list.length

test('the same cards in a new array do not reset the list', () => {
  const cards = [1, 2, 3]
  assert.equal(resets(cards.length, [...cards]), false)
})

test('a filter that changes the count resets the list', () => {
  assert.equal(resets(3, [1, 2]), true)
})
