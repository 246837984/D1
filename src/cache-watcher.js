/**
 * Fallback turn-end signal: watch DSH's own session projection snapshots.
 *
 * DSH rewrites `~/.dsh/storages/session_projcache/sessions/session-*.json`
 * as a session advances. `turnBoundary.openTurnStartSeq` flips from a number
 * to `null` exactly when `turn/end` is appended, which is a stable,
 * documented-by-observation signal that costs the host one directory watch.
 *
 * @module dsh-flash-notify/cache-watcher
 */

import { readFileSync, readdirSync, statSync, watch } from 'node:fs'
import path from 'node:path'

import { createTurnTracker } from './turn-state.js'

const SUFFIX = '.json'
const PREFIX = 'session-'

/**
 * @typedef {object} CacheWatcherOptions
 * @property {string} dir projection snapshot directory
 * @property {(message: string) => void} log
 * @property {(file: string) => void} onTurnEnd
 * @property {number} [recentMs] baseline only sessions touched this recently
 * @property {number} [settleMs] coalesce filesystem events before reading
 */

export function createCacheWatcher(options) {
  const dir = options.dir
  const log = options.log
  const onTurnEnd = options.onTurnEnd
  const recentMs = options.recentMs ?? 5 * 60 * 1000
  const settleMs = options.settleMs ?? 60

  /** @type {Map<string, ReturnType<typeof createTurnTracker>>} */
  const trackers = new Map()
  const pending = new Set()
  let watcher = null
  let settleTimer = null
  let retryTimer = null
  let disposed = false

  function isSnapshot(name) {
    return typeof name === 'string' && name.startsWith(PREFIX) && name.endsWith(SUFFIX)
  }

  function trackerFor(file) {
    let tracker = trackers.get(file)
    if (!tracker) {
      tracker = createTurnTracker()
      trackers.set(file, tracker)
    }
    return tracker
  }

  function inspect(file) {
    let text
    try {
      text = readFileSync(path.join(dir, file), 'utf8')
    } catch {
      return
    }
    if (trackerFor(file).observe(text)) {
      log(`turn/end (cache) ${file}`)
      onTurnEnd(file)
    }
  }

  function flush() {
    settleTimer = null
    const batch = [...pending]
    pending.clear()
    for (const file of batch) inspect(file)
  }

  function queue(name) {
    if (disposed || !isSnapshot(name)) return
    pending.add(name)
    if (settleTimer) return
    settleTimer = setTimeout(flush, settleMs)
    if (typeof settleTimer.unref === 'function') settleTimer.unref()
  }

  /** Seed trackers from snapshots written recently, so a restart mid-turn stays quiet. */
  function baseline() {
    let names = []
    try {
      names = readdirSync(dir).filter(isSnapshot)
    } catch {
      return false
    }
    const cutoff = Date.now() - recentMs
    let tracked = 0
    for (const name of names) {
      try {
        if (statSync(path.join(dir, name)).mtimeMs < cutoff) continue
      } catch {
        continue
      }
      let text
      try {
        text = readFileSync(path.join(dir, name), 'utf8')
      } catch {
        continue
      }
      const tracker = trackerFor(name)
      tracker.observe(text)
      if (tracker.state() !== null) tracked += 1
    }
    log(`baseline: snapshots=${names.length} tracked=${tracked}`)
    return true
  }

  function detach() {
    if (!watcher) return
    try {
      watcher.close()
    } catch {
      // already closed
    }
    watcher = null
  }

  function scheduleRetry(delayMs) {
    if (disposed || retryTimer) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      if (disposed) return
      if (baseline()) attach()
      else scheduleRetry(5000)
    }, delayMs)
    if (typeof retryTimer.unref === 'function') retryTimer.unref()
  }

  function attach() {
    if (disposed) return
    try {
      watcher = watch(dir, { persistent: false }, (_event, name) => queue(name))
      watcher.on('error', (error) => {
        log(`cache watch error: ${error.message}`)
        detach()
        scheduleRetry(1000)
      })
      log(`watching ${dir}`)
    } catch (error) {
      log(`cache watch failed: ${error.message}`)
      scheduleRetry(5000)
    }
  }

  return {
    start() {
      if (disposed) return
      if (baseline()) attach()
      else scheduleRetry(2000)
    },
    stop() {
      if (disposed) return
      disposed = true
      detach()
      if (settleTimer) {
        clearTimeout(settleTimer)
        settleTimer = null
      }
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      pending.clear()
      trackers.clear()
    },
    /** Visible for tests. */
    inspect,
  }
}
