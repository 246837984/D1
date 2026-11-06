import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { apply, normalizeConfig } from '../src/index.js'

test('normalizeConfig fills defaults and coerces numbers', () => {
  const config = normalizeConfig({ debounceMs: '2500' })
  assert.equal(config.debounceMs, 2500)
  assert.equal(config.startupGraceMs, 10000)
  assert.equal(config.enabled, true)
  assert.equal(config.useEventBus, true)
  assert.equal(config.useCacheWatcher, true)
  assert.ok(config.cacheDir.endsWith(path.join('storages', 'session_projcache', 'sessions')))
})

test('normalizeConfig honours explicit opt-outs', () => {
  const config = normalizeConfig({ enabled: false, useEventBus: false, useCacheWatcher: false, logFile: null })
  assert.equal(config.enabled, false)
  assert.equal(config.useEventBus, false)
  assert.equal(config.useCacheWatcher, false)
  assert.equal(config.logFile, null)
})

test('a live turn/end notifies once; restored history is ignored', () => {
  const handlers = new Map()
  const ctx = { on: (name, fn) => handlers.set(name, fn) }
  const fired = []
  const notifier = { notify: (reason) => fired.push(reason), platform: 'test', backend: 'test' }

  apply(ctx, {
    debounceMs: 0,
    startupGraceMs: 0,
    useCacheWatcher: false,
    logFile: null,
    notifierFactory: () => notifier,
  })

  const onEvent = handlers.get('session/event')
  assert.equal(typeof onEvent, 'function')

  onEvent({ id: 's1' }, { type: 'assistant/message' })
  assert.deepEqual(fired, [])

  // A turn/end replayed from restored history, with no turn/start in this run.
  onEvent({ id: 's1' }, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  assert.deepEqual(fired, [])

  // A turn this run actually saw start.
  onEvent({ id: 's1' }, { type: 'turn/start' })
  onEvent({ id: 's1' }, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  assert.deepEqual(fired, ['turn-end:completed'])

  const dispose = handlers.get('dispose')
  if (dispose) dispose()
})

test('the startup grace window absorbs a turn that ends while the app boots', () => {
  const handlers = new Map()
  const ctx = { on: (name, fn) => handlers.set(name, fn) }
  const fired = []

  apply(ctx, {
    debounceMs: 0,
    startupGraceMs: 60000,
    useCacheWatcher: false,
    logFile: null,
    notifierFactory: () => ({ notify: (reason) => fired.push(reason), platform: 'test', backend: 'test' }),
  })

  const onEvent = handlers.get('session/event')
  onEvent({ id: 's1' }, { type: 'turn/start' })
  onEvent({ id: 's1' }, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  assert.deepEqual(fired, [])

  const dispose = handlers.get('dispose')
  if (dispose) dispose()
})

test('a disabled plugin registers nothing', () => {
  const handlers = new Map()
  const ctx = { on: (name, fn) => handlers.set(name, fn) }
  const fired = []

  apply(ctx, {
    enabled: false,
    logFile: null,
    notifierFactory: () => ({ notify: (reason) => fired.push(reason), platform: 'test', backend: 'test' }),
  })

  assert.equal(handlers.size, 0)
  assert.deepEqual(fired, [])
})