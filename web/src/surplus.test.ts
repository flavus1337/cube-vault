import assert from 'node:assert/strict'
import { test } from 'node:test'

/* What the extra copies of a card are worth: you keep the cheapest one and
   could trade the rest. The page does this over the stacks of a card. */
function extraValue(stacks: { qty: number; price: number }[], cardPrice = 0) {
  const sorted = [...stacks].sort((a, b) => (a.price || cardPrice) - (b.price || cardPrice))
  let keep = 1
  let value = 0
  for (const stack of sorted) {
    const spare = Math.max(0, stack.qty - keep)
    keep = Math.max(0, keep - stack.qty)
    value += spare * (stack.price || cardPrice)
  }
  return value
}

test('a single copy leaves nothing over', () => {
  assert.equal(extraValue([{ qty: 1, price: 5 }]), 0)
})

test('three of the same stack leave two', () => {
  assert.equal(extraValue([{ qty: 3, price: 2 }]), 4)
})

test('the cheapest copy stays, the foil counts as surplus', () => {
  assert.equal(extraValue([{ qty: 1, price: 100 }, { qty: 1, price: 0.5 }]), 100)
})

test('several stacks: one copy stays, the rest add up', () => {
  assert.equal(extraValue([{ qty: 2, price: 1 }, { qty: 1, price: 10 }]), 11)
})
