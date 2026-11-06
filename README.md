# dsh-flash-notify

[![ci](https://github.com/246837984/D1/actions/workflows/ci.yml/badge.svg)](https://github.com/246837984/D1/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A DeepSeek Harness plugin: **when a turn finishes, the taskbar button flashes until you come back.**

Built for the "minimize the window and go watch something else" workflow, so you stop checking whether it is done.

- Turn finished → taskbar button stays highlighted (Windows), or a desktop notification (macOS / Linux)
- **No auto-start, no daemon**: it loads with the harness and disappears when the harness exits
- Silent when the window is already focused
- One flash per finished turn, even when a subagent settles at the same moment
- Node built-ins only — no third-party dependencies, no network access

[中文说明](README.zh.md)

## Platform support

| Platform | Effect | Implementation |
| --- | --- | --- |
| Windows | Taskbar button keeps flashing until the window is activated (WeChat-style) | `FlashWindowEx(FLASHW_ALL \| FLASHW_TIMERNOFG)` |
| macOS | Notification Center banner | `osascript display notification` |
| Linux | Desktop notification | `notify-send` |

On Windows the bundled 12 KB `DshFlash.exe` (`assets/win32/`, auditable C# source) is preferred; when it is missing the plugin falls back to plain PowerShell with the same behaviour and roughly 0.5 s extra start-up cost.

## Install

### Plugin market (recommended)

```powershell
pwsh -File scripts/install-market.ps1   # writes the index URL into the desktop profile (idempotent, backs up the patch)
# restart DeepSeek Harness, then: Plugins -> Discover -> search dsh-flash-notify -> Install
```

Index URL:

```
https://raw.githubusercontent.com/246837984/D1/main/market/index.json
```

> The repository is `D1`; the plugin shows up under its npm name `dsh-flash-notify`.
> The Discover tab comes from the optional bundle `@deepseek-ai/dsh-experimental-plugin-market-bundle`.
> The script tells you if it still needs enabling.

### Install the bundle directly

From the Plugins page, use **install bundle** with:

```
git+https://github.com/246837984/D1.git
```

Or manually (needs pnpm; it is often not on PATH, so `npx pnpm` is safer):

```powershell
cd "$env:USERPROFILE\.dsh\profiles\desktop"
npx pnpm add git+https://github.com/246837984/D1.git
```

Then append `"dsh-flash-notify"` to `dsh.profile.bundles` in that profile's `package.json` and restart.

### Mount the plugin only

Drop the repository at `profiles/desktop/plugins/dsh-flash-notify/` and add to your `cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-flash-notify
      name: ./plugins/dsh-flash-notify/src/index.js
```

## Configuration

Defaults already work. Override in your profile `cordis.patch.yml`:

```yaml
- id: dsh-flash-notify
  config:
    message: Task finished
    debounceMs: 1500
```

| Field | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | master switch |
| `debounceMs` | `1200` | coalescing window in ms |
| `message` | `Task finished` | macOS / Linux notification body |
| `title` | `DeepSeek Harness` | macOS / Linux notification title |
| `useEventBus` | `true` | subscribe to `turn/end` on `session/event` |
| `useCacheWatcher` | `true` | watch session projection snapshots as a fallback |
| `cacheDir` | `~/.dsh/storages/session_projcache/sessions` | snapshot directory |
| `logFile` | `~/.dsh/dsh-flash-notify.log` | plugin log; `null` disables |
| `win32Helper` | bundled `assets/win32/DshFlash.exe` | custom Windows flasher |
| `win32Script` | bundled `src/win32-flash.ps1` | PowerShell fallback |

## How it works

Two independent signals feed one debounced notifier:

1. **Event channel** — `turn/end` on `ctx.on('session/event')`. Exact and instant, wherever the event scope reaches third-party plugins.
2. **Snapshot channel** — DSH rewrites `session-*.json` projections; `turnBoundary.openTurnStartSeq` flips from a number to `null` exactly on `turn/end`. Two small regex reads per change, no internal API.

A single finished turn therefore never flashes twice. The first observation only records a baseline, so a restart never announces an old result.

`FLASHW_TIMERNOFG` makes Windows keep the taskbar button highlighted **until the window is activated** — no polling, no background process.

## Troubleshooting

```powershell
Get-Content "$env:USERPROFILE\.dsh\dsh-flash-notify.log" -Tail 20
```

| Symptom | Check |
| --- | --- |
| No `loaded` line | plugin not mounted: check `dsh.profile.bundles` or the patch entry, then restart |
| `loaded` but no `turn/end` | neither channel fired: confirm the snapshot directory updates, or enable `useEventBus` |
| Flash stops instantly | the window was focused (by design); minimize it and retry |
| No taskbar button at all | the app was closed to the tray instead of minimized |

```powershell
& ".\assets\win32\DshFlash.exe" flash   # manual visual check
```

## Development

```powershell
node --test "test/**/*.test.mjs"          # 25 tests, Node 18+, no deps
node scripts/build-market-index.mjs       # regenerate the market index (needs a commit)
node scripts/verify-market-index.mjs      # validate format 1
pwsh -File scripts/build-win32-helper.ps1 # rebuild the Windows helper from C#
pwsh -File scripts/publish.ps1            # commit -> push -> rebuild index -> verify -> push
```

## License

[MIT](LICENSE)
