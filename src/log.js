/**
 * Append-only plugin log with a hard size cap.
 *
 * The plugin runs inside the DSH host process, so a log file is the only
 * diagnostic surface users can read after a crash or a silent failure.
 *
 * @module dsh-flash-notify/log
 */

import { appendFileSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * @param {{ file?: string | null, limitBytes?: number }} [options]
 * @returns {(message: string) => void}
 */
export function createLog(options = {}) {
  const file = options.file === undefined ? null : options.file
  const limit = Math.max(4096, Number(options.limitBytes) || 256 * 1024)
  let size = -1

  return function log(message) {
    if (!file) return
    try {
      if (size < 0) {
        try {
          size = statSync(file).size
        } catch {
          size = 0
        }
      }
      if (size > limit) {
        appendFileSync(file, '')
        size = 0
      }
      mkdirSync(path.dirname(file), { recursive: true })
      const line = `${new Date().toISOString()} [dsh-flash-notify] ${message}\n`
      appendFileSync(file, line)
      size += Buffer.byteLength(line)
    } catch {
      // Logging must never break the notification path.
    }
  }
}
