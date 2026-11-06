import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createCacheWatcher } from '../src/cache-watcher.js'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const snapshot = (open, last = 2) =>
  JSON.stringify({ record: { rows: { turnBoundary: { val: { openTurnStartSeq: open, lastTurn: last } } } } })

function tempDir() {
  return mkdtempSync(path.join(os.tmpdir(), 'dsh-flash-cache-'))
}

test('reports a turn that closes while watching', async () => {
  const dir = tempDir()
  const file = path.join(dir, 'session-abc.json')
  writeFileSync(file, snapshot(9))

  const seen = []
  const watcher = createCacheWatcher({
    dir,
    log: () => {},
    onTurnEnd: (name) => seen.push(name),
    settleMs: 20,
  })
  watcher.start()
  await wait(150)

  writeFileSync(file, snapshot(null))
  await wait(600)
  watcher.stop()

  assert.deepEqual(seen, ['session-abc.json'])
})

test('stays quiet for a session that finished before start', async () => {
  const dir = tempDir()
  const file = path.join(dir, 'session-done.json')
  writeFileSync(file, snapshot(null))

  const seen = []
  const watcher = createCacheWatcher({
    dir,
    log: () => {},
    onTurnEnd: (name) => seen.push(name),
    settleMs: 20,
  })
  watcher.start()
  await wait(150)

  writeFileSync(file, snapshot(null))
  await wait(400)
  watcher.stop()

  assert.deepEqual(seen, [])
})

test('ignores files that are not session snapshots', async () => {
  const dir = tempDir()
  const seen = []
  const watcher = createCacheWatcher({
    dir,
    log: () => {},
    onTurnEnd: (name) => seen.push(name),
    settleMs: 10,
  })
  watcher.start()
  await wait(100)

  writeFileSync(path.join(dir, 'notes.json'), snapshot(3))
  writeFileSync(path.join(dir, 'notes.json'), snapshot(null))
  await wait(300)
  watcher.stop()

  assert.deepEqual(seen, [])
})

test('a missing directory retries instead of throwing', async () => {
  const dir = path.join(tempDir(), 'does-not-exist')
  const watcher = createCacheWatcher({ dir, log: () => {}, onTurnEnd: () => {}, settleMs: 10 })
  assert.doesNotThrow(() => watcher.start())
  await wait(50)
  watcher.stop()
})
