/**
 * Cross-platform "your turn finished" notification.
 *
 * - Windows: flash the DeepSeek Harness taskbar button, which stays highlighted
 *   until the window is activated (WeChat-style). Uses a bundled 12 KB helper
 *   when present, otherwise the pure-PowerShell fallback.
 * - macOS: a Notification Center banner via `osascript`.
 * - Linux: `notify-send` when available.
 *
 * Every child process is detached and unreferenced so the DSH host can exit
 * immediately; a notification never keeps the application alive.
 *
 * @module dsh-flash-notify/notify
 */

import { spawn as nodeSpawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

/** Package root: one level above `src/`. */
export const packageRoot = path.resolve(moduleDir, '..')

const SPAWN_OPTIONS = {
  windowsHide: true,
  detached: true,
  stdio: 'ignore',
}

/** Escape a value for an AppleScript string literal. */
function appleScriptString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * @typedef {object} NotifierOptions
 * @property {NodeJS.Platform} [platform] platform override (tests)
 * @property {(command: string, args: string[], options: object) => object} [spawn] spawn override (tests)
 * @property {(message: string) => void} [log]
 * @property {string} [title] notification title
 * @property {string} [message] notification body
 * @property {string} [helperPath] prebuilt Windows helper
 * @property {string} [scriptPath] PowerShell fallback
 * @property {(reason: string, detail: object) => void} [onSpawn] test hook
 */

export function createNotifier(options = {}) {
  const platform = options.platform ?? process.platform
  const spawn = options.spawn ?? nodeSpawn
  const log = options.log ?? (() => {})
  const title = options.title || 'DeepSeek Harness'
  const message = options.message || 'Task finished'
  const helperPath = options.helperPath ?? path.join(packageRoot, 'assets', 'win32', 'DshFlash.exe')
  const scriptPath = options.scriptPath ?? path.join(moduleDir, 'win32-flash.ps1')

  /** @param {string} command @param {string[]} args */
  function launch(command, args, reason) {
    try {
      const child = spawn(command, args, SPAWN_OPTIONS)
      if (child && typeof child.on === 'function') {
        child.on('error', (error) => log(`spawn ${command} failed: ${error.message}`))
      }
      if (child && typeof child.unref === 'function') child.unref()
      if (options.onSpawn) options.onSpawn(reason, { command, args })
      return true
    } catch (error) {
      log(`spawn ${command} threw: ${error.message}`)
      return false
    }
  }

  const impl = (() => {
    if (platform === 'win32') {
      if (existsSync(helperPath)) {
        return (reason) => launch(helperPath, ['flash'], reason)
      }
      return (reason) =>
        launch(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath],
          reason,
        )
    }
    if (platform === 'darwin') {
      return (reason) =>
        launch(
          'osascript',
          ['-e', `display notification ${appleScriptString(message)} with title ${appleScriptString(title)}`],
          reason,
        )
    }
    if (platform === 'linux') {
      return (reason) => launch('notify-send', ['--app-name', title, title, message], reason)
    }
    return (reason) => {
      log(`no notification backend for platform ${platform} (${reason})`)
      return false
    }
  })()

  return {
    /** @param {string} reason short description recorded in the log */
    notify(reason) {
      const started = impl(reason)
      if (started) log(`notify: ${reason}`)
      return started
    },
    platform,
    backend:
      platform === 'win32'
        ? existsSync(helperPath)
          ? 'win32-helper'
          : 'win32-powershell'
        : platform === 'darwin'
          ? 'macos-notification'
          : platform === 'linux'
            ? 'linux-notify-send'
            : 'none',
  }
}
