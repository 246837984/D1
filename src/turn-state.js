/**
 * Turn-state parsing for DSH session projection snapshots.
 *
 * A DSH session projection JSON carries `turnBoundary.openTurnStartSeq`:
 * a number while a turn is running, and `null` once `turn/end` has been
 * appended. Reading that field is the fallback signal for hosts where the
 * `session/event` bus is not visible to third-party plugins.
 *
 * @module dsh-flash-notify/turn-state
 */

/** @type {RegExp} */
export const OPEN_TURN = /"openTurnStartSeq"\s*:\s*(null|\d+)/

/** @type {RegExp} */
export const LAST_TURN = /"lastTurn"\s*:\s*(\d+)/

/**
 * @typedef {true | false | 'idle' | null} TurnState
 *   `true`  - a turn is running
 *   `false` - a turn just finished and at least one turn exists
 *   `idle`  - no turn is running, but this session never had one
 *   `null`  - unreadable / unexpected payload
 */

/**
 * Parse the turn state out of a projection snapshot's text.
 * Only two small fields are read, so a 6 KB snapshot costs one regex pass.
 *
 * @param {string} text projection JSON text
 * @returns {TurnState}
 */
export function parseTurnState(text) {
  if (typeof text !== 'string' || text.length === 0) return null
  const open = OPEN_TURN.exec(text)
  if (!open) return null
  if (open[1] !== 'null') return true
  const last = LAST_TURN.exec(text)
  if (!last) return null
  const turn = Number(last[1])
  if (!Number.isSafeInteger(turn) || turn <= 0) return 'idle'
  return false
}

/**
 * Track one file's state and report only the running -> finished edge.
 * The first observation is recorded without firing, so a plugin that starts
 * mid-turn does not announce a turn that ended before it was loaded.
 *
 * @returns {{ observe(text: string): boolean, state(): TurnState }}
 */
export function createTurnTracker() {
  /** @type {TurnState} */
  let previous = null
  let seen = false
  return {
    observe(text) {
      const next = parseTurnState(text)
      if (next === null || next === 'idle') return false
      const fired = seen && previous === true && next === false
      previous = next
      seen = true
      return fired
    },
    state() {
      return previous
    },
  }
}
