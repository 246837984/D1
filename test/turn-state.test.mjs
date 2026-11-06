import test from 'node:test'
import assert from 'node:assert/strict'

import { createTurnTracker, parseTurnState } from '../src/turn-state.js'

const snapshot = (open, last = 3) =>
  `{"record":{"rows":{"turnBoundary":{"val":{"openTurnStartSeq":${open},"lastTurn":${last}}}}}}`

test('parseTurnState sees a running turn', () => {
  assert.equal(parseTurnState(snapshot(7)), true)
  assert.equal(parseTurnState(snapshot(0)), true)
})

test('parseTurnState sees a finished turn', () => {
  assert.equal(parseTurnState(snapshot('null')), false)
})

test('parseTurnState calls a never-used session idle', () => {
  assert.equal(parseTurnState(snapshot('null', 0)), 'idle')
})

test('parseTurnState rejects unrelated payloads', () => {
  assert.equal(parseTurnState('{"a":1}'), null)
  assert.equal(parseTurnState(''), null)
  assert.equal(parseTurnState(undefined), null)
  assert.equal(parseTurnState('{"openTurnStartSeq":null}'), null)
})

test('tracker fires only on the running -> finished edge', () => {
  const tracker = createTurnTracker()
  assert.equal(tracker.observe(snapshot(4)), false)
  assert.equal(tracker.observe(snapshot('null')), true)
  assert.equal(tracker.observe(snapshot('null')), false)
  assert.equal(tracker.state(), false)
})

test('tracker stays quiet when it starts after the turn ended', () => {
  const tracker = createTurnTracker()
  assert.equal(tracker.observe(snapshot('null')), false)
  assert.equal(tracker.state(), false)
})

test('tracker ignores idle and unreadable snapshots', () => {
  const tracker = createTurnTracker()
  assert.equal(tracker.observe(snapshot('null', 0)), false)
  assert.equal(tracker.observe('{}'), false)
  assert.equal(tracker.state(), null)
})
