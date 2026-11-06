/**
 * Trailing-edge coalescing for turn-end notifications.
 *
 * A single finished turn can reach the plugin through two channels (the
 * `session/event` bus and the projection-cache watcher) and a subagent may
 * settle at almost the same moment. Every caller inside one window collapses
 * into one notification.
 *
 * @module dsh-flash-notify/debounce
 */

/**
 * @param {(reason: string) => void} fire
 * @param {number} waitMs
 * @param {() => number} [now]
 */
export function createDebouncedTrigger(fire, waitMs, now = Date.now) {
  const window = Math.max(0, Number(waitMs) || 0)
  let last = Number.NEGATIVE_INFINITY
  let timer = null
  let pending = null
  let disposed = false

  function run(reason) {
    last = now()
    if (disposed) return
    fire(reason)
  }

  return {
    /** @param {string} reason */
    trigger(reason) {
      if (disposed) return
      const at = now()
      if (at - last >= window) {
        run(reason)
        return
      }
      pending = reason
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        const next = pending
        pending = null
        if (next !== null) run(next)
      }, Math.max(0, window - (at - last)))
      if (typeof timer.unref === 'function') timer.unref()
    },
    dispose() {
      disposed = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      pending = null
    },
  }
}
