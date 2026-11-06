/**
 * dsh-flash-notify — get a taskbar flash (or a desktop notification) the moment
 * a DeepSeek Harness turn finishes, so you notice while the window is minimized.
 *
 * Two independent signals so the reminder works on every harness build:
 *
 *  1. `session/event` -> `turn/end` (exact, zero latency). Visible to plugins
 *     that live in the session's event scope.
 *  2. the session projection snapshot watcher (fallback, no internal API).
 *
 * Both feed one debounced notifier, so a single finished turn never flashes twice.
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

  const notifier = options.notifierFactory
    ? options.notifierFactory({ log, title: options.title, message: options.message })
    : createNotifier({
        log,
        title: options.title,
        message: options.message,
        helperPath: options.win32Helper,
        scriptPath: options.win32Script,
      })
  log(`loaded pid=${process.pid} platform=${notifier.platform} backend=${notifier.backend}`)

  const trigger = createDebouncedTrigger((reason) => notifier.notify(reason), options.debounceMs)

  if (options.useEventBus) {
    try {
      ctx.on('session/event', (session, event) => {
        if (!event || event.type !== 'turn/end') return
        const kind = event.data && event.data.reason && event.data.reason.kind
        log(`turn/end (event) session=${(session && session.id) || '?'} kind=${kind || 'unknown'}`)
        trigger.trigger(`turn-end:${kind || 'unknown'}`)
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
      onTurnEnd: () => trigger.trigger('turn-end:cache'),
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
