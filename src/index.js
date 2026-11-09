/**
 * dsh-flash-notify — get a taskbar flash (or a desktop notification) the moment
 * a DeepSeek Harness turn finishes, so you notice while the window is minimized.
 *
 * Two signals, in strict priority order:
 *
 *  1. `session/event` -> `turn/end` (exact, zero latency). The harness only emits
 *     this for the conversation the user is actually looking at, so subagents and
 *     background sessions never flash. A `turn/end` only counts after this run has
 *     seen its `turn/start`, so replayed history at launch never flashes.
 *  2. the session projection snapshot watcher — a fallback for harness builds that
 *     do not surface the event. It watches every session file, so it would also fire
 *     for subagents; it therefore stays silent for as long as the event channel is
 *     alive, and only takes over when the event channel never spoke.
 *
 * Both feed one debounced notifier, so a single finished turn never flashes twice.
 * A startup grace window absorbs anything a host replays while it boots.
 *
 * @module dsh-flash-notify
 */

import os from 'node:os'
import path from 'node:path'

import { createCacheWatcher } from './cache-watcher.js'
import { createDebouncedTrigger } from './debounce.js'
import { createLog } from './log.js'
import { createNotifier } from './notify.js'

export const name = 'dsh-flash-notify'
export const inject = []

const DEFAULTS = {
  enabled: true,
  debounceMs: 1200,
  startupGraceMs: 10000,
  title: 'DeepSeek Harness',
  message: 'Task finished',
  useEventBus: true,
  useCacheWatcher: true,
  logLimitBytes: 256 * 1024,
}

function homeDir() {
  return process.env.USERPROFILE || os.homedir()
}

/** @param {Record<string, unknown>} [raw] */
export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULTS, ...(raw || {}) }
  const home = homeDir()
  config.debounceMs = Math.max(0, Number(config.debounceMs) || 0)
  config.startupGraceMs = Math.min(120000, Math.max(0, Number(config.startupGraceMs) || 0))
  config.logLimitBytes = Math.max(4096, Number(config.logLimitBytes) || DEFAULTS.logLimitBytes)
  config.title = String(config.title || DEFAULTS.title)
  config.message = String(config.message || DEFAULTS.message)
  config.enabled = config.enabled !== false
  config.useEventBus = config.useEventBus !== false
  config.useCacheWatcher = config.useCacheWatcher !== false
  config.cacheDir = String(
    config.cacheDir || path.join(home, '.dsh', 'storages', 'session_projcache', 'sessions'),
  )
  config.logFile = config.logFile === null ? null : String(config.logFile || path.join(home, '.dsh', 'dsh-flash-notify.log'))
  return config
}

/**
 * Cordis plugin entry.
 *
 * @param {{ on: Function }} ctx
 * @param {Record<string, unknown>} [config]
 */
export function apply(ctx, config) {
  const options = normalizeConfig(config)
  const log = createLog({ file: options.logFile, limitBytes: options.logLimitBytes })

  if (!options.enabled) {
    log('disabled by config')
    return
  }

  const startedAt = Date.now()
  let sawTurnStart = false
  let eventChannelAlive = false

  const notifier = options.notifierFactory
    ? options.notifierFactory({ log, title: options.title, message: options.message })
    : createNotifier({
        log,
        title: options.title,
        message: options.message,
        helperPath: options.win32Helper,
        scriptPath: options.win32Script,
      })
  log(`loaded pid=${process.pid} platform=${notifier.platform} backend=${notifier.backend} grace=${options.startupGraceMs}ms`)

  const trigger = createDebouncedTrigger((reason) => notifier.notify(reason), options.debounceMs)

  /**
   * Everything a host replays while it boots arrives here. A finished turn from a
   * previous run must not light the taskbar up just because the app was opened.
   */
  function fire(reason, source) {
    const age = Date.now() - startedAt
    if (age < options.startupGraceMs) {
      log(`suppressed (startup grace ${age}ms): ${reason} [${source}]`)
      return
    }
    trigger.trigger(reason)
  }

  if (options.useEventBus) {
    try {
      ctx.on('session/event', (session, event) => {
        if (!event) return
        if (event.type === 'turn/start') {
          sawTurnStart = true
          eventChannelAlive = true
          return
        }
        if (event.type !== 'turn/end') return

        eventChannelAlive = true
        const id = (session && session.id) || '?'
        if (!sawTurnStart) {
          log(`turn/end without a live turn/start (restored history) session=${id} -> ignored`)
          return
        }
        const kind = event.data && event.data.reason && event.data.reason.kind
        log(`turn/end (event) session=${id} kind=${kind || 'unknown'}`)
        fire(`turn-end:${kind || 'unknown'}`, 'event')
      })
    } catch (error) {
      log(`event channel unavailable: ${error.message}`)
    }
  }

  let watcher = null
  if (options.useCacheWatcher) {
    watcher = createCacheWatcher({
      dir: options.cacheDir,
      log,
      onTurnEnd: (file) => {
        /*
         * The projection watcher sees every session, including subagents and
         * background conversations. Once the event channel has proven it works, this
         * channel would only add false flashes for turns the user is still waiting on,
         * so it stays quiet.
         */
        if (eventChannelAlive) {
          log(`turn/end (cache) suppressed: event channel is live (${file})`)
          return
        }
        fire('turn-end:cache', 'cache')
      },
    })
    watcher.start()
  }

  function cleanup() {
    try {
      if (watcher) watcher.stop()
    } catch {
      // ignore
    }
    trigger.dispose()
    log('disposed')
  }

  try {
    ctx.on('dispose', cleanup)
  } catch {
    // hosts without a dispose event end the watcher when the process exits
  }
}

export default apply