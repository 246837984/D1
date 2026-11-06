# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
