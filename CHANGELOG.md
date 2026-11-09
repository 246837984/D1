# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-11-09

### Fixed

- The taskbar no longer flashes in the middle of a task. The projection watcher sees
  every session file, including subagents and background conversations, so a subagent
  finishing used to look like the user's own turn being done. It now stays silent while
  the event channel is alive and only takes over when that channel never speaks.
- Log lines now name the channel that fired (`[event]` / `[cache]` / `suppressed`), so a
  future misfire can be traced to its source in one glance.
## [1.0.1] - 2026-11-06

### Fixed

- The taskbar highlight no longer stays lit after the window is clicked back into.
  `FLASHW_TIMERNOFG` does not reliably clear itself on Chromium windows, so the helper now
  watches for the window becoming foreground and sends `FLASHW_STOP` explicitly. A bounded
  follow window (10 minutes) also clears a highlight nobody came back for.
- A turn that ends while the app is still booting no longer flashes. The event channel only
  accepts a `turn/end` after this run has seen its `turn/start`, and a startup grace window
  (10 s, `startupGraceMs`) absorbs anything a host replays during launch.

### Added

- `DshFlash.exe clear` stops a running highlight immediately.
- `DshFlash.exe flash --follow=MS` / `--no-follow` control the follow-and-clear window.
## [Unreleased]

## [1.0.0] - 2026-11-05

### Added

- Cordis plugin that flashes the Windows taskbar button when a DSH turn ends,
  and posts a desktop notification on macOS and Linux.
- Dual signal sources: `turn/end` on the `session/event` bus, plus a fallback
  watcher over DSH session projection snapshots.
- Trailing-edge debounce so a turn and its subagents produce a single reminder.
- Windows: bundled 12 KB `DshFlash.exe` (`FlashWindowEx` with
  `FLASHW_ALL | FLASHW_TIMERNOFG`) and a pure-PowerShell fallback.
- Plugin market index (format 1) with a generator and offline validator.
- `scripts/publish.ps1` for commit → push → index refresh, and
  `scripts/install-market.ps1` to point a profile at the index.
- Test suite covering turn-state parsing, debounce coalescing, cache watching,
  notification backends and plugin wiring (25 tests, no dependencies).

[Unreleased]: https://github.com/246837984/D1/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/246837984/D1/releases/tag/v1.0.0
