import test from 'node:test'
import assert from 'node:assert/strict'

import { createDebouncedTrigger } from '../src/debounce.js'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('the first trigger fires immediately', () => {
  const fired = []
  const trigger = createDebouncedTrigger((reason) => fired.push(reason), 50)
  trigger.trigger('a')
  assert.deepEqual(fired, ['a'])
  trigger.dispose()
})

test('a burst collapses into one trailing trigger', async () => {
  const fired = []
  const trigger = createDebouncedTrigger((reason) => fired.push(reason), 40)
  trigger.trigger('first')
  trigger.trigger('second')
  trigger.trigger('third')
  assert.deepEqual(fired, ['first'])
  await wait(80)
  assert.deepEqual(fired, ['first', 'third'])
  trigger.dispose()
})

test('dispose cancels a pending trailing trigger', async () => {
  const fired = []
  const trigger = createDebouncedTrigger((reason) => fired.push(reason), 40)
  trigger.trigger('first')
  trigger.trigger('pending')
  trigger.dispose()
  await wait(80)
  assert.deepEqual(fired, ['first'])
})

test('a zero window never coalesces', () => {
  const fired = []
  const trigger = createDebouncedTrigger((reason) => fired.push(reason), 0)
  trigger.trigger('a')
  trigger.trigger('b')
  assert.deepEqual(fired, ['a', 'b'])
  trigger.dispose()
})
