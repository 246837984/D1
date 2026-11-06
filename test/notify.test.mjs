import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createNotifier } from '../src/notify.js'

function fakeSpawn(calls) {
  return (command, args) => {
    calls.push({ command, args })
    return { on() {}, unref() {} }
  }
}

function tempFile(name) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dsh-flash-notify-'))
  const file = path.join(dir, name)
  writeFileSync(file, '')
  return file
}

test('windows prefers the bundled helper', () => {
  const helperPath = tempFile('DshFlash.exe')
  const calls = []
  const notifier = createNotifier({
    platform: 'win32',
    helperPath,
    spawn: fakeSpawn(calls),
    log: () => {},
  })
  assert.equal(notifier.backend, 'win32-helper')
  assert.equal(notifier.notify('turn-end'), true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, helperPath)
  assert.deepEqual(calls[0].args, ['flash'])
})

test('windows falls back to powershell when the helper is missing', () => {
  const calls = []
  const notifier = createNotifier({
    platform: 'win32',
    helperPath: path.join(os.tmpdir(), 'dsh-flash-notify-missing-helper.exe'),
    spawn: fakeSpawn(calls),
    log: () => {},
  })
  assert.equal(notifier.backend, 'win32-powershell')
  notifier.notify('turn-end')
  assert.equal(calls[0].command, 'powershell.exe')
  assert.ok(calls[0].args.includes('-NoProfile'))
  assert.ok(calls[0].args.includes('-File'))
  assert.ok(String(calls[0].args.at(-1)).endsWith('win32-flash.ps1'))
})

test('macOS posts a notification through osascript', () => {
  const calls = []
  const notifier = createNotifier({
    platform: 'darwin',
    message: 'Task "done"',
    spawn: fakeSpawn(calls),
    log: () => {},
  })
  assert.equal(notifier.backend, 'macos-notification')
  notifier.notify('turn-end')
  assert.equal(calls[0].command, 'osascript')
  assert.equal(calls[0].args[0], '-e')
  assert.match(calls[0].args[1], /display notification/)
  assert.match(calls[0].args[1], /\\"done\\"/)
})

test('linux uses notify-send', () => {
  const calls = []
  const notifier = createNotifier({ platform: 'linux', spawn: fakeSpawn(calls), log: () => {} })
  assert.equal(notifier.backend, 'linux-notify-send')
  notifier.notify('turn-end')
  assert.equal(calls[0].command, 'notify-send')
})

test('an unknown platform is a silent no-op', () => {
  const calls = []
  const notifier = createNotifier({ platform: 'aix', spawn: fakeSpawn(calls), log: () => {} })
  assert.equal(notifier.backend, 'none')
  assert.equal(notifier.notify('turn-end'), false)
  assert.equal(calls.length, 0)
})

test('a throwing spawn never escapes', () => {
  const notifier = createNotifier({
    platform: 'linux',
    spawn: () => {
      throw new Error('boom')
    },
    log: () => {},
  })
  assert.equal(notifier.notify('turn-end'), false)
})
