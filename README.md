# Taskbar flash reminder (dsh-flash-notify)

[![ci](https://github.com/246837984/D1/actions/workflows/ci.yml/badge.svg)](https://github.com/246837984/D1/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A DeepSeek Harness plugin: **when a turn finishes the taskbar button starts flashing — and it goes dark the moment you click back in.**

Built for the "minimize the window and go watch something else" workflow, so you stop checking whether it is done.

- Turn finished → the taskbar button flashes (Windows), or a desktop notification appears (macOS / Linux)
- **Clears the instant you focus the window**; if you never come back it clears itself after ten minutes
- **No auto-start, no daemon**: it loads with the harness and disappears when the harness exits
- Silent when the window is already focused
- One flash per finished turn, even when a subagent settles at the same moment
- Node built-ins only — no third-party dependencies, no network access

[中文说明](README.zh.md)

## Platform support

| Platform | Effect | Implementation |
| --- | --- | --- |
| Windows | Taskbar button flashes, cleared on focus | `FlashWindowEx(FLASHW_ALL \| FLASHW_TIMERNOFG)` + an explicit `FLASHW_STOP` |
| macOS | Notification Center banner | `osascript display notification` |
| Linux | Desktop notification | `notify-send` |

On Windows the bundled 14 KB `DshFlash.exe` (`assets/win32/`, auditable C# source) is preferred; when it is missing the plugin falls back to plain PowerShell with the same behaviour and roughly 0.5 s extra start-up cost.

## Install

### One line (recommended)

Paste this into PowerShell:

```powershell
irm https://raw.githubusercontent.com/246837984/D1/main/install.ps1 | iex
```

It downloads the code, drops it in the right place and writes the config. **Then fully quit DeepSeek Harness and open it again.**

<details>
<summary>What it actually does (in case you prefer to do it by hand)</summary>

1. Downloads and extracts `https://codeload.github.com/246837984/D1/zip/refs/heads/main`
2. Copies it to `%USERPROFILE%\.dsh\profiles\desktop\plugins\dsh-flash-notify\`
3. Appends this to `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` (skipped when already present):

   ```yaml
   - insert:
       - id: dsh-flash-notify
         name: ./plugins/dsh-flash-notify/src/index.js
         config:
           enabled: true
           debounceMs: 1200
   ```

4. If you previously installed it as a bundle (via the market), it only refreshes the files and leaves the config alone, so you never end up with two copies running

</details>

### Let an agent do it

Send one sentence to any coding agent:

```text
Install this DSH plugin: https://github.com/246837984/D1
```

It reads `install.ps1` / this README and finishes the job. If you want to be explicit:

```text
Download https://github.com/246837984/D1 to a temp directory, run install.ps1 from the
repository root, then tell me to restart DeepSeek Harness.
```

### Plugin market (last resort)

Add this index source under **Plugins → Discover** and search for “taskbar flash reminder”:

```
https://cdn.jsdelivr.net/gh/246837984/D1@main/market/index.json
```

It depends on the optional bundle `@deepseek-ai/dsh-experimental-plugin-market-bundle` and on jsDelivr being reachable, which is why it comes last.

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
| `debounceMs` | `1200` | trigger debounce in milliseconds; merges a subagent and the two channels into one reminder |
| `startupGraceMs` | `10000` | startup silence: nothing is announced while the harness is still booting |
| `message` | `Task finished` | macOS / Linux notification body |
| `title` | `DeepSeek Harness` | macOS / Linux notification title |
| `useEventBus` | `true` | subscribe to `turn/end` on `session/event` (zero latency) |
| `useCacheWatcher` | `true` | watch the session projection snapshots (fallback that needs no internal API) |
| `cacheDir` | `~/.dsh/storages/session_projcache/sessions` | directory watched by the fallback channel |
| `logFile` | `~/.dsh/dsh-flash-notify.log` | plugin log; `null` disables it |
| `win32Helper` | bundled `assets/win32/DshFlash.exe` | custom Windows flasher |
| `win32Script` | bundled `src/win32-flash.ps1` | PowerShell fallback |

## How it works

Two independent, mutually backing signals drive one debounced reminder:

1. **Event channel**: `turn/end` from `ctx.on('session/event')`. Exact and zero-latency. A `turn/end` only counts after this run has seen the matching `turn/start`, so replaying restored history at launch never flashes.
2. **Snapshot channel**: the harness writes each session projection to `session-*.json`; the moment `turnBoundary.openTurnStartSeq` flips from a number to `null`, a turn has ended. Two fields, one regex.

When both channels fire, `debounceMs` merges them into a single reminder. The first look only records a baseline, and `startupGraceMs` adds a silence window, so the plugin never flashes for turns that had already finished before it started.

On Windows it sends `FLASHW_TIMERNOFG` and then **keeps watching the window**: as soon as the window becomes foreground it sends an explicit `FLASHW_STOP`. Chromium windows do not reliably clear that highlight themselves — which is exactly why the button used to stay lit after you clicked back in. The watch is bounded to ten minutes and then clears itself, so nothing is left behind.

## Logs and troubleshooting

```powershell
Get-Content "$env:USERPROFILE\.dsh\dsh-flash-notify.log" -Tail 20
Get-Content "$env:USERPROFILE\.dsh\DshFlash.log" -Tail 20
```

A healthy start looks like:

```
[dsh-flash-notify] loaded pid=... platform=win32 backend=win32-helper grace=10000ms
[dsh-flash-notify] baseline: snapshots=... tracked=...
[dsh-flash-notify] watching ...\session_projcache\sessions
```

A finished turn looks like:

```
[dsh-flash-notify] turn/end (event) session=... kind=completed
[dsh-flash-notify] notify: turn-end:completed
```

| Symptom | Check |
| --- | --- |
| No `loaded` line | the plugin is not mounted: verify the patch entry path (`./plugins/dsh-flash-notify/src/index.js`), then restart |
| `loaded` but no `turn/end` | both channels are silent: check that `session_projcache` is being written, or enable `useEventBus` |
| Flashes then stops immediately | the window was in the foreground (by design); minimize it and try again |
| Button stays lit after clicking in | you are on 1.0.0; 1.0.1 clears it — re-run the one-line installer |
| No taskbar button at all | you closed to the tray instead of minimizing to the taskbar |

Manual visual check:

```powershell
$exe = "$env:USERPROFILE\.dsh\profiles\desktop\plugins\dsh-flash-notify\assets\win32\DshFlash.exe"
& $exe flash      # flash once
& $exe clear      # clear immediately
```

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File uninstall.ps1
```

Or by hand: delete `plugins\dsh-flash-notify\`, remove the `- id: dsh-flash-notify` entry from `cordis.patch.yml`, and restart.

## Development

```powershell
node --test                               # 26 tests, Node 18+, no dependencies
node scripts/build-market-index.mjs       # regenerate the market index (commit first)
node scripts/verify-market-index.mjs      # validate against index format 1
powershell -ExecutionPolicy Bypass -File scripts/build-win32-helper.ps1 # rebuild the Windows flasher from C#
```

Layout:

```
install.ps1             one-line installer (UTF-8 BOM, required by PowerShell 5.1)
src/index.js            cordis plugin entry (dual-channel routing, debounce, startup silence)
src/turn-state.js       projection snapshot parser and state machine
src/cache-watcher.js    snapshot directory watcher (fallback channel)
src/notify.js           cross-platform reminder
src/win32-flash.ps1     PowerShell fallback
assets/win32/           Windows flasher source and prebuilt binary
market/index.json       plugin market index (format 1)
scripts/                release, index and build scripts
```

## License

[MIT](LICENSE)